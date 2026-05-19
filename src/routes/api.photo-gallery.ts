import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { getCachedPhoto, putCachedPhoto } from "@/lib/sharedCache.server";

/**
 * /api/photo-gallery — multi-photo lookup for the attraction + museum
 * hero carousels.
 *
 * Why we need a second endpoint: /api/photo returns a single URL (the
 * Wikipedia REST summary's lead image). That gives us ONE photo per
 * landmark, which is what the result-card list and the old static
 * hero wanted. Once Beka asked for a hero carousel on the attraction
 * page ("multi-image switcher, same as the city pages"), we needed a
 * source that returns multiple distinct photos of the same place.
 *
 * Strategy:
 *
 *   1. Resolve the Wikipedia article title that matches the query
 *      (same multi-stage logic as /api/photo: direct exact-title →
 *      intitle: phrase search → full-text search, with city qualifier
 *      retried on miss).
 *
 *   2. Hit /api/rest_v1/page/media-list/{title} which lists every
 *      media file on the article — exterior shots, interior shots,
 *      historical photos, floor plans, flags, signatures, you name
 *      it.
 *
 *   3. Filter aggressively to keep only "real photos of the place":
 *        - raster image type only (drop SVGs, audio, video),
 *        - filename heuristic blocklist for flags, logos, coats of
 *          arms, plans, maps, icons, signatures, diagrams.
 *
 *   4. Return up to 8 unique URLs at highest srcset scale (typically
 *      2x ≈ 1600px wide — sharp on every phone).
 *
 * Caching: we piggyback on the existing `cached_photos` table by
 * setting the `scope` slot of the composite cache key to `gallery` so
 * gallery rows can never collide with single-photo rows even for the
 * same name. The URL column stores the pipe-joined list (newline-
 * separated, since URLs can contain pipes in theory but never
 * newlines).
 */

const WIKI_USER_AGENT =
  "LokaliApp/1.0 (https://lokali-app.lovable.app; contact@lokali.ge)";
const WIKI_HEADERS: HeadersInit = {
  "User-Agent": WIKI_USER_AGENT,
  Accept: "application/json",
};

const MAX_PHOTOS = 8;

type WikiSummaryResponse = {
  title?: string;
  type?: string;
  description?: string;
};

type WikiSearchResponse = {
  query?: { search?: Array<{ title: string }> };
};

type MediaListItem = {
  type?: string;
  title?: string;
  srcset?: Array<{ src?: string; scale?: string }>;
};

type MediaListResponse = {
  items?: MediaListItem[];
};

/**
 * Filenames we never want surfaced as hero shots. Wikipedia's media-
 * list returns EVERY image embedded on the page — country flags
 * (every "Located in" infobox), institution logos, coats of arms,
 * maps, floor plans, signatures, statistical diagrams. We filter by
 * filename substring because Wikipedia's filenames are remarkably
 * consistent (their upload conventions enforce it). Extending the
 * blocklist is the natural way to add new categorical rejects.
 */
function looksLikePhoto(filename: string): boolean {
  const f = filename.toLowerCase();
  // Raster image extensions only — drop svgs, ogg audio, webm video.
  if (!/\.(jpe?g|png|webp|gif)$/.test(f)) return false;
  const reject = [
    "flag_of",
    "flag-of",
    "logo",
    "coat_of_arms",
    "seal_of",
    "emblem",
    "signature",
    "_map",
    "map_",
    "plan_of",
    "floor_plan",
    "floorplan",
    "diagram",
    "icon",
    "graph",
    "chart",
    "spectrum",
    "wikidata",
    "wikimedia",
    "commons-",
    "blank_",
    "question_book",
    "ambox",
  ];
  return !reject.some((r) => f.includes(r));
}

/**
 * Multi-stage Wikipedia title resolver. Mirrors the strategy in
 * api.photo.ts's wikipediaPhoto() — direct exact-title summary,
 * then intitle: search, then full-text. We stop at the first hit
 * that isn't a disambiguation page. Returns null if every stage
 * misses (caller handles by returning an empty gallery).
 */
