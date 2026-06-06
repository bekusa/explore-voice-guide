/**
 * Hand-written wrapper around the generated MUSEUM_TRANSLATIONS dict.
 *
 * Call `getMuseumStrings(museum, lang)` from any component that
 * renders a Museum card — name / blurb / city / country come back in
 * the user's language without an API round-trip. English baseline
 * comes from topMuseums.ts; non-English overlays live in the
 * generated file and are populated by scripts/translate-museums.mjs.
 *
 * Fallback chain:
 *   1. Generated overlay for `lang` if present
 *   2. English baseline from the Museum object
 *
 * This means the existing `useTranslated()` call on museum strings
 * can be retired — every locale already has its strings in the
 * bundle, no runtime fetch needed.
 */

import type { Museum } from "@/lib/topMuseums";
import { MUSEUM_TRANSLATIONS } from "@/lib/museumTranslations.generated";

export type MuseumStrings = {
  name: string;
  blurb: string;
  city: string;
  country: string;
};

export function getMuseumStrings(museum: Museum, lang: string): MuseumStrings {
  if (!museum) {
    return { name: "", blurb: "", city: "", country: "" };
  }
  const base: MuseumStrings = {
    name: museum.name,
    blurb: museum.blurb,
    city: museum.city,
    country: museum.country,
  };
  if (!lang || lang.toLowerCase().startsWith("en")) return base;
  const normalised = lang.toLowerCase();
  const localeMap = MUSEUM_TRANSLATIONS[normalised];
  if (!localeMap) return base;
  const overlay = localeMap[museum.id];
  if (!overlay) return base;
  return {
    name: overlay.name || base.name,
    blurb: overlay.blurb || base.blurb,
    city: overlay.city || base.city,
    country: overlay.country || base.country,
  };
}
