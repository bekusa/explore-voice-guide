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
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(variant)}` +
      `&inputtype=textquery&fields=photos&key=${GOOGLE_KEY}`;

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
async function wikipediaPhoto(q: string, lang: string): Promise<string | null> {
  const langs = lang === "en" ? ["en"] : [lang, "en"];

  for (const l of langs) {
    try {
      // Step 1 — find the best matching page title
      const searchUrl =
        `https://${l}.wikipedia.org/w/api.php` +
        `?action=query&format=json&list=search` +
        `&srsearch=${encodeURIComponent(q)}&srlimit=1&origin=*`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = (await searchRes.json()) as WikiSearchResponse;
      const title = searchData.query?.search?.[0]?.title;
      if (!title) continue;

      // Step 2 — get summary with thumbnail
      const summaryUrl =
        `https://${l}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title);
      const summaryRes = await fetch(summaryUrl);
      if (!summaryRes.ok) continue;
      const summaryData = (await summaryRes.json()) as WikiSummaryResponse;
      const src = summaryData.thumbnail?.source ?? summaryData.originalimage?.source ?? null;
      if (src) return src;
    } catch {
      // try next language
    }
  }
  return null;
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

        if (!q) {
          return new Response(JSON.stringify({ url: null }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const cacheKey = `${lang}:${city ?? ""}:${q}`;
        if (cache.has(cacheKey)) {
          return new Response(JSON.stringify({ url: cache.get(cacheKey) ?? null }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        let photoUrl: string | null = null;
        try {
          photoUrl = await googlePhoto(q, city);
        } catch {
          // fall through to Wikipedia
        }

        if (!photoUrl) {
          try {
            photoUrl = await wikipediaPhoto(q, lang);
          } catch {
            // give up — frontend will show the MapPin placeholder
          }
        }

        cache.set(cacheKey, photoUrl);
        return new Response(JSON.stringify({ url: photoUrl }), {
          headers: {
            "Content-Type": "application/json",
            // Browser-side cache for 1 day; server-side cache (above) is
            // process-lifetime.
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