async function resolveWikiTitle(
  q: string,
  lang: string,
): Promise<{ title: string; lang: string } | null> {
  const langs = lang === "en" ? ["en"] : [lang, "en"];
  for (const l of langs) {
    // Stage 1 — direct exact-title via REST summary.
    const directTitle = q.trim().replace(/\s+/g, "_");
    try {
      const summaryUrl =
        `https://${l}.wikipedia.org/api/rest_v1/page/summary/` +
        encodeURIComponent(directTitle);
      const r = await fetch(summaryUrl, { headers: WIKI_HEADERS });
      if (r.ok) {
        const data = (await r.json()) as WikiSummaryResponse;
        if (data.title && data.type !== "disambiguation") {
          return { title: data.title.replace(/\s+/g, "_"), lang: l };
        }
      }
    } catch {
      /* fall through */
    }

    // Stage 2 — intitle: phrase search. Picks pages whose title
    // contains the phrase; reliable for items with parenthetical
    // disambiguators (e.g. "The Lacemaker (Vermeer)").
    try {
      const url =
        `https://${l}.wikipedia.org/w/api.php?action=query&format=json&list=search` +
        `&srsearch=${encodeURIComponent(`intitle:"${q}"`)}&srlimit=1&origin=*`;
      const r = await fetch(url, { headers: WIKI_HEADERS });
      if (r.ok) {
        const data = (await r.json()) as WikiSearchResponse;
        const title = data.query?.search?.[0]?.title;
        if (title) return { title: title.replace(/\s+/g, "_"), lang: l };
      }
    } catch {
      /* fall through */
    }

    // Stage 3 — full-text search. Last resort.
    try {
      const url =
        `https://${l}.wikipedia.org/w/api.php?action=query&format=json&list=search` +
        `&srsearch=${encodeURIComponent(q)}&srlimit=1&origin=*`;
      const r = await fetch(url, { headers: WIKI_HEADERS });
      if (r.ok) {
        const data = (await r.json()) as WikiSearchResponse;
        const title = data.query?.search?.[0]?.title;
        if (title) return { title: title.replace(/\s+/g, "_"), lang: l };
      }
    } catch {
      /* try next language */
    }
  }
  return null;
}

/**
 * Pull the media-list for one Wikipedia article and pick out the
 * usable hero shots. Returns up to MAX_PHOTOS URLs at the highest
 * resolution available in the srcset (typically 2× → ~1600 px wide).
 */
async function fetchMediaList(title: string, lang: string): Promise<string[]> {
  try {
    const url =
      `https://${lang}.wikipedia.org/api/rest_v1/page/media-list/` +
      encodeURIComponent(title);
    const r = await fetch(url, { headers: WIKI_HEADERS });
    if (!r.ok) return [];
    const data = (await r.json()) as MediaListResponse;
    const items = Array.isArray(data.items) ? data.items : [];
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const item of items) {
      if (item.type !== "image") continue;
      const filename = (item.title || "").replace(/^File:/i, "");
      if (!looksLikePhoto(filename)) continue;
      const set = Array.isArray(item.srcset) ? item.srcset : [];
      if (set.length === 0) continue;
      // srcset is ordered ascending by scale (1×, 1.5×, 2×). Grab the
      // last entry — highest available resolution. Mona Lisa / Louvre
      // articles ship 2× thumbs at ~1600 px wide; sharper than the
      // old REST summary thumbnail and small enough to load fast.
      const best = set[set.length - 1]?.src;
      if (!best) continue;
      const absolute = best.startsWith("//") ? `https:${best}` : best;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      urls.push(absolute);
      if (urls.length >= MAX_PHOTOS) break;
    }
    return urls;
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/api/photo-gallery")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q")?.trim();
        const lang = url.searchParams.get("lang") ?? "en";
        const city = url.searchParams.get("city")?.trim() || null;
        if (!q) return corsJson({ urls: [] });

        // Cache key — scope "gallery" so we never collide with the
        // single-photo cache. Same `getCachedPhoto / putCachedPhoto`
        // helpers as /api/photo, just storing a newline-joined list
        // in the url column. Newlines never appear inside URLs, so
        // splitting is unambiguous on read.
        const persistentKey = {
          name: q,
          scope: "gallery",
          city: city ?? "",
          museum: "",
        };
        const persisted = await getCachedPhoto(persistentKey);
        if (persisted) {
          const urls = persisted.split("\n").filter((u) => u.length > 0);
          return corsJson(
            { urls },
            {
              headers: {
                // 30 days, immutable — same logic as /api/photo. The
                // Wikimedia upload URLs are content-addressed so they
                // don't rotate; once we've found a good set, we want
                // every device to read from Postgres for ~50 ms
                // instead of going back to Wikipedia.
                "Cache-Control": "public, max-age=2592000, immutable",
              },
            },
          );
        }

        // Try bare q first. If that misses AND the caller gave us a
        // city qualifier, retry with "q + city" to disambiguate
        // common landmark names ("Grand Palace" — ambiguous, becomes
        // "Grand Palace Bangkok" → Thailand's royal complex).
        let title = await resolveWikiTitle(q, lang);
        if (!title && city && !q.toLowerCase().includes(city.toLowerCase())) {
          title = await resolveWikiTitle(`${q} ${city}`, lang);
        }
        if (!title) {
          return corsJson(
            { urls: [] },
            { headers: { "Cache-Control": "no-store" } },
          );
        }

        const urls = await fetchMediaList(title.title, title.lang);
        if (urls.length > 0) {
          // Persistent cache (Supabase) — fire-and-await per the
          // /api/photo precedent. Pipe-style newline join keeps the
          // existing url TEXT column shape.
          await putCachedPhoto(persistentKey, urls.join("\n"));
        }
        return corsJson(
          { urls },
          {
            headers: {
              "Cache-Control":
                urls.length > 0
                  ? "public, max-age=2592000, immutable"
                  : "no-store",
            },
          },
        );
      },
    },
  },
});
