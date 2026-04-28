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

type Entry = {
  text: string;
  cachedAt: number;
};

type CacheMap = Record<string, Entry>;

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
      const entries = Object.entries(map).sort(
        (a, b) => b[1].cachedAt - a[1].cachedAt,
      );
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
  map[makeKey(name, language)] = { text, cachedAt: Date.now() };
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
