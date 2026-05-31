/**
 * Hand-picked Wikipedia Commons hero photos for the 3 launch cities.
 *
 * The Home strip used to hit `/api/photo` lazily on every fresh visitor
 * — even on cold cache, the round-trip + Wikipedia originalimage
 * download (often 3-6 MB) made Tbilisi / Rome / Istanbul cards take
 * ~3-5 s to fill in. Now we ship a stable URL for each, hit from
 * the bundle on first paint, and skip the API trip entirely.
 *
 * Why `Special:FilePath` over a direct `upload.wikimedia.org/.../thumb/...`
 * URL:
 *   - Stable across renames (Wikipedia redirects file-moves under the
 *     old name; the canonical thumb URL doesn't).
 *   - No need to compute the MD5-derived path — just the filename and
 *     desired width.
 *   - One 301 hop adds ~30-80 ms but the redirect target is heavily
 *     edge-cached, so subsequent loads are near-zero. Net is still
 *     dramatically faster than the previous originalimage pull.
 *
 * To swap a city's hero photo:
 *   1. Find the canonical Commons file (Special:Search → File: namespace).
 *   2. Replace the value here with the new filename (with underscores).
 *   3. Confirm the file is freely licensed (CC BY / CC BY-SA / Public
 *      Domain). Fair-use uploads are NOT redistributable in our app.
 *
 * To switch to fully local hosting (drop a .webp / .jpg into
 * `public/images/cities/<slug>.jpg`):
 *   1. Save the file at that path.
 *   2. Change the value here to `"/images/cities/<slug>.jpg"`.
 *   3. The `getStaticCityHeroUrl` helper passes absolute URLs through
 *      unchanged, so the value can be either a Commons filename or a
 *      site-relative path.
 */
const CITY_HERO_WIKI_FILES: Record<string, string> = {
  // Old Tbilisi rooftops with Narikala and Sameba in the background —
  // the same panorama angle the curated /destinations/tbilisi hero
  // uses, so the click-through doesn't feel like a visual jump cut.
  tbilisi: "Panoramic_view_of_Tbilisi_from_Mtatsminda_Park.JPG",
  // Colosseum exterior at golden hour — Wikipedia's lead image for
  // the "Colosseum" article and the most recognisable single shot
  // of Rome.
  rome: "Colosseo_2020.jpg",
  // Hagia Sophia from across the square — flag of Istanbul's
  // skyline. Daytime shot reads well on both light and dark themes.
  istanbul: "Hagia_Sophia_Mars_2013.jpg",
};

const FILEPATH_BASE = "https://commons.wikimedia.org/wiki/Special:FilePath";

/**
 * Returns a stable hero photo URL for the given city slug, or null if
 * we don't have a curated entry for that city. Pass the desired width
 * (default 1024) and Wikipedia will server-side-render the thumbnail.
 *
 * - Bare filenames are wrapped in the Special:FilePath redirect.
 * - Values starting with `/` (site-relative paths to a file inside
 *   `public/`) are returned unchanged.
 * - Values starting with `http` (absolute URLs to a different host)
 *   are also returned unchanged.
 */
export function getStaticCityHeroUrl(slug: string, width = 1024): string | null {
  const value = CITY_HERO_WIKI_FILES[slug.toLowerCase()];
  if (!value) return null;
  if (value.startsWith("/") || value.startsWith("http")) return value;
  return `${FILEPATH_BASE}/${encodeURIComponent(value)}?width=${width}`;
}
