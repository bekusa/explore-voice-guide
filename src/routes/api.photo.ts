import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { getCachedPhoto, putCachedPhoto } from "@/lib/sharedCache.server";

/**
 * Server-side photo lookup proxy.
 *
 * Why server-side: Lovable's default CSP blocks `eval`, which breaks the
 * Google Maps JS SDK's PlacesService. Calling the Google Places HTTP API
 * directly from our server avoids the SDK entirely — faster (no script
 * load), CSP-safe, and lets us add a Wikipedia fallback.
 *
 * Key setup: GOOGLE_PLACES_KEY must be set in the Cloudflare Workers
 * environment. We do NOT ship a fallback literal — the committed key
 * fallback that lived here previously was flagged by the pre-Capacitor
 * security review (App Store reviewers grep for the `AIzaSy` prefix on
 * Google API keys in submitted code, and the key sat in plaintext in
 * a public GitHub repo). The literal has been removed and the
 * compromised key needs rotation in Google Cloud Console.
 *
 * If the env var isn't set, googlePhoto() short-circuits to null and
 * the Wikipedia path still works — Google Places is only the fallback
 * for places Wikipedia doesn't cover.
 */
const GOOGLE_KEY =
  typeof process !== "undefined" ? (process.env?.GOOGLE_PLACES_KEY ?? "") : "";

// Allowlist of Wikipedia language subdomains. Used to gate the `lang`
// query parameter before it's interpolated into outbound fetch URLs
// (SSRF guard — without it `?lang=evil.com/x` would coerce the Worker
// into fetching attacker-controlled hosts via `https://${lang}.wikipedia.org/...`).
const ALLOWED_WIKI_LANGS = new Set([
  "en","ka","es","fr","de","it","pt","nl","pl","sv","nb","da","fi","cs","el",
  "hu","ro","ru","uk","tr","ar","he","fa","hi","bn","ur","id","ms","th","vi",
  "ja","ko","zh",
]);
export function sanitizeWikiLang(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const base = raw.toLowerCase().split("-")[0];
  return ALLOWED_WIKI_LANGS.has(base) ? base : fallback;
}

// Per-worker in-memory cache (resets on cold start, but cheap on a hot worker).
const cache = new Map<string, string | null>();

type FindPlaceResponse = {
  candidates?: Array<{
    photos?: Array<{ photo_reference: string }>;
  }>;
  status?: string;
};

type WikiSearchResponse = {
  query?: { search?: Array<{ title: string }> };
};

type WikiSummaryResponse = {
  thumbnail?: { source: string };
  originalimage?: { source: string };
  /** Short tagline from Wikidata, e.g. "1937 novel by Kurban Said" or
   *  "Statue in Batumi, Georgia". We use this to reject summaries whose
   *  topic is clearly a non-place (a book, film, song, …) when the
   *  caller is looking for a physical attraction. */
  description?: string;
  type?: string;
  title?: string;
};

/**
 * Google Places photo lookup. Tries multiple query variants because
 * Google's `findplacefromtext` is sensitive to query wording — a bare
 * Georgian name often misses, but adding the city ("ბოტანიკური ბაღი
 * Batumi") usually disambiguates well.
 */
async function googlePhoto(q: string, city: string | null): Promise<string | null> {
  // Short-circuit when GOOGLE_PLACES_KEY isn't set. The committed
  // literal that used to backstop this was removed in the pre-Capacitor
  // security pass; without the env var we just skip the Google path
  // and let Wikipedia (called earlier in the dispatch chain) carry the
  // lookup. That's already where 80%+ of attractions resolve.
  if (!GOOGLE_KEY) return null;
  // Build query variants in priority order. If city is provided AND the
  // name doesn't already contain it, try "name + city" first.
  const variants: string[] = [];
  if (city && !q.toLowerCase().includes(city.toLowerCase())) {
    variants.push(`${q} ${city}`);
  }
  variants.push(q);

  for (const variant of variants) {
    // `locationbias=ipbias` neutralises the API key's region setting.
    // Beka's Google Cloud project is registered in Georgia, so bare
    // findplacefromtext calls were ranking Tbilisi-area matches above
    // anything we passed via the city query (Liberty Bank for "Liberty
    // Leading the People", a Tbilisi suburb for "The Lacemaker"). With
    // ipbias the request gets re-biased to whichever Cloudflare edge
    // node served it — globally neutral. The "name + city" variant
    // stays in the input string so legitimate Tbilisi searches still
    // win when the city is Tbilisi.
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(variant)}` +
      `&inputtype=textquery&fields=photos&locationbias=ipbias&language=en&key=${GOOGLE_KEY}`;

    const findRes = await fetch(findUrl);
    if (!findRes.ok) continue;
    const findData = (await findRes.json()) as FindPlaceResponse;
    const photoRef = findData.candidates?.[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) continue;

    // /place/photo returns a 302 to lh3.googleusercontent.com — read
    // Location header and return it so the browser fetches directly.
    const photoUrl =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=600&photo_reference=${photoRef}&key=${GOOGLE_KEY}`;
    const photoRes = await fetch(photoUrl, { redirect: "manual" });
    const location = photoRes.headers.get("Location");
    if (location) return location;
  }
  return null;
}

/**
 * Wikipedia fallback. Two-step strategy because Action API's pageimages
 * misses many articles that DO have lead images:
 *
 *   1. action=query&list=search → find the most relevant page title
 *   2. /api/rest_v1/page/summary/{title} → fetch summary which includes
 *      thumbnail more reliably (it returns lead image from infobox OR
 *      first image in the article body)
 *
 * Tries the user's language first, then English (much wider coverage).
 */
