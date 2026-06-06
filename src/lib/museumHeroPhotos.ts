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
const MUSEUM_HERO_PHOTOS: Record<string, string> = {
  louvre: "/images/museums/louvre.jpg",
  "british-museum": "/images/museums/british-museum.jpg",
  "metropolitan-museum-of-art": "/images/museums/metropolitan-museum-of-art.jpg",
  "vatican-museums": "/images/museums/vatican-museums.jpg",
  "state-hermitage-museum": "/images/museums/state-hermitage-museum.jpg",
  "uffizi-gallery": "/images/museums/uffizi-gallery.jpg",
  "prado-museum": "/images/museums/prado-museum.jpg",
  "national-gallery": "/images/museums/national-gallery.jpg",
  rijksmuseum: "/images/museums/rijksmuseum.jpg",
  "mus-e-d-orsay": "/images/museums/mus-e-d-orsay.jpg",
  "museum-of-modern-art-moma": "/images/museums/museum-of-modern-art-moma.jpg",
  "tate-modern": "/images/museums/tate-modern.jpg",
  "acropolis-museum": "/images/museums/acropolis-museum.jpg",
  "egyptian-museum": "/images/museums/egyptian-museum.jpg",
  "national-museum-of-anthropology": "/images/museums/national-museum-of-anthropology.jpg",
  "national-gallery-of-art": "/images/museums/national-gallery-of-art.jpg",
  "pergamon-museum": "/images/museums/pergamon-museum.jpg",
  "topkap-palace-museum": "/images/museums/topkap-palace-museum.jpg",
  "galleria-dell-accademia": "/images/museums/galleria-dell-accademia.jpg",
  "reina-sof-a": "/images/museums/reina-sof-a.jpg",
  "georgian-national-museum": "/images/museums/georgian-national-museum.jpg",
  "shalva-amiranashvili-museum-of-fine-arts":
    "/images/museums/shalva-amiranashvili-museum-of-fine-arts.jpg",
  "dimitri-shevardnadze-national-gallery":
    "/images/museums/dimitri-shevardnadze-national-gallery.jpg",
  "open-air-museum-of-ethnography": "/images/museums/open-air-museum-of-ethnography.jpg",
  "galleria-borghese": "/images/museums/galleria-borghese.jpg",
  "capitoline-museums": "/images/museums/capitoline-museums.jpg",
  "national-roman-museum": "/images/museums/national-roman-museum.jpg",
  "istanbul-archaeology-museums": "/images/museums/istanbul-archaeology-museums.jpg",
  "istanbul-modern": "/images/museums/istanbul-modern.jpg",
  "pera-museum": "/images/museums/pera-museum.jpg",
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
