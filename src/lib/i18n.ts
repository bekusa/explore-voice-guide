/**
 * i18n core for Voices.
 *
 * Two layers:
 *  1) UI chrome dictionary (static keys → English source strings).
 *     Non-English locales are auto-translated on demand via /api/translate
 *     and cached in localStorage so we don't re-hit the gateway.
 *  2) Free-form `translate()` for dynamic content (destination names,
 *     blurbs, attraction descriptions). Same cache + endpoint.
 *
 * The user's preferred language is sourced from the existing
 * `usePreferredLanguage` hook (reads `profiles.preferred_language`),
 * with a localStorage mirror so anonymous browsing works too.
 */

const STORAGE_KEY = "tg.lang";
const CACHE_KEY = "tg.translations.v1";
const CHANGE_EVENT = "tg:lang-changed";
const MAX_CACHE_ENTRIES = 5000;

/* ─── Language store (reactive, browser only) ─── */

function isBrowser() {
  return typeof window !== "undefined";
}

export function getStoredLang(): string {
  if (!isBrowser()) return "en";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "en";
  } catch {
    return "en";
  }
}

export function setStoredLang(code: string) {
  if (!isBrowser()) return;
  const norm = normalizeLang(code);
  try {
    localStorage.setItem(STORAGE_KEY, norm);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: norm }));
}

export function onLangChange(cb: (lang: string) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = (e: Event) => {
    const lang = (e as CustomEvent<string>).detail ?? getStoredLang();
    cb(lang);
  };
  const storage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(getStoredLang());
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", storage);
  };
}

/** Strip region: "en-US" → "en", "zh-CN" stays "zh-CN" (kept for Chinese variants). */
export function normalizeLang(code: string): string {
  if (!code) return "en";
  const c = code.trim();
  // Keep zh-CN / zh-TW / pt-BR / pt-PT distinct — translation differs.
  if (/^(zh|pt)-/i.test(c)) return c.toLowerCase();
  return c.split("-")[0].toLowerCase();
}

/* ─── UI dictionary ─── */

/**
 * Source of truth for UI chrome. Keys are stable, values are English.
 * For non-English locales we fetch translations on first render via the
 * batch translate endpoint, then cache.
 */