// Wikipedia API etiquette requires a descriptive User-Agent string
// per https://meta.wikimedia.org/wiki/User-Agent_policy. Without it
// requests get rate-limited or rejected outright with no body —
// which is exactly what hit Beka after the artwork-scope rollout
// (Cloudflare workers default to a generic UA that Wikipedia treats
// as a misbehaving bot). Identifies the app + a contact email so
// the foundation can reach us if we ever start hammering them.
const WIKI_USER_AGENT = "LokaliApp/1.0 (https://lokali.ge; contact@lokali.ge)";
const WIKI_HEADERS: HeadersInit = { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" };

/**
 * Met Museum collection lookup. Their public API
 * (https://collectionapi.metmuseum.org/public/collection/v1) is
 * unauthenticated, generous on rate limits, and returns curator-
 * attributed photos of every object in the collection — the
 * authoritative source for any artwork actually held at the Met.
 *
 * Two-step:
 *   1. /search?q={name}&isHighlight=true → first-page list of
 *      objectIDs. The `isHighlight` filter keeps the candidates
 *      tight and biases toward the museum's signature works.
 *   2. /objects/{id} → full record including `primaryImage` and
 *      `primaryImageSmall`. We prefer the small one (~ 600 px wide,
 *      fast load, sized roughly like the highlight card thumbnail).
 *
 * Returns null on any miss / failure so the caller falls through
 * to Wikipedia just like before. Beka asked for the museum's own
 * site to take priority for accuracy — this is the first museum
 * to land; British Museum / Louvre / Tate can follow once we
 * confirm the Met path works in production.
 */
type MetSearchResponse = { total?: number; objectIDs?: number[] | null };
type MetObjectResponse = {
  primaryImage?: string;
  primaryImageSmall?: string;
  isHighlight?: boolean;
};

async function metMuseumPhoto(q: string): Promise<string | null> {
  try {
    const searchUrl =
      `https://collectionapi.metmuseum.org/public/collection/v1/search` +
      `?q=${encodeURIComponent(q)}&isHighlight=true`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as MetSearchResponse;
    const ids = searchData.objectIDs ?? [];
    if (!ids.length) return null;

    // Walk the first few candidates; the API ranks highlights by
    // relevance but the top match occasionally has no image (e.g.
    // an entry that's just a curator's note). Three retries is
    // plenty — most highlights resolve on the first hit.
    for (const id of ids.slice(0, 3)) {
      const objRes = await fetch(
        `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
      );
      if (!objRes.ok) continue;
      const obj = (await objRes.json()) as MetObjectResponse;
      const url = obj.primaryImageSmall || obj.primaryImage;
      if (url) return url;
    }
  } catch {
    /* swallow — fall through to Wikipedia */
  }
  return null;
}

/**
 * Maps an arbitrary museum name to a known museum-specific photo
 * lookup. Returns null when we don't have a dedicated path for
 * the museum (most of them today — only Met is wired up so far).
 * Beka wants to expand this list; Louvre, British Museum, MoMA,
 * Tate, Uffizi, etc. all have programmatic image sources we can
 * add the same way.
 */
async function museumOwnPhoto(museum: string, q: string): Promise<string | null> {
  const m = museum.toLowerCase();
  // Met Museum — accept any name that mentions "metropolitan museum"
  // or "the met" (the dataset has it as "Metropolitan Museum of Art").
  if (m.includes("metropolitan museum") || /\bthe met\b/i.test(museum)) {
    return metMuseumPhoto(q);
  }
  return null;
}

type WikiLookupOpts = {
  /** Caller is looking up a museum artwork — flip accept/reject
   *  rules so paintings, sculptures, and drawings PASS (instead of
   *  being filtered out by the generic isNonPlaceTopic gate) and
   *  villages, towns, biblical sites, panoramas, museum-self
   *  articles are REJECTED. */
  isArtwork?: boolean;
  /** Name of the museum hosting the artwork. Used to reject
   *  Wikipedia hits that landed on the museum's own article
   *  (Beka caught the Louvre pyramid coming back as "The Flood"'s
   *  photo because "The Flood Louvre" full-text-search ranked the
   *  Louvre article ahead of Leonardo's drawing). */
  museumToReject?: string;
  /** Name of the artwork's artist. Used to reject Wikipedia hits
   *  that landed on the ARTIST's biography page (Beka caught
   *  "The Turkish Bath Ingres" → Ingres's portrait photo and
   *  "The Swing Fragonard" → Fragonard's sketch portrait, because
   *  full-text search ranks the painter's biography ahead of the
   *  painting when the query mashes work + artist together with
   *  no disambiguator). */
  artistToReject?: string;
};

async function wikipediaPhoto(
  q: string,
  lang: string,
  opts: WikiLookupOpts = {},
): Promise<string | null> {
  const langs = lang === "en" ? ["en"] : [lang, "en"];

  // Beka observed full-text search misfire: "The Lacemaker Louvre Paris"
  // ranked the Louvre's own Wikipedia page above Vermeer's painting
  // because the Louvre article mentions every famous work it holds,
  // and "Liberty Leading the People" matched a Tbilisi bank because
  // bare-text search ranks any page with "Liberty". Three-stage
  // strategy now tries the most-specific lookup first and only falls
  // back to the noisy text search if nothing else hits.
  //
  // Stage 1 — direct REST summary by exact title. Many famous artworks
  // have a Wikipedia page named exactly the artwork's English title.
  // The summary endpoint returns the lead image without a search step,
  // so disambiguation noise can't push the wrong page to the top.
  //
  // Stage 2 — `srsearch=intitle:"{name}"` requires the phrase in the
  // page title, filtering out any article that just MENTIONS the
  // term in its body (museums, banks, biographies). Helps for items
  // whose canonical Wikipedia title has a parenthetical disambiguator
  // ("The Lacemaker (Vermeer)", "Liberty Leading the People").
  //
  // Stage 3 — original full-text search. Last resort for items that
  // don't have their own article (very rare for top-30 highlights).
  for (const l of langs) {
    // Stage 1: bare exact-title lookup.
    const directTitle = q.trim().replace(/\s+/g, "_");
    const direct = await tryWikiSummary(l, directTitle, opts);
    if (direct) return direct;

    // Stage 2: intitle: phrase search.
    try {
      const intitleSearchUrl =
        `https://${l}.wikipedia.org/w/api.php` +
        `?action=query&format=json&list=search` +
        `&srsearch=${encodeURIComponent(`intitle:"${q}"`)}&srlimit=1&origin=*`;
      const intitleRes = await fetch(intitleSearchUrl, { headers: WIKI_HEADERS });
      if (intitleRes.ok) {
        const intitleData = (await intitleRes.json()) as WikiSearchResponse;
        const intitleTitle = intitleData.query?.search?.[0]?.title;
        // Relevance check — Beka caught Wikipedia's intitle: search
        // landing on a *related* page that happened to share a phrase
        // (e.g. "Burj Khalifa Dubai" matched "Burj Khalifa/Dubai
        // Mall Metro Station" because both phrases appear in the
        // station's full title — the metro photo came back). The
        // article title must share at least one significant word
        // (4+ chars, not a city qualifier) with the query, otherwise
        // we treat the hit as off-topic and fall through.
        if (intitleTitle && titleMatchesQuery(intitleTitle, q)) {
          const fromIntitle = await tryWikiSummary(l, intitleTitle, opts);
          if (fromIntitle) return fromIntitle;
        }
      }
    } catch {
      /* fall through */
    }

    // Stage 3: original full-text search (last resort).
    try {
      const searchUrl =
        `https://${l}.wikipedia.org/w/api.php` +
        `?action=query&format=json&list=search` +
        `&srsearch=${encodeURIComponent(q)}&srlimit=1&origin=*`;
      const searchRes = await fetch(searchUrl, { headers: WIKI_HEADERS });
      if (!searchRes.ok) continue;
      const searchData = (await searchRes.json()) as WikiSearchResponse;
      const title = searchData.query?.search?.[0]?.title;
      if (!title) continue;
      // Same relevance gate — full-text search routinely returns
      // country / continent articles when the query mentions a
      // region (e.g. "Al Fahidi Historical District Dubai" returned
      // "United Arab Emirates" and we shipped the UAE flag as the
      // hero image). Require at least one significant-word overlap.
      if (!titleMatchesQuery(title, q)) continue;
      const src = await tryWikiSummary(l, title, opts);
      if (src) return src;
    } catch {
      // try next language
    }
  }
  return null;
}

/**
 * Relevance gate for Wikipedia search hits. Returns true when the
 * matched article title shares at least one meaningful word (4+
 * chars, lowercase) with the user's query — meaningful here means
 * "not a stop-word, not a city/country qualifier we appended".
 *
 * The intent isn't strict semantic matching; it's a cheap filter
 * that catches the catastrophic misfires Beka kept reporting:
 *   - "Burj Khalifa Dubai"      → "Burj Khalifa/Dubai Mall Metro Station"
 *      (passes: shares "burj", "khalifa" — but those are weak
 *       discriminators because the station also has them in title;
 *       the relevance check alone won't catch this, but stage-1
 *       direct-title lookup will resolve "Burj_Khalifa" first
 *       and short-circuit before stage 2 runs.)
 *   - "Al Fahidi Historical District Dubai" → "United Arab Emirates"
 *      (rejects: no significant overlap; "Dubai" is excluded as a
 *       city qualifier; "Al", "of" too short; result discarded.)
 *
 * We strip city / country qualifiers from the query because those
 * were appended by us for disambiguation — they shouldn't count as
 * "relevance overlap" with a matched title that ALSO mentions the
 * country in a generic way.
 */
function titleMatchesQuery(title: string, query: string): boolean {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "of",
    "in",
    "at",
    "on",
    "to",
    "from",
    "by",
    "an",
    "a",
    "is",
    "as",
    "or",
  ]);
  const significant = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\s]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w));
  const titleWords = new Set(significant(title));
  const queryWords = significant(query);
  if (queryWords.length === 0) return true; // unable to tell — don't reject
  return queryWords.some((w) => titleWords.has(w));
}

