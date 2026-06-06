/**
 * Curated hero photos for the Top Museums row + dedicated /museums
 * page. Mirrors `MUSEUMS` in `topMuseums.ts` — both files are updated
 * together when the curated set changes (2026-06-06: new top-15).
 *
 * The image filenames here MUST match the actual files Beka dropped
 * into `public/images/museums/`. Filenames are case-sensitive on
 * Cloudflare's static asset host, so capitalisation matters.
 *
 * Graceful fallback when a file is missing: `useLazyPlacePhoto` keeps
 * doing its existing job — if the static URL 404s, the consumer falls
 * through to the dynamic API lookup exactly as before.
 */
const MUSEUM_HERO_PHOTOS: Record<string, string> = {
  louvre: "/images/museums/Louvre.jpg",
  "the-metropolitan-museum-of-art": "/images/museums/Metropolitan_Museum_of_Art.jpg",
  "metropolitan-museum-of-art": "/images/museums/Metropolitan_Museum_of_Art.jpg",
  "the-british-museum": "/images/museums/British_Museum.jpg",
  "british-museum": "/images/museums/British_Museum.jpg",
  "the-grand-egyptian-museum-gem": "/images/museums/Grand_Egyptian_Museum.jpg",
  "grand-egyptian-museum": "/images/museums/Grand_Egyptian_Museum.jpg",
  "vatican-museums": "/images/museums/Vatican_Museums.jpg",
  "museo-nacional-del-prado": "/images/museums/Museo_Nacional_del_Prado.jpg",
  "galleria-degli-uffizi": "/images/museums/Galleria_degli_Uffizi.jpg",
  rijksmuseum: "/images/museums/Rijksmuseum.jpg",
  "mus-e-d-orsay": "/images/museums/Musee_d_Orsay.jpg",
  "musee-d-orsay": "/images/museums/Musee_d_Orsay.jpg",
  "musee-dorsay": "/images/museums/Musee_d_Orsay.jpg",
  "the-national-gallery": "/images/museums/The_National_Gallery_UK.JPG",
  "national-gallery": "/images/museums/The_National_Gallery_UK.JPG",
  "acropolis-museum": "/images/museums/The_Acropolis_Museum.jpg",
  "national-palace-museum": "/images/museums/National_Palace_Museum.jpg",
  "smithsonian-national-museum-of-natural-history":
    "/images/museums/Smithsonian_National_Museum_of_Natural_History.jpg",
  "smithsonian-natural-history":
    "/images/museums/Smithsonian_National_Museum_of_Natural_History.jpg",
  "national-museum-of-anthropology": "/images/museums/Musee_National_Anthropologie.jpg",
  "the-museum-of-modern-art-moma": "/images/museums/The_Museum_of_Modern_Art_(MoMA).jpg",
  "museum-of-modern-art-moma": "/images/museums/The_Museum_of_Modern_Art_(MoMA).jpg",
  moma: "/images/museums/The_Museum_of_Modern_Art_(MoMA).jpg",
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