export const UI_STRINGS = {
  // Nav / chrome
  "nav.home": "Home",
  "nav.explore": "Explore",
  "nav.map": "Map",
  "nav.saved": "Saved",
  "nav.signOut": "Sign out",
  "nav.signIn": "Sign in",
  "nav.settings": "Settings",
  "nav.notifications": "Notifications",
  "nav.language": "Language",
  "nav.back": "Back",

  // Home
  "home.whereNext": "Where next?",
  "home.offline": "Offline",
  "home.searchPlaceholder": "Country, city, or landmark…",
  "home.search": "Search",
  "home.browse": "Browse",
  "home.collections.title": "Curated collections",
  "home.collections.sub": "Themes for the way you travel",
  "home.featured.title": "Featured cities",
  "home.featured.sub": "Cinematic walks, narrated by locals",
  "home.seeAll": "See all",
  "home.featuredBadge": "Featured",
  "home.openCity": "Open {city}",
  "home.tours.one": "{n} tour",
  "home.tours.many": "{n} tours",

  // Destination screen
  "dest.currentlyIn": "Currently in",
  "dest.featuredTour": "Featured Tour",
  "dest.beginJourney": "Begin journey",
  "dest.firstChapter": "Listen to first chapter",
  "dest.freeMin": "Free · 3 min",
  "dest.searchIn": "Search {city}…",
  "dest.inside": "Inside {city}",
  "dest.insideSub": "Curated stops, narrated by locals",
  "dest.otherCities": "Other cities",
  "dest.cat.all": "All",
  "dest.cat.historic": "Historic",
  "dest.cat.sacred": "Sacred",
  "dest.cat.culinary": "Culinary",
  "dest.cat.hidden": "Hidden",
  "dest.cat.fortress": "Fortress",
  "dest.nowPlaying": "Chapter 2 · Sulfur & Stone",

  // Near-you / attraction card
  "card.audioGuide": "Audio guide",
  "card.offline": "Offline",
  "card.stops": "{n} stops",
  "card.save": "Save",
  "card.saved": "Saved",
  "card.download": "Download",
  "card.saving": "Saving",
  "card.details": "Details",
  "card.play": "Play narrated guide",
  "card.fallbackDesc":
    "A curated walk through {title}. Tap “Open details” for the full narrated guide and stop-by-stop story.",

  // Attraction page
  "attr.aboutThis": "About this place",
  "attr.theStops": "The stops",
  "attr.chapters": "{n} chapters",
  "attr.beginJourney": "Begin journey",
  "attr.listenNarrated": "Listen to narrated guide",
  "attr.tapBegin": "Tap “Begin journey” to hear the narrated story of this place.",
  "attr.stopsAppear": "Stops appear once the narrated guide is generated.",

  // Results filters
  "filters.interests": "Interests",
  "filters.clear": "Clear",
  "filters.int.history": "History",
  "filters.int.art": "Art",
  "filters.int.food": "Food",
  "filters.int.nature": "Nature",
  "filters.int.architecture": "Architecture",
  "filters.int.spirituality": "Spirituality",
  "filters.int.family": "Family",
  "filters.int.couples": "Couples",
  "filters.int.photography": "Photography",
  "filters.int.adventure": "Adventure",
  "filters.int.local": "Local culture",
  "filters.int.nightlife": "Nightlife",

  // Toasts
  "toast.removedFromSaved": "Removed from Saved",
  "toast.saved": "Saved",
  "toast.savedDesc": "Tap Download to keep the guide for offline.",
  "toast.alreadyCached": "Already cached",
  "toast.alreadyCachedDesc": "This guide plays offline.",
  "toast.youreOffline": "You're offline",
  "toast.youreOfflineDesc": "Connect once to download the guide.",
  "toast.downloaded": "Downloaded for offline",
  "toast.noGuide": "No guide returned",
  "toast.downloadFailed": "Download failed",
  "toast.tryAgain": "Try again later.",
} as const;

export type UiKey = keyof typeof UI_STRINGS;

/* ─── Translation cache (per-language, free-form strings) ─── */

type CacheShape = Record<string /* lang */, Record<string /* sourceText */, string>>;

function readCache(): CacheShape {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheShape) {
  if (!isBrowser()) return;
  try {
    // crude trim to avoid blowing 5MB budget
    const flatCount = Object.values(map).reduce((n, byLang) => n + Object.keys(byLang).length, 0);
    if (flatCount > MAX_CACHE_ENTRIES) {
      // drop the language with the most entries until under cap
      const sorted = Object.entries(map).sort(
        (a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length,
      );
      while (
        sorted.length > 0 &&
        Object.values(Object.fromEntries(sorted)).reduce((n, b) => n + Object.keys(b).length, 0) >
          MAX_CACHE_ENTRIES
      ) {
        sorted.shift();
      }
      map = Object.fromEntries(sorted);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* quota — silently drop */
  }
}

export function getCachedTranslation(text: string, lang: string): string | null {
  const l = normalizeLang(lang);
  if (l === "en") return text;
  const map = readCache();
  return map[l]?.[text] ?? null;
}

export function setCachedTranslations(pairs: { source: string; text: string }[], lang: string) {
  const l = normalizeLang(lang);
  if (l === "en") return;
  const map = readCache();
  if (!map[l]) map[l] = {};
  for (const { source, text } of pairs) {
    if (text) map[l][source] = text;
  }
  writeCache(map);
}

/* ─── Network: batch translate via server route ─── */

const inflight = new Map<string, Promise<string[]>>();

export async function translateBatch(texts: string[], lang: string): Promise<string[]> {
  const l = normalizeLang(lang);
  if (l === "en" || texts.length === 0) return texts;

  const key = l + "::" + texts.join("\u0001");
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, target: l }),
    });
    if (!res.ok) throw new Error(`translate failed: ${res.status}`);
    const data = (await res.json()) as { translations?: string[] };
    const out = data.translations ?? texts;
    setCachedTranslations(
      texts.map((s, i) => ({ source: s, text: out[i] ?? s })),
      l,
    );
    return out;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/* ─── Format helpers ─── */

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