/**
 * Fetch the lead image for a single Wikipedia page by exact title.
 * Returns null on 404, disambiguation pages (no thumbnail), or any
 * other failure. Quiet on errors so the caller can keep trying
 * fallback strategies.
 *
 * `opts` carries scope-specific accept / reject rules. When
 * `opts.isArtwork` is true we INVERT several gates — paintings and
 * sculptures by an artist PASS instead of being filtered out, but
 * villages, towns, panoramic views, biblical sites, and the museum's
 * own article get rejected.
 */
async function tryWikiSummary(
  lang: string,
  title: string,
  opts: WikiLookupOpts = {},
): Promise<string | null> {
  try {
    const summaryUrl =
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title);
    const summaryRes = await fetch(summaryUrl, { headers: WIKI_HEADERS });
    if (!summaryRes.ok) return null;
    const summaryData = (await summaryRes.json()) as WikiSummaryResponse;
    // Skip disambiguation pages — their thumbnails are usually wrong
    // or absent; better to fall through to the next strategy and let
    // intitle: pick the most relevant disambiguated page.
    if (summaryData.type === "disambiguation") return null;

    if (opts.isArtwork) {
      // Artwork-scope rejections (Beka's bug catches, 2026-05-20):
      //
      // (a) Museum-self filter. "The Flood Louvre" full-text-search
      //     ranks the Louvre's own article ahead of Leonardo's
      //     drawing because the Louvre article mentions every famous
      //     work. The summary then returns the Louvre pyramid as
      //     the artwork's photo. Reject when the matched title
      //     points at the host museum OR a sibling architecture
      //     article (the Pyramid, the Palace, the Building) — Beka
      //     caught the rejection missing those siblings on his
      //     second pass ("The Lute Player Louvre" landed on the
      //     "Louvre Pyramid" article, which my exact-equality
      //     check failed to reject).
      if (
        opts.museumToReject &&
        summaryData.title &&
        isMuseumSelfHit(summaryData.title, opts.museumToReject)
      ) {
        return null;
      }
      // (a2) Artist-self filter. "The Turkish Bath Ingres" full-
      //      text-search lands on Wikipedia's biography of Ingres
      //      (lead image: a 19th-c portrait photo of the painter)
      //      instead of the painting article. "The Swing Fragonard"
      //      lands on Fragonard's biography (lead image: a sketch
      //      portrait of the artist). Reject when the matched title
      //      is the artist's own name.
      if (
        opts.artistToReject &&
        summaryData.title &&
        isArtistSelfHit(summaryData.title, opts.artistToReject)
      ) {
        return null;
      }
      // (a3) Generic biography filter. Even without knowing the
      //      artist's exact name, Wikipedia's REST description
      //      tags biographies with a year-range lifespan
      //      ("French Neoclassical painter (1780–1867)"). Reject
      //      any summary that looks like a person's bio.
      if (summaryData.description && isPersonBiography(summaryData.description)) {
        return null;
      }
      // (b) Wrong-topic-for-artwork filter. "The Wedding Feast at
      //     Cana" without disambiguation lands on the biblical
      //     village of Cana (described "Town in Northern Israel") →
      //     church photo. "The Calling of Saint Matthew" landed on
      //     a city panorama (description "View of Saint Petersburg")
      //     by the same fall-through. Reject summaries whose
      //     description tags them as a settlement, biblical site,
      //     country, region, or panoramic view when we're looking
      //     for a painting / sculpture / drawing.
      if (
        summaryData.description &&
        isWrongTopicForArtwork(summaryData.description)
      ) {
        return null;
      }
      // NOTE: we deliberately DO NOT run isNonPlaceTopic here — that
      // function rejects "painting by X" / "sculpture by X" /
      // "drawing of …" because the default caller wants a real
      // place. For artwork lookups those descriptions are exactly
      // what we want to ACCEPT. Beka caught "The Wedding Feast at
      // Cana" failing because Wikipedia's correct article carries
      // the description "1562-1563 painting by Veronese", which
      // isNonPlaceTopic blocklisted on "painting" — so the lookup
      // fell through to the biblical Cana village.
    } else if (summaryData.description && isNonPlaceTopic(summaryData.description)) {
      // Standard (non-artwork) path — skip novel/film/song/painting/
      // sculpture topics that happen to share the name of a landmark.
      return null;
    }
    // Prefer the full-resolution `originalimage` over Wikipedia's
    // ~320px `thumbnail`. The thumbnail is enough for tiny result-
    // card icons but it visibly blurs when stretched into the
    // full-bleed city hero (440px tall × ~420px wide on the phone
    // frame, even higher on the desktop preview). Beka caught the
    // pixelation on Tbilisi / Rome / Istanbul landmark slides in
    // the new HeroCarousel. originalimage usually resolves to a
    // 2-4 MP commons file — sharp at any phone resolution, still
    // fine for the 240×96 result-card image because the browser
    // downscales cleanly.
    //
    // Fall back to thumbnail only when the article has no original
    // (rare — mostly disambiguation stubs we'd reject anyway).
    const url = summaryData.originalimage?.source ?? summaryData.thumbnail?.source ?? null;
    // Skip national flag images. Wikipedia's lead image for any
    // country / sovereign-territory article is the flag (filename
    // pattern "Flag_of_…"), and that's what got returned for English
    // city queries that happen to also be a country name —
    // "Singapore", "Monaco", "Vatican City". The card needs a city
    // photo, not a flag, so pretend this hit didn't exist and let
    // the next strategy (city-qualified search, full-text) try.
    if (url && /flag[_ ]of[_ ]/i.test(url)) return null;
    // Commons-only license gate. Wikipedia's `originalimage`
    // happily serves locally-uploaded fair-use images alongside
    // Commons-hosted free ones — fair-use covers movie posters,
    // album art, modern artworks under copyright, brand logos
    // and the like. Redistributing those in our app would be a
    // copyright issue. The URL itself tells us the license tier:
    //   Commons (CC / public domain): /wikipedia/commons/...
    //   Local fair-use:               /wikipedia/<lang>/...     ← reject
    // (Lovable code-review caught this — "Wikipedia REST returns
    // fair-use images; must filter or migrate to Commons API".)
    if (url && !/\/wikipedia\/commons\//.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Returns true when a Wikipedia summary description points at a
 * non-physical topic (book, film, song, etc.). Used to dodge cover
 * art when our query was actually a landmark with the same name.
 *
 * The list mirrors Wikidata's common "instance of" tags surfaced in
 * REST summaries — additions welcome as Beka spots new false hits.
 */
function isNonPlaceTopic(description: string): boolean {
  const d = description.toLowerCase();
  return /\b(novel|book|short story|poem|epic|memoir|film|movie|tv series|television series|series by|series of|episode|song|single|album|ep by|studio album|video game|board game|opera|play|musical|painting|sculpture by|comic|manga|cartoon|podcast|band|song by|song from)\b/.test(
    d,
  );
}

/**
 * Mirror of `isNonPlaceTopic` but tuned for artwork lookups. Wikipedia
 * routinely returns settlement / region / panorama articles when an
 * artwork query falls through full-text search to a place that shares
 * the artwork's title. Examples Beka caught:
 *   - "The Wedding Feast at Cana" → "Town in Northern Israel" (Cana
 *     village) → church photo.
 *   - "The Calling of Saint Matthew" → "View of Saint Petersburg" →
 *     city panorama.
 * Reject any summary whose description tags it as one of these
 * geographic / panoramic topics; the caller falls through to the next
 * candidate query (`name painting`, `name sculpture`, …) which lands
 * on the actual artwork article.
 */
function isWrongTopicForArtwork(description: string): boolean {
  const d = description.toLowerCase();
  // Settlements + regions — towns / villages / cities / countries /
  // provinces. The artwork is never literally a settlement.
  if (/\b(village|town|city|capital|hamlet|borough|municipality|commune|county|province|region|country|district|prefecture|island|peninsula|archipelago|state in|nation in|nation of)\b/.test(d)) {
    return true;
  }
  // Aerial / panoramic views — Wikipedia tags cityscape photos as
  // "View of <city>" or "Panorama of <city>".
  if (/\b(view of|panorama of|panoramic view|aerial view|cityscape)\b/.test(d)) {
    return true;
  }
  // Biblical / religious narrative articles (separate from the
  // artwork they inspired). Cana, Bethlehem, Galilee, … all tag
  // themselves as biblical sites or events.
  if (/\b(biblical site|biblical event|biblical narrative|gospel passage|new testament event|old testament event)\b/.test(d)) {
    return true;
  }
  // Festivals + rituals — sometimes a Wikipedia article exists for
  // the religious feast a painting depicts, separate from the
  // painting itself.
  if (/\b(feast day|feast of|christian festival|religious festival|jewish festival|public holiday)\b/.test(d)) {
    return true;
  }
  // Films / albums / songs / novels / plays. Beka caught Wikipedia
  // returning "La Dentellière" (the 1981 Isabelle Huppert film) for
  // Vermeer's "The Lacemaker", and Santana's album "The Swing of
  // Delight" for Fragonard's "The Swing". These all carry descriptions
  // like "1981 film", "studio album by Santana", "1925 novel by
  // Fitzgerald". The artwork we want has descriptions like
  // "1665 painting by Johannes Vermeer" — we need to keep painting
  // (which is why this filter is separate from isNonPlaceTopic) but
  // reject any media-type that ISN'T a visual artwork.
  if (/\b(\d{4}\s+(?:film|movie|tv film|television film))\b/.test(d)) return true;
  if (/\b(album by|studio album|live album|compilation album|soundtrack|extended play|single by)\b/.test(d)) return true;
  if (/\b(\d{4}\s+(?:novel|play|opera|musical|video game|comic|manga|short story|poem))\b/.test(d)) return true;
  if (/\b(song by|song from|composition by|symphony by)\b/.test(d)) return true;
  // Music groups and bands. Beka caught "The Spinners" (Velázquez's
  // "Las Hilanderas") landing on Wikipedia's article for the Detroit
  // R&B group — the resulting hero photo was five musicians in white
  // suits, not the Prado canvas. Wikipedia summaries tag bands with
  // genre + format compounds: "American R&B group", "British boy band",
  // "Hip-hop trio", "Vocal quartet", etc.
  if (
    /\b(music group|musical group|vocal group|vocal trio|vocal quartet|vocal duo|vocal ensemble|vocal harmony group|rock band|pop band|punk band|metal band|jazz band|jazz ensemble|brass band|funk band|disco band|r ?& ?b group|r ?& ?b trio|r ?& ?b vocal|soul group|soul trio|hip[- ]hop group|hip[- ]hop trio|hip[- ]hop duo|boy band|girl group|boy group|girl band)\b/.test(
      d,
    )
  ) {
    return true;
  }
  // Real-world buildings the artwork DEPICTS (the artwork article and
  // the building article are separate Wikipedia pages). Beka caught
  // "Flatford Mill" returning the actual Suffolk watermill instead of
  // Constable's 1816-17 canvas. The building article describes the
  // physical site ("watermill in Suffolk, England"); the painting
  // article would say "1816-1817 oil painting by John Constable".
  // Reject building descriptions when the same description does NOT
  // also flag a visual-artwork medium — safest gate, doesn't filter
  // out architectural artworks that happen to be themselves famous
  // (e.g. the Sainte-Chapelle interior reproduced as illuminations).
  if (
    /\b(mill in|watermill|windmill|sawmill|manor in|manor house|country house|country estate|cottage in|farmhouse|townhouse|barn in|stable in|inn in|tavern in|warehouse in|factory in|building in|cathedral in|chapel in|church in|monastery in|abbey in|priory in|castle in|fortress in|tower in|bridge in|station in|theatre in|theater in|stadium in|opera house in|residence in|palace in|villa in|garden in|park in)\b/.test(
      d,
    ) &&
    !/\b(painting|sculpture|drawing|fresco|altarpiece|tapestry|engraving|lithograph|mural|watercolor|watercolour|illumination|illustration|etching|pastel|miniature|woodcut|print by|series of paintings|cycle of paintings)\b/.test(
      d,
    )
  ) {
    return true;
  }
  // Historical maps / atlases / charts. Beka caught "The Winged Bull
  // (Lamassu)" returning a Wikipedia map of the Achaemenid Empire —
  // full-text search ranked the historical map ahead of the Lamassu
  // article because the map article mentions winged bulls as imperial
  // iconography. Reject cartographic article descriptions.
  if (
    /\b(map of|atlas of|historical map|world map|map showing|chart of|map depicting|topographic map|administrative map|political map|geographic map|cartographic|empire in|kingdom in|caliphate in|dynasty in)\b/.test(
      d,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Normalise a Wikipedia title (or museum name) for case-insensitive,
 * whitespace-insensitive comparison. Strips diacritics, lowercases,
 * collapses spaces. Used to detect when an artwork's Wikipedia hit
 * actually pointed at the museum hosting it.
 */
function normaliseTitleSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Detect whether a Wikipedia article title actually refers to the
 * museum itself (the building, the campus, the institution) rather
 * than to an artwork in its collection. Beka caught two failure
 * modes my first cut missed:
 *
 *   - Exact equality alone misses sibling architecture articles.
 *     "The Lute Player Louvre" → full-text matched the "Louvre
 *     Pyramid" article (a separate page from "Louvre"), and
 *     `title === "Louvre"` returned false → we shipped the
 *     pyramid as the painting's photo.
 *   - Foreign-language variants. "Musée du Louvre" is the French-
 *     wiki form; in some lookup paths we route there and get back
 *     that title.
 *
 * We accept the museum's name OR the museum's name plus a short
 * architecture / institution suffix as a reject. We also accept
 * common prefixes ("The Louvre", "Musée du Louvre").
 */
/**
 * Detect whether a Wikipedia article title is the ARTIST's own
 * biography rather than the artwork. Wikipedia stores painters under
 * pages like "Jean-Auguste-Dominique Ingres" or "Jean-Honoré
 * Fragonard". A naive "{Work} {Artist}" full-text-search ranks these
 * biographies above the painting article — Beka caught the Ingres
 * portrait coming back for "The Turkish Bath" and Fragonard's sketch
 * for "The Swing".
 *
 * Accept either:
 *   - exact name match (after diacritic / case normalisation), OR
 *   - title that ENDS with the artist's surname AND has 1-3 first-
 *     name tokens ahead of it (handles middle names, hyphenated
 *     given names: "Jean-Auguste-Dominique Ingres" → ends in
 *     "ingres", 3 extra tokens — accept).
 *
 * The artist string is typically the full name, so we also try the
 * trailing surname extracted from it.
 */
function isArtistSelfHit(title: string, artist: string): boolean {
  const t = normaliseTitleSlug(title);
  const a = normaliseTitleSlug(artist);
  if (!t || !a) return false;
  if (t === a) return true;
  // Last-word surname from the artist string ("Jean-Auguste-Dominique
  // Ingres" → "ingres"). Use it for endsWith / equality match.
  const surnameTokens = a.split(" ").filter(Boolean);
  const surname = surnameTokens[surnameTokens.length - 1] ?? "";
  if (!surname || surname.length < 4) return false;
  if (t === surname) return true;
  if (t.endsWith(` ${surname}`)) {
    const extra = t.slice(0, t.length - surname.length).trim().split(/\s+/);
    // Bios have 1–4 first-name tokens; artworks usually have 0
    // (bare title) or many (full phrase). Cap at 4 so a long
    // painting title that happens to end with the surname doesn't
    // get rejected.
    if (extra.length >= 1 && extra.length <= 4) return true;
  }
  return false;
}

/**
 * Reject Wikipedia summaries whose `description` field tags them
 * as a person's biography rather than an artwork. Wikidata
 * descriptions for biographies follow a tight pattern:
 *   - "French Neoclassical painter (1780–1867)"
 *   - "Italian Baroque painter (1593–1656)"
 *   - "Dutch Golden Age painter (b. 1632)"
 *
 * Painting-article descriptions instead read:
 *   - "Painting by Jean-Auguste-Dominique Ingres"
 *   - "1862 painting by Ingres"
 *   - "Oil on canvas painting by Caravaggio"
 *
 * The reliable discriminator is the year-range / "b. YYYY" / "d.
 * YYYY" pattern in parentheses, which biographies have and paintings
 * don't. We also catch "born YYYY" / "died YYYY" inline.
 */
function isPersonBiography(description: string): boolean {
  // (YYYY–YYYY), (YYYY-YYYY), (YYYY‒YYYY), (YYYY−YYYY) — any of the
  // common dash forms Wikipedia / Wikidata use for lifespans.
  if (/\(\s*\d{3,4}\s*[-–—‒−]\s*\d{3,4}\s*\)/.test(description)) return true;
  // (b. YYYY) or (d. YYYY) — "born" / "died" abbreviated forms.
  if (/\(\s*[bd]\.\s*\d{3,4}\b/i.test(description)) return true;
  // Inline "born YYYY" / "died YYYY" — less common but seen in
  // longer Wikidata blurbs.
  if (/\bborn\s+\d{3,4}\b/i.test(description)) return true;
  if (/\bdied\s+\d{3,4}\b/i.test(description)) return true;
  return false;
}

function isMuseumSelfHit(title: string, museum: string): boolean {
  const t = normaliseTitleSlug(title);
  const m = normaliseTitleSlug(museum);
  if (!t || !m) return false;
  if (t === m) return true;
  // Suffix variants — Wikipedia commonly splits famous museums
  // across separate articles for the institution and the building
  // ("Louvre" + "Louvre Pyramid" + "Louvre Palace"). Reject all of
  // those.
  const suffixes = [
    "pyramid",
    "palace",
    "museum",
    "building",
    "main building",
    "complex",
    "campus",
    "hall",
    "gallery",
    "courtyard",
    "entrance",
    "lobby",
    "exterior",
    "facade",
    "rotunda",
    "wing",
  ];
  for (const s of suffixes) {
    if (t === `${m} ${s}`) return true;
    if (t === `${s} ${m}`) return true;
  }
  // Prefix variants — "The Louvre", "Musée du Louvre", "The British
  // Museum", "The Met". We accept any title that ends with the
  // museum name AND has ≤ 3 extra words ahead of it (so a real
  // artwork title that happens to contain the museum's name in a
  // long phrase doesn't get rejected).
  if (t.endsWith(` ${m}`)) {
    const extra = t.slice(0, t.length - m.length).trim().split(/\s+/);
    if (extra.length <= 3) return true;
  }
  // Starts-with variant — "Louvre Museum exterior at night" etc.
  // Same ≤ 3 extra words guard.
  if (t.startsWith(`${m} `)) {
    const extra = t.slice(m.length).trim().split(/\s+/);
    if (extra.length <= 3) return true;
  }
  return false;
}

export const Route = createFileRoute("/api/photo")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q")?.trim();
        const lang = sanitizeWikiLang(url.searchParams.get("lang"), "ka");
        // City context — the original search query (e.g. "Batumi") helps
        // disambiguate generic names like "ბოტანიკური ბაღი" in Google.
        const city = url.searchParams.get("city")?.trim() || null;
        // Scope hint. "artwork" → skip Google Places entirely and go
        // straight to Wikipedia. Beka observed Google Places returning
        // Tbilisi-area matches for highlight names ("Liberty Leading
        // the People" → Liberty Bank, "The Lacemaker" → a Tbilisi
        // suburb) because the project's Places API key is regionally
        // biased and "city=Paris" alone wasn't strong enough to
        // override it. Artworks aren't places — Wikipedia is the
        // right source, period.
        const scope = url.searchParams.get("scope")?.trim() || null;
        // Museum context for artwork-scoped lookups. When we know
        // which museum an artwork belongs to (e.g. "Metropolitan
        // Museum of Art" for a Met highlight), try the museum's
        // own collection API first — Beka asked for those to take
        // priority because Wikipedia matches a wrong picture often
        // enough for canon-named artworks to be misleading.
        const museum = url.searchParams.get("museum")?.trim() || null;
        // Artist context for artwork-scoped lookups. When known, lets
        // /api/photo reject Wikipedia hits that landed on the artist's
        // own biography page — Beka caught "The Turkish Bath Ingres"
        // returning Ingres's portrait photo and "The Swing Fragonard"
        // returning Fragonard's sketch, both because full-text-search
        // ranks the painter's bio ahead of the painting article when
        // the query lumps work + artist together.
        const artist = url.searchParams.get("artist")?.trim() || null;

        if (!q) {
          return corsJson({ url: null });
        }

        const cacheKey = `${scope ?? ""}:${lang}:${city ?? ""}:${museum ?? ""}:${artist ?? ""}:${q}`;
        if (cache.has(cacheKey)) {
          return corsJson({ url: cache.get(cacheKey) ?? null });
        }

        // Persistent Supabase cache — the per-worker in-memory cache
        // above only survives until the worker cold-starts. Without
        // this layer, every cold-worker request paid Google Places
        // $0.024 again even for attractions we'd looked up a thousand
        // times before. Now: first user pays once, every visitor
        // afterward (on any device, any worker) reads the URL from
        // Postgres in ~50 ms. Note we DON'T cache nulls — a server-
        // side fix or new image source shouldn't be pinned behind a
        // stale miss row.
        const persistentKey = {
          name: q,
          scope: scope ?? "",
          city: city ?? "",
          museum: museum ?? "",
        };
        const persisted = await getCachedPhoto(persistentKey);
        if (persisted) {
          cache.set(cacheKey, persisted);
          return corsJson(
            { url: persisted },
            {
              headers: {
                // 30 days — photo URLs at Wikimedia / lh3 (Google
                // Places CDN) are content-addressed, they don't
                // rotate. Bumped from 24 h after Beka caught the
                // re-fetch storms on every cold worker.
                "Cache-Control": "public, max-age=2592000, immutable",
              },
            },
          );
        }

        let photoUrl: string | null = null;
        const isArtwork = scope === "artwork";

        // Stage 0 (artworks only): museum's own collection API.
        // Currently only Met Museum is wired up — see museumOwnPhoto
        // for the dispatch and the planned-additions note.
        if (isArtwork && museum) {
          try {
            photoUrl = await museumOwnPhoto(museum, q);
          } catch {
            /* fall through to Wikipedia */
          }
        }

        // Stage 1 (everything): Wikipedia FIRST. Moved up from the
        // fallback slot per Beka's repeated reports — even with
        // `locationbias=ipbias` Google Places kept returning
        // Tbilisi-area lookalikes ("Grand Palace" → a local
        // restaurant; "The Lacemaker" → a residential street). The
        // bias is baked into the API key's project region in Google
        // Cloud Console, which ipbias doesn't override on every
        // request. Wikipedia is region-neutral and has high-quality
        // lead images for any place / artwork with an article — the
        // vast majority of attractions and museum highlights.
        //
        // ORDER MATTERS: try the BARE query first now (was: with-city
        // first). Famous attractions ("Burj Khalifa", "Eiffel Tower",
        // "Colosseum") have a Wikipedia article at exactly that bare
        // title — the direct REST summary returns the canonical hero
        // photo immediately, before any noisy intitle/fulltext search
        // can drag in a wrong-but-related article. Previously we
        // tried `q + city` first and intitle: matched
        // "Burj Khalifa/Dubai Mall Metro Station" → the wrong photo.
        // The city-qualified lookup is still useful for ambiguous
        // bare names like "Grand Palace" (a disambiguation page),
        // so we keep it as a fallback when bare misses.
        if (!photoUrl) {
          try {
            // Pass scope/museum context down to Wikipedia so the
            // summary handler can apply artwork-specific accept/
            // reject rules (paintings PASS, settlements / panoramas
            // / museum-self articles REJECT). Beka caught a
            // string of Caravaggio + Veronese highlights landing
            // on biblical villages / city panoramas / origami photos
            // because the lookup ran without this context.
            const wikiOpts: WikiLookupOpts = {
              isArtwork,
              museumToReject: museum ?? undefined,
              artistToReject: artist ?? undefined,
            };
            // PARENTHETICAL-INNER FAST PATH: when Claude emits a name
            // like "The Winged Bull (Lamassu)" (against the no-parens
            // prompt rule), the OUTER name routinely lands on a wrong
            // article (Beka caught a Persian-Empire historical map for
            // "The Winged Bull" outer) while the INNER name is usually
            // the canonical Wikipedia title ("Lamassu" resolves cleanly
            // to the Assyrian sculpture article). Try the inner as a
            // standalone query first when it looks like a canonical
            // proper-noun title (1-3 capitalized tokens, no descriptive
            // commas / "by"). The rest of the lookup chain still runs
            // if the inner misses.
            if (isArtwork) {
              const parenMatch = q.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
              if (parenMatch) {
                const inner = parenMatch[2].trim();
                const innerTokens = inner.split(/\s+/);
                const looksLikeCanonical =
                  innerTokens.length >= 1 &&
                  innerTokens.length <= 3 &&
                  /^\p{Lu}/u.test(inner) &&
                  !/^\d/.test(inner) &&
                  !/[,;:]|\bby\b|\bof\b/i.test(inner);
                if (looksLikeCanonical) {
                  photoUrl = await wikipediaPhoto(inner, lang, wikiOpts);
                }
              }
            }
            // ARTWORK-WITH-ARTIST FAST PATH: when we have an artist
            // (museum-highlights always passes one when it knows it),
            // the most reliable Wikipedia lookup is the artist-
            // disambiguated form Wikipedia itself uses for ambiguous
            // titles. Beka's catches that this fixes:
            //   - "The Spinners" alone landed on Wikipedia's Detroit
            //     R&B group, returning a black-and-white photo of
            //     five musicians; the painting article is at
            //     "Las Hilanderas" with an alternate redirect from
            //     "The Spinners (Velázquez)".
            //   - "Flatford Mill" alone landed on the real Suffolk
            //     watermill; Constable's painting article is at
            //     "Flatford Mill (Constable)".
            // We try the parenthetical-disambiguator form first, then
            // a bare "Artist Surname Title" combination, BEFORE
            // falling through to the bare title that mis-resolves.
            // The artist's last token is enough — Wikipedia
            // disambiguators use the surname ("(Vermeer)", "(El
            // Greco)", "(Velázquez)") rather than the full name.
            if (isArtwork && artist) {
              const artistTokens = artist.trim().split(/\s+/).filter(Boolean);
              const artistSurname = artistTokens[artistTokens.length - 1] ?? "";
              if (artistSurname && !q.toLowerCase().includes(artistSurname.toLowerCase())) {
                // 1a) "{Artwork} ({Surname})" — Wikipedia disambiguator
                //     form. Matches articles like
                //     "Flatford Mill (Constable)" exactly.
                photoUrl = await wikipediaPhoto(`${q} (${artistSurname})`, lang, wikiOpts);
                // 1b) "{Artist Full Name} {Artwork}" — for cases
                //     where Wikipedia stores the painting under a
                //     different canonical title, the full-text search
                //     with artist name as a prefix is very specific.
                if (!photoUrl) {
                  photoUrl = await wikipediaPhoto(`${artist} ${q}`, lang, wikiOpts);
                }
              }
            }
            // 2) bare q — catches famous attractions with a canonical
            //    Wikipedia article at the exact title. Runs after the
            //    artwork+artist fast path so the Detroit R&B group
            //    no longer wins for "The Spinners".
            if (!photoUrl) {
              photoUrl = await wikipediaPhoto(q, lang, wikiOpts);
            }
            // 3) q + city — only if bare missed AND we have a city
            //    that isn't already part of the name. Helps when the
            //    bare title resolves to a disambiguation page (e.g.
            //    "Grand Palace") where the city qualifier picks the
            //    right one.
            if (!photoUrl && city && !q.toLowerCase().includes(city.toLowerCase())) {
              photoUrl = await wikipediaPhoto(`${q} ${city}`, lang, wikiOpts);
            }
          } catch {
            /* fall through to Google Places (non-artwork) */
          }
        }

        // Stage 2 (non-artworks only): Google Places as a fallback
        // for places Wikipedia doesn't cover (small businesses,
        // shops, viewpoints). Skipped for artworks — even the
        // fallback shouldn't pollute artwork lookups.
        if (!photoUrl && !isArtwork) {
          try {
            photoUrl = await googlePhoto(q, city);
          } catch {
            // give up — frontend will show the MapPin placeholder
          }
        }

        // Only cache successful lookups. Caching nulls (Wikipedia
        // miss, Google quota error) pinned the wrong answer for a
        // full day on every visitor — Beka caught it after the User-
        // Agent fix shipped: the highlights still showed no photos
        // because every browser was serving the pre-fix `{url:null}`
        // straight from disk cache for 24 h. Successful URLs cache
        // for 30 days; misses get short no-store responses so a
        // retry from any client picks up the corrected lookup
        // immediately.
        if (photoUrl) {
          // Per-worker in-memory cache (fast, resets on cold start).
          cache.set(cacheKey, photoUrl);
          // Persistent Supabase cache (survives worker / browser
          // restarts). MUST be awaited on Cloudflare Workers — the
          // platform cancels pending promises the moment Response is
          // returned, so an unawaited `void putCachedPhoto(...)` got
          // killed before it could write. The other tables
          // (cached_guides / cached_attractions) all await their
          // writes for the same reason; Beka caught the photo write
          // silently dropping rows when this one didn't.
          //
          // Cost: ~50-100 ms added before sending the URL back to
          // the user. Worth it — once written, every subsequent
          // visitor reads from Postgres in ~50 ms and skips the
          // ~12 s Wikipedia / Google round-trip.
          await putCachedPhoto(persistentKey, photoUrl);
        }
        return corsJson(
          { url: photoUrl },
          {
            headers: {
              "Cache-Control": photoUrl
                ? // 30 days, immutable — Wikimedia / Google Places
                  // CDN URLs are content-addressed and don't rotate.
                  // Was 24 h previously, which produced re-fetch
                  // storms every cold worker on the same content.
                  "public, max-age=2592000, immutable"
                : "no-store, no-cache, must-revalidate",
            },
          },
        );
      },
    },
  },
});
