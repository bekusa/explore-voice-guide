/**
 * Curated hero photos for the 10 cities on the Home strip.
 *
 * Why this exists:
 *   Hitting `/api/photo` lazily on every fresh visitor + downloading
 *   the originalimage from Wikipedia or Google Places made the Home
 *   strip take ~3-5 s to populate over a mid-tier mobile connection.
 *   Bundling the heroes locally moves them onto Cloudflare's CDN
 *   right next to the user — first paint times drop to ~50 ms.
 *
 * How the assets are produced:
 *   `scripts/download-hero-photos.mjs` reads this list (via mirrored
 *   slugs in the script) and pulls each photo from `/api/photo` on
 *   the live site, then writes them under `public/images/cities/`.
 *   Re-run any time the curated city set changes.
 *
 * Graceful fallback when a file is missing:
 *   CityCard's `<img onError>` flips `staticFailed` and the existing
 *   /api/photo lookup kicks in. So a missing file silently degrades
 *   to the old behaviour (one round-trip), never a broken card.
 *
 * To swap a city's tile to an absolute URL (e.g. Wikipedia thumb,
 * Unsplash hosted, anything else): just put the full `https://…`
 * URL in the value — the helper passes those through unchanged.
 */
const CITY_HERO_PHOTOS: Record<string, string> = {
  // Tbilisi + Rome are curated for the launch hero carousel; both
  // have hand-picked photos under public/images/cities/.
  tbilisi: "/images/cities/tbilisi.jpg",
  rome: "/images/cities/rome.jpg",
  // Istanbul + London removed 2026-06-03 — Beka reported the static
  // tiles weren't loading on mobile. With the static entries absent
  // `getStaticCityHeroUrl` returns null and CityCard falls through
  // to /api/photo, which currently surfaces better photos for these
  // two on the production endpoint than the bundled files did.
  bangkok: "/images/cities/bangkok.jpg",
  paris: "/images/cities/paris.jpg",
  dubai: "/images/cities/dubai.jpg",
  singapore: "/images/cities/singapore.jpg",
  "new-york": "/images/cities/new-york.jpg",
  tokyo: "/images/cities/tokyo.jpg",
};

/**
 * Returns the curated hero URL for a city slug, or null when none is
 * registered. Slugs are matched case-insensitively against the keys
 * above; the caller can pass "Tbilisi", "tbilisi", or "TBILISI" all
 * the same. Multi-word cities ("New York") accept either spaces or
 * dashes — both collapse to the dashed key.
 *
 * The `width` parameter is reserved for the Special:FilePath form
 * we used in the first iteration; for site-relative paths it has no
 * effect (Cloudflare serves whatever the file actually is).
 */
export function getStaticCityHeroUrl(
  slug: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _width = 1024,
): string | null {
  if (!slug) return null;
  const key = slug.toLowerCase().replace(/\s+/g, "-");
  return CITY_HERO_PHOTOS[key] ?? null;
}
