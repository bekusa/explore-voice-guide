/**
 * Curated hero photos for the Home strip's Top Museums row.
 *
 * Same architecture as `cityHeroPhotos.ts` — assets live under
 * `public/images/museums/`, fed by `scripts/download-hero-photos.mjs`
 * which runs against the live `/api/photo` endpoint. Each lookup is
 * by kebab-case slug derived from the museum's English `name` in
 * `src/lib/topMuseums.ts`.
 *
 * Graceful fallback when a file is missing:
 *   `useLazyPlacePhoto` keeps doing its existing job — if the static
 *   URL 404s, the consumer falls through to the dynamic API lookup
 *   exactly as before.
 */
// Museums where the bundled static tile looks bad on mobile (Beka
// flagged 2026-06-03) are intentionally omitted — the absence makes
// `getStaticMuseumHeroUrl` return null, MuseumCard / Top Museums row
// then falls through to /api/photo's dynamic lookup, which generally
// returns a better photo for these.
//
// Omitted:
//   British Museum, Metropolitan Museum of Art, Uffizi Gallery,
//   Musée d'Orsay, MoMA, Acropolis Museum, Reina Sofía, Georgian
//   National Museum, Dimitri Shevardnadze National Gallery, Open Air
//   Museum of Ethnography, Galleria Borghese, National Roman Museum,
//   Pera Museum.
const MUSEUM_HERO_PHOTOS: Record<string, string> = {
  louvre: "/images/museums/louvre.jpg",
  "vatican-museums": "/images/museums/vatican-museums.jpg",
  "state-hermitage-museum": "/images/museums/state-hermitage-museum.jpg",
  "prado-museum": "/images/museums/prado-museum.jpg",
  "national-gallery": "/images/museums/national-gallery.jpg",
  rijksmuseum: "/images/museums/rijksmuseum.jpg",
  "tate-modern": "/images/museums/tate-modern.jpg",
  "egyptian-museum": "/images/museums/egyptian-museum.jpg",
  "national-museum-of-anthropology": "/images/museums/national-museum-of-anthropology.jpg",
  "national-gallery-of-art": "/images/museums/national-gallery-of-art.jpg",
  "pergamon-museum": "/images/museums/pergamon-museum.jpg",
  "topkap-palace-museum": "/images/museums/topkap-palace-museum.jpg",
  "galleria-dell-accademia": "/images/museums/galleria-dell-accademia.jpg",
  "shalva-amiranashvili-museum-of-fine-arts":
    "/images/museums/shalva-amiranashvili-museum-of-fine-arts.jpg",
  "capitoline-museums": "/images/museums/capitoline-museums.jpg",
  "istanbul-archaeology-museums": "/images/museums/istanbul-archaeology-museums.jpg",
  "istanbul-modern": "/images/museums/istanbul-modern.jpg",
};

/** Same slug shape used by `scripts/download-hero-photos.mjs`. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Returns the curated hero URL for a museum name (English baseline),
 * or null when no curated entry exists for that museum. The caller
 * should fall back to `useLazyPlacePhoto` (existing dynamic lookup)
 * on `null`.
 */
export function getStaticMuseumHeroUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = slugify(name);
  return MUSEUM_HERO_PHOTOS[key] ?? null;
}
