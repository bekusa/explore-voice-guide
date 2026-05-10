import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side photo lookup proxy.
 *
 * Why server-side: Lovable's default CSP blocks `eval`, which breaks the
 * Google Maps JS SDK's PlacesService. Calling the Google Places HTTP API
 * directly from our server avoids the SDK entirely — faster (no script
 * load), CSP-safe, and lets us add a Wikipedia fallback.
 *
 * KEY SETUP: This is a *server-side* Google Cloud key, separate from the
 * referrer-restricted browser key. It is restricted by API only (Places
 * API), so the worst-case if leaked is someone burning through Places
 * quota — they can't use it for Maps, Geocoding, etc. Move to env var
 * (GOOGLE_PLACES_KEY) on Lovable to remove from source entirely.
 */
const GOOGLE_KEY =
  (typeof process !== "undefined" && process.env?.GOOGLE_PLACES_KEY) ||
  "AIzaSyCxphS6qlPY55RpWq30UwpNOpwIyavvMJo";

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
        if (intitleTitle) {
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
      const src = await tryWikiSummary(l, title);
      if (src) return src;
    } catch {
      // try next language
    }
  }
  return null;
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
    return summaryData.thumbnail?.source ?? summaryData.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/photo")({
  server: {
    handlers: {
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

        if (!q) {
          return new Response(JSON.stringify({ url: null }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const cacheKey = `${scope ?? ""}:${lang}:${city ?? ""}:${q}`;
        if (cache.has(cacheKey)) {
          return new Response(JSON.stringify({ url: cache.get(cacheKey) ?? null }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        let photoUrl: string | null = null;
        const isArtwork = scope === "artwork";

        // Artworks: Wikipedia only. Skip the Google Places step that
        // keeps polluting results with regional matches.
        if (!isArtwork) {
          try {
            photoUrl = await googlePhoto(q, city);
          } catch {
            // fall through to Wikipedia
          }
        }

        if (!photoUrl) {
          try {
            photoUrl = await wikipediaPhoto(q, lang);
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
        // the original day; misses get short no-store responses so
        // a retry from any client picks up the corrected lookup
        // immediately.
        if (photoUrl) cache.set(cacheKey, photoUrl);
        return new Response(JSON.stringify({ url: photoUrl }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": photoUrl
              ? "public, max-age=86400"
              : "no-store, no-cache, must-revalidate",
          },
        });
      },
    },
  },
});
