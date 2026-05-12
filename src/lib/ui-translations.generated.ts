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
 * Loading strategy — pre-Capacitor change:
 *   Before, all 33 locale dictionaries (~24 KB each, ~760 KB raw total)
 *   were eager-imported at the top of this file. That payload landed
 *   in the initial JS bundle for every user, regardless of which
 *   language they speak. On a 4G mobile (Capacitor's primary target)
 *   that's ~200 KB gzipped of dead weight on first paint.
 *
 *   Now: each locale is its own dynamic-import chunk. We start with
 *   ZERO locale data in the main bundle and pull only the active
 *   language on first render. Switching languages later fetches the
 *   new chunk; previously-loaded dicts stay in memory.
 *
 * Adding a new language:
 *   1. Create `src/lib/ui-locales/{lang}.ts` with the same shape as
 *      the existing locale files — `export const XX: Partial<Record<UiKey, string>>`.
 *   2. Add an entry to LOCALE_LOADERS below with the same dynamic
 *      import pattern and the right named export.
 *   3. Anything missing from a language's dict falls back to the
 *      runtime /api/translate path, then to the English source.
 *
 * Adding a new UI key: add it to UI_STRINGS in i18n.ts, then drop a
 * translation into each locale file under src/lib/ui-locales/. Missing
 * keys just fall through — nothing breaks if you forget one.
 */

import type { UiKey } from "@/lib/i18n";

/** Shape of a single language's UI dictionary. */
type LocaleDict = Partial<Record<UiKey, string>>;

/**
 * Lazy loader per language. Vite splits each of these into its own
 * chunk — the active language fetches in parallel with the rest of
 * the page; inactive languages never load.
 *
 * Keys are the normalized lang codes (see normalizeLang in i18n.ts) —
 * region-stripped except for zh-cn / zh-tw / pt-br / pt-pt which stay
 * distinct because those languages legitimately differ.
 *
 * Anything not in this map (or whose import promise is still pending)
 * falls through to the runtime translation pipeline + localStorage
 * cache. Static is fast-path only; nothing breaks if a chunk fails
 * to load or the user is offline mid-switch.
 */
const LOCALE_LOADERS: Record<string, () => Promise<LocaleDict>> = {
  ar: () => import("./ui-locales/ar").then((m) => m.AR),
  bn: () => import("./ui-locales/bn").then((m) => m.BN),
  cs: () => import("./ui-locales/cs").then((m) => m.CS),
  da: () => import("./ui-locales/da").then((m) => m.DA),
  de: () => import("./ui-locales/de").then((m) => m.DE),
  el: () => import("./ui-locales/el").then((m) => m.EL),
  es: () => import("./ui-locales/es").then((m) => m.ES),
  fa: () => import("./ui-locales/fa").then((m) => m.FA),
  fi: () => import("./ui-locales/fi").then((m) => m.FI),
  fr: () => import("./ui-locales/fr").then((m) => m.FR),
  he: () => import("./ui-locales/he").then((m) => m.HE),
  hi: () => import("./ui-locales/hi").then((m) => m.HI),
  hu: () => import("./ui-locales/hu").then((m) => m.HU),
  id: () => import("./ui-locales/id").then((m) => m.ID),
  it: () => import("./ui-locales/it").then((m) => m.IT),
  ja: () => import("./ui-locales/ja").then((m) => m.JA),
  ka: () => import("./ui-locales/ka").then((m) => m.KA),
  ko: () => import("./ui-locales/ko").then((m) => m.KO),
  ms: () => import("./ui-locales/ms").then((m) => m.MS),
  nb: () => import("./ui-locales/nb").then((m) => m.NB),
  nl: () => import("./ui-locales/nl").then((m) => m.NL),
  pl: () => import("./ui-locales/pl").then((m) => m.PL),
  "pt-br": () => import("./ui-locales/pt-br").then((m) => m.PT_BR),
  "pt-pt": () => import("./ui-locales/pt-pt").then((m) => m.PT_PT),
  ro: () => import("./ui-locales/ro").then((m) => m.RO),
  ru: () => import("./ui-locales/ru").then((m) => m.RU),
  sv: () => import("./ui-locales/sv").then((m) => m.SV),
  th: () => import("./ui-locales/th").then((m) => m.TH),
  tr: () => import("./ui-locales/tr").then((m) => m.TR),
  uk: () => import("./ui-locales/uk").then((m) => m.UK),
  ur: () => import("./ui-locales/ur").then((m) => m.UR),
  vi: () => import("./ui-locales/vi").then((m) => m.VI),
  "zh-cn": () => import("./ui-locales/zh-cn").then((m) => m.ZH_CN),
  "zh-tw": () => import("./ui-locales/zh-tw").then((m) => m.ZH_TW),
};

/**
 * In-memory cache of loaded dictionaries. Sync read — fed by the
 * async loader. Survives the page's lifetime; cleared only on full
 * reload.
 */
const loaded: Map<string, LocaleDict> = new Map();

/**
 * In-flight import promises, keyed by lang. Stops a re-render from
 * firing the same dynamic import twice while the first is still
 * resolving.
 */
const inflight: Map<string, Promise<void>> = new Map();

/**
 * Subscribers that want to know when a locale's chunk arrives.
 * useT() subscribes so it can force a re-render once the static
 * dict is ready (otherwise the first render shows English while
 * the chunk is still in the air).
 */
const subscribers: Set<(lang: string) => void> = new Set();

/**
 * Fire the dynamic import for `lang` if it isn't already cached or
 * in flight. Resolves when the dict is sitting in `loaded`.
 *
 * Called by useT() on mount and whenever the language changes.
 * Safe to call repeatedly — second/third invocations for the same
 * lang return the existing promise.
 */
export function ensureStaticLocale(lang: string): Promise<void> {
  if (!lang || lang.toLowerCase().startsWith("en")) return Promise.resolve();
  const key = lang.toLowerCase();
  if (loaded.has(key)) return Promise.resolve();
  const existing = inflight.get(key);
  if (existing) return existing;
  const loader = LOCALE_LOADERS[key];
  if (!loader) return Promise.resolve(); // unknown lang — let runtime path handle it
  const promise = loader()
    .then((dict) => {
      loaded.set(key, dict);
      subscribers.forEach((cb) => cb(key));
    })
    .catch(() => {
      // Network / chunk failure — leave the cache empty so the
      // caller falls through to runtime translation. We intentionally
      // do NOT mark this as loaded so a later language re-pick can
      // try the import again.
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Subscribe to "locale chunk loaded" events. Returns an unsubscribe
 * function. Used by useT() to force a re-render when its language's
 * chunk arrives mid-frame.
 */
export function onStaticLocaleLoaded(cb: (lang: string) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * Synchronous lookup. Returns the static translation if we have one,
 * otherwise null (which signals the caller to fall back to runtime
 * translation). Source-language ("en") returns null too — the caller
 * already knows the source.
 *
 * "Have one" means the dict's chunk has actually arrived. Until then
 * the call returns null for every key in that language, which is the
 * same path as a missing translation — caller falls through to the
 * runtime /api/translate cache.
 */
export function staticUiLookup(lang: string, key: UiKey): string | null {
  if (!lang || lang.toLowerCase().startsWith("en")) return null;
  const dict = loaded.get(lang.toLowerCase());
  if (!dict) return null;
  return dict[key] ?? null;
}
