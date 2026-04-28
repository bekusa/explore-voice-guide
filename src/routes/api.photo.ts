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

type WikiResponse = {
  query?: {
    pages?: Record<
      string,
      {
        thumbnail?: { source: string };
        original?: { source: string };
      }
    >;
  };
};

async function googlePhoto(q: string): Promise<string | null> {
  const findUrl =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(q)}` +
    `&inputtype=textquery&fields=photos&key=${GOOGLE_KEY}`;

  const findRes = await fetch(findUrl);
  if (!findRes.ok) return null;
  const findData = (await findRes.json()) as FindPlaceResponse;
  const photoRef = findData.candidates?.[0]?.photos?.[0]?.photo_reference;
  if (!photoRef) return null;

  // The /place/photo endpoint returns a 302 to the actual CDN URL on
  // lh3.googleusercontent.com — read the Location header and return it
  // so the browser fetches the image directly without going through us.
  const photoUrl =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=600&photo_reference=${photoRef}&key=${GOOGLE_KEY}`;
  const photoRes = await fetch(photoUrl, { redirect: "manual" });
  return photoRes.headers.get("Location");
}

async function wikipediaPhoto(
  q: string,
  lang: string,
): Promise<string | null> {
  // Try the user's preferred language first, then English as fallback
  // (Wikipedia coverage in non-English wikis is much narrower).
  const langs = lang === "en" ? ["en"] : [lang, "en"];

  for (const l of langs) {
    try {
      const url =
        `https://${l}.wikipedia.org/w/api.php` +
        `?action=query&format=json` +
        `&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1` +
        `&prop=pageimages&piprop=thumbnail&pithumbsize=600` +
        `&origin=*`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as WikiResponse;
      const pages = data.query?.pages;
      if (!pages) continue;
      const firstPage = Object.values(pages)[0];
      const src =
        firstPage?.thumbnail?.source ?? firstPage?.original?.source ?? null;
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

        if (!q) {
          return new Response(JSON.stringify({ url: null }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const cacheKey = `${lang}:${q}`;
        if (cache.has(cacheKey)) {
          return new Response(
            JSON.stringify({ url: cache.get(cacheKey) ?? null }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        let photoUrl: string | null = null;
        try {
          photoUrl = await googlePhoto(q);
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
