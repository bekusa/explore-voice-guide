/**
 * Pre-translated UI strings — committed to git, NOT generated at runtime.
 *
 * Why this file exists: every UI label in the app (menu items, button
 * text, section headers, "Save", "About this place", etc.) used to be
 * translated by an LLM at runtime via /api/translate. That worked but
 * had three real problems:
 *
 *   1. First page load on a fresh language burned 1-3 seconds waiting
 *      for ~50 strings to come back from the gateway.
 *   2. Every visitor pays the translation cost for the same strings,
 *      cached only per-browser (localStorage). Running the AI on
 *      "Save" once for 10 000 visitors is silly.
 *   3. The gateway occasionally returned garbage — Python tracebacks,
 *      truncations, wrong-language results — and that garbage got
 *      pinned in caches as the canonical translation.
 *
 * Static translations sidestep all three: they ship with the bundle,
 * render instantly, never call an LLM, and can be reviewed in PR.
 * Dynamic translation is still used for content that genuinely changes
 * per request (search queries, attraction descriptions, guide scripts)
 * — the runtime /api/translate path is intact for those.
 *
 * Adding a new language:
 *   1. Create `src/lib/ui-locales/{lang}.ts` with the same shape as
 *      the existing locale files — `export const XX: Partial<Record<UiKey, string>>`.
 *   2. Import + register it in the UI_TRANSLATIONS map below.
 *   3. Anything missing from a language's dict falls back to the
 *      runtime /api/translate path, then to the English source. So
 *      partial translations are safe.
 *
 * Adding a new UI key: add it to UI_STRINGS in i18n.ts, then drop a
 * translation into each locale file under src/lib/ui-locales/. Missing
 * keys just fall through — nothing breaks if you forget one.
 */

import type { UiKey } from "@/lib/i18n";

import { AR } from "./ui-locales/ar";
import { BN } from "./ui-locales/bn";
import { CS } from "./ui-locales/cs";
import { DA } from "./ui-locales/da";
import { DE } from "./ui-locales/de";
import { EL } from "./ui-locales/el";
import { ES } from "./ui-locales/es";
import { FA } from "./ui-locales/fa";
import { FI } from "./ui-locales/fi";
import { FR } from "./ui-locales/fr";
import { HE } from "./ui-locales/he";
import { HI } from "./ui-locales/hi";
import { HU } from "./ui-locales/hu";
import { ID } from "./ui-locales/id";
import { IT } from "./ui-locales/it";
import { JA } from "./ui-locales/ja";
import { KA } from "./ui-locales/ka";
import { KO } from "./ui-locales/ko";
import { MS } from "./ui-locales/ms";
import { NB } from "./ui-locales/nb";
import { NL } from "./ui-locales/nl";
import { PL } from "./ui-locales/pl";
import { PT_BR } from "./ui-locales/pt-br";
import { PT_PT } from "./ui-locales/pt-pt";
import { RO } from "./ui-locales/ro";
import { RU } from "./ui-locales/ru";
import { SV } from "./ui-locales/sv";
import { TH } from "./ui-locales/th";
import { TR } from "./ui-locales/tr";
import { UK } from "./ui-locales/uk";
import { UR } from "./ui-locales/ur";
import { VI } from "./ui-locales/vi";
import { ZH_CN } from "./ui-locales/zh-cn";
import { ZH_TW } from "./ui-locales/zh-tw";

/**
 * Every language we ship pre-translated UI for. Keys are normalized
 * lang codes (see normalizeLang in i18n.ts) — region-stripped except
 * for zh-cn / zh-tw / pt-br / pt-pt which stay distinct because the
 * languages legitimately differ.
 *
 * Anything not in this map falls through to the runtime translation
 * pipeline + browser localStorage cache.
 */
export const UI_TRANSLATIONS: Record<string, Partial<Record<UiKey, string>>> = {
  ar: AR,
  bn: BN,
  cs: CS,
  da: DA,
  de: DE,
  el: EL,
  es: ES,
  fa: FA,
  fi: FI,
  fr: FR,
  he: HE,
  hi: HI,
  hu: HU,
  id: ID,
  it: IT,
  ja: JA,
  ka: KA,
  ko: KO,
  ms: MS,
  nb: NB,
  nl: NL,
  pl: PL,
  "pt-br": PT_BR,
  "pt-pt": PT_PT,
  ro: RO,
  ru: RU,
  sv: SV,
  th: TH,
  tr: TR,
  uk: UK,
  ur: UR,
  vi: VI,
  "zh-cn": ZH_CN,
  "zh-tw": ZH_TW,
};

/**
 * Quick lookup helper used by useT(). Returns the static translation
 * if we have one, otherwise null (which signals the caller to fall
 * back to runtime translation). Source-language ("en") returns null
 * too — the caller already knows the source.
 */
export function staticUiLookup(lang: string, key: UiKey): string | null {
  if (!lang || lang.toLowerCase().startsWith("en")) return null;
  const dict = UI_TRANSLATIONS[lang.toLowerCase()];
  if (!dict) return null;
  return dict[key] ?? null;
}
