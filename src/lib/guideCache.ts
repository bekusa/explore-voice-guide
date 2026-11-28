/**
 * Offline cache for narrated guide scripts, keyed by (name + language).
 *
 * Why localStorage: tiny payloads (a paragraph of text), no auth required,
 * survives page reloads + airplane mode. We cap entries to avoid blowing the
 * 5MB budget — oldest dropped first when full.
 */

const KEY = "tg.guideCache.v1";
const MAX_ENTRIES = 200;
const EVENT = "tg:guide-cache-changed";

/**
 * Cache entry. `text` (script) is required for back-compat with older
 * cached payloads; rich Lokali fields (key_facts/tips/look_for) are
 * optional and added when fetched via fetchGuideData(). `nearby_-
 * suggestions` used to live here too but the section was retired —
 * old entries that still carry it just go ignored on read.
 */
type Entry = {
  text: string;
  cachedAt: number;
  // Optional rich payload — only present if fetched via fetchGuideData().
  // Older cache entries (script-only) just omit these.
  title?: string;
  estimated_duration_seconds?: number;
  key_facts?: string[];
  tips?: string[];
  look_for?: string[];
};

type CacheMap = Record<string, Entry>;

/** Shape returned by getCachedGuideData — matches GuideData in lib/api.ts. */
export type CachedGuideData = {
  title?: string;
  script: string;
  estimated_duration_seconds?: number;
  key_facts?: string[];
  tips?: string[];
  look_for?: string[];
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Cache key. Format: `<lang>::<interest>::<name>`.
 *
 * The `interest` segment namespaces by user-chosen bias so a
 * photography-tilted Narikala doesn't overwrite the history-tilted one.
 * When callers don't pass an interest, we look up the current global
 * preference (defaults to History). Anonymous-mode cache entries
 * written before this scheme become orphaned — that's acceptable for
 * Beka's user base; they re-fetch on next visit.
 */
function makeKey(name: string, language: string, interest?: string) {
  // Lazy require to avoid circulars: interestPreference depends on i18n
  // which is tiny but we still keep this self-contained.
  const eff = (interest ?? readCurrentInterest()).toLowerCase();
  return `${language.toLowerCase()}::${eff}::${name.trim().toLowerCase()}`;
}

/**
 * Read the current global interest preference without importing the
 * interestPreference module (avoids any chance of an import cycle and
 * keeps this file usable in plain non-React contexts). Mirrors the
 * key/default used by lib/interestPreference.ts.
 */
function readCurrentInterest(): string {
  if (!isBrowser()) return "history";
  try {
    return (localStorage.getItem("tg.interest.v1") || "history").toLowerCase();
  } catch {
    return "history";
  }
}

/* ── English stored under another language ──────────────────────────
 * Beka 2026-11-28: "ქართულ ენაზე ჩავწერე ბაგრატის კათედრალი. და
 * ინგლისურად გამოაქვს". When the server's translation fails it still
 * answers with the English guide (better than nothing), and this cache
 * used to keep that English under the user's language for good — so the
 * phone would go on showing English even after the server was fixed.
 * Translation was down from about 2026-11-13 to 11-28, which left such
 * entries on many devices.
 *
 * So an entry whose text is plainly English is neither stored nor
 * served for a non-English language; the next open fetches it again.
 * The test is deliberately crude and one-sided — it must never throw
 * away a real translation:
 *   - non-Latin languages (Georgian, Russian, Arabic, Hindi, Chinese…):
 *     more than 60 % of the letters are Latin;
 *   - Latin-script languages (French, German, Spanish…): English
 *     function words make up over 6 % of the words. In English prose
 *     "the", "and", "of" alone run to ~12 %; in a real French or German
 *     translation they all but vanish. */
const NON_LATIN_LANGS = new Set(
  "ka el ru uk bg kk hy he ar fa ur hi mr bn pa gu ta te ml th ja ko zh".split(" "),
);
const ENGLISH_MARKERS = new Set("the and of with which this that you your from were".split(" "));

export function looksUntranslated(text: string, language: string): boolean {
  const lang = (language || "").toLowerCase();
  if (!text || !lang || lang.startsWith("en")) return false;
  const sample = text.slice(0, 2000);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 80) return false;
  if (NON_LATIN_LANGS.has(lang.split("-")[0])) {
    const latin = sample.match(/\p{Script=Latin}/gu)?.length ?? 0;
    return latin / letters > 0.6;
  }
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 40) return false;
  const english = words.filter((w) => ENGLISH_MARKERS.has(w)).length;
  return english / words.length > 0.06;
}

