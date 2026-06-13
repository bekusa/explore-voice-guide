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

  // Two-step BCP-47 → translation-key lookup (Beka 2026-06-11 audit
  // catch). The user's UI language code is full BCP-47 with region:
  // "ka-GE", "fr-FR", "ru-RU". Our pre-baked translation dictionary
  // keys are mostly bare language codes ("ka", "fr", "ru") with a
  // handful of region-specific exceptions ("pt-br", "pt-pt", "zh-cn",
  // "zh-tw") where dialect matters. Without this two-step lookup the
  // bare-code locales never matched — every non-Portuguese / non-
  // Chinese user saw museum strings in English even after Gemini
  // baked all 34 languages.
  //
  // Order:
  //   1. Exact lowercase match first — preserves pt-BR / pt-PT and
  //      zh-CN / zh-TW dialect routing.
  //   2. Fall back to the base language code stripped of region —
  //      catches the common ka-GE / fr-FR / ru-RU / ar-SA case.
  //   3. Fall back to English baseline (no overlay available).
  const normalised = lang.toLowerCase();
  let localeMap = MUSEUM_TRANSLATIONS[normalised];
  if (!localeMap) {
    const baseLang = normalised.split("-")[0];
    if (baseLang && baseLang !== normalised) {
      localeMap = MUSEUM_TRANSLATIONS[baseLang];
    }
  }
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
