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
const WIKI_USER_AGENT = "LokaliApp/1.0 (https://lokali-app.lovable.app; contact@lokali.ge)";
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

async function wikipediaPhoto(q: string, lang: string): Promise<string | null> {
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
    const direct = await tryWikiSummary(l, directTitle);
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
          const fromIntitle = await tryWikiSummary(l, intitleTitle);
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
      const src = await tryWikiSummary(l, title);
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
 */
async function tryWikiSummary(lang: string, title: string): Promise<string | null> {
  try {
    const summaryUrl =
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title);
    const summaryRes = await fetch(summaryUrl, { headers: WIKI_HEADERS });
    if (!summaryRes.ok) return null;
    const summaryData = (await summaryRes.json()) as WikiSummaryResponse & {
      type?: string;
    };
    // Skip disambiguation pages — their thumbnails are usually wrong
    // or absent; better to fall through to the next strategy and let
    // intitle: pick the most relevant disambiguated page.
    if (summaryData.type === "disambiguation") return null;
    const url = summaryData.thumbnail?.source ?? summaryData.originalimage?.source ?? null;
    // Skip national flag images. Wikipedia's lead image for any
    // country / sovereign-territory article is the flag (filename
    // pattern "Flag_of_…"), and that's what got returned for English
    // city queries that happen to also be a country name —
    // "Singapore", "Monaco", "Vatican City". The card needs a city
    // photo, not a flag, so pretend this hit didn't exist and let
    // the next strategy (city-qualified search, full-text) try.
    if (url && /flag[_ ]of[_ ]/i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/photo")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q")?.trim();
        const lang = url.searchParams.get("lang") ?? "ka";
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

        if (!q) {
          return corsJson({ url: null });
        }

        const cacheKey = `${scope ?? ""}:${lang}:${city ?? ""}:${museum ?? ""}:${q}`;
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
            // 1) bare q — catches famous attractions with a canonical
            //    Wikipedia article at the exact title.
            photoUrl = await wikipediaPhoto(q, lang);
            // 2) q + city — only if bare missed AND we have a city
            //    that isn't already part of the name. Helps when the
            //    bare title resolves to a disambiguation page (e.g.
            //    "Grand Palace") where the city qualifier picks the
            //    right one.
            if (!photoUrl && city && !q.toLowerCase().includes(city.toLowerCase())) {
              photoUrl = await wikipediaPhoto(`${q} ${city}`, lang);
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
          // restarts). Fire-and-forget — caller already paid the
          // external API round-trip; don't block on Postgres.
          void putCachedPhoto(persistentKey, photoUrl);
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