function read(): CacheMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

function write(map: CacheMap) {
  if (!isBrowser()) return;
  try {
    // Drop oldest if over cap
    const entries = Object.entries(map);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
      const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(KEY, JSON.stringify(map));
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch (err) {
    // Likely quota — drop everything except newest 50
    try {
      const entries = Object.entries(map).sort((a, b) => b[1].cachedAt - a[1].cachedAt);
      const slim = Object.fromEntries(entries.slice(0, 50));
      localStorage.setItem(KEY, JSON.stringify(slim));
      window.dispatchEvent(new CustomEvent(EVENT));
    } catch {
      console.warn("Guide cache full", err);
    }
  }
}

export function getCachedGuide(name: string, language: string, interest?: string): string | null {
  const map = read();
  const entry = map[makeKey(name, language, interest)];
  if (!entry?.text || looksUntranslated(entry.text, language)) return null;
  return entry.text;
}

export function setCachedGuide(name: string, language: string, text: string, interest?: string) {
  if (!text || looksUntranslated(text, language)) return;
  const map = read();
  const key = makeKey(name, language, interest);
  // Preserve any existing rich fields on the entry — only update text.
  const prev = map[key];
  map[key] = { ...prev, text, cachedAt: Date.now() };
  write(map);
}

/**
 * Read full GuideData (script + optional rich fields) from cache.
 * Returns null if no entry exists.
 */
export function getCachedGuideData(
  name: string,
  language: string,
  interest?: string,
): CachedGuideData | null {
  const map = read();
  const entry = map[makeKey(name, language, interest)];
  if (!entry || looksUntranslated(entry.text, language)) return null;
  return {
    title: entry.title,
    script: entry.text,
    estimated_duration_seconds: entry.estimated_duration_seconds,
    key_facts: entry.key_facts,
    tips: entry.tips,
    look_for: entry.look_for,
  };
}

/**
 * Persist full GuideData (script + rich fields) to cache.
 * Use this from fetchGuideData() so chips survive offline.
 */
export function setCachedGuideData(
  name: string,
  language: string,
  data: CachedGuideData,
  interest?: string,
) {
  if (!data.script || looksUntranslated(data.script, language)) return;
  const map = read();
  map[makeKey(name, language, interest)] = {
    text: data.script,
    cachedAt: Date.now(),
    title: data.title,
    estimated_duration_seconds: data.estimated_duration_seconds,
    key_facts: data.key_facts,
    tips: data.tips,
    look_for: data.look_for,
  };
  write(map);
}

export function removeCachedGuide(name: string, language: string, interest?: string) {
  const map = read();
  delete map[makeKey(name, language, interest)];
  write(map);
}

export function clearGuideCache() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listCachedKeys(): string[] {
  return Object.keys(read());
}

export function guideCacheSize(): number {
  if (!isBrowser()) return 0;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
  }
}

export function guideCacheCount(): number {
  return Object.keys(read()).length;
}

/** Subscribe to cache changes (cross-tab via storage, same-tab via custom). */
export function onGuideCacheChange(cb: () => void): () => void {
  if (!isBrowser()) return () => {};
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const custom = () => cb();
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, custom);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, custom);
  };
}
