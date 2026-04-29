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
 * cached payloads; rich Lokali fields (key_facts/tips/look_for/nearby)
 * are optional and added when fetched via fetchGuideData().
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
  nearby_suggestions?: string[];
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
  nearby_suggestions?: string[];
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function makeKey(name: string, language: string) {
  return `${language.toLowerCase()}::${name.trim().toLowerCase()}`;
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

export function getCachedGuide(name: string, language: string): string | null {
  const map = read();
  const entry = map[makeKey(name, language)];
  return entry?.text ?? null;
}

export function setCachedGuide(name: string, language: string, text: string) {
  if (!text) return;
  const map = read();
  const key = makeKey(name, language);
  // Preserve any existing rich fields on the entry — only update text.
  const prev = map[key];
  map[key] = { ...prev, text, cachedAt: Date.now() };
  write(map);
}

/**
 * Read full GuideData (script + optional rich fields) from cache.
 * Returns null if no entry exists.
 */
export function getCachedGuideData(name: string, language: string): CachedGuideData | null {
  const map = read();
  const entry = map[makeKey(name, language)];
  if (!entry) return null;
  return {
    title: entry.title,
    script: entry.text,
    estimated_duration_seconds: entry.estimated_duration_seconds,
    key_facts: entry.key_facts,
    tips: entry.tips,
    look_for: entry.look_for,
    nearby_suggestions: entry.nearby_suggestions,
  };
}

/**
 * Persist full GuideData (script + rich fields) to cache.
 * Use this from fetchGuideData() so chips survive offline.
 */
export function setCachedGuideData(name: string, language: string, data: CachedGuideData) {
  if (!data.script) return;
  const map = read();
  map[makeKey(name, language)] = {
    text: data.script,
    cachedAt: Date.now(),
    title: data.title,
    estimated_duration_seconds: data.estimated_duration_seconds,
    key_facts: data.key_facts,
    tips: data.tips,
    look_for: data.look_for,
    nearby_suggestions: data.nearby_suggestions,
  };
  write(map);
}

export function removeCachedGuide(name: string, language: string) {
  const map = read();
  delete map[makeKey(name, language)];
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
