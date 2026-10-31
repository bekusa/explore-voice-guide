/**
 * Translation hooks.
 *
 *   const t = useT();
 *   t("home.search")               // → "Search" / "Buscar" / "ძიება" …
 *   t("home.openCity", { city })   // interpolates {city}
 *
 *   const tr = useTranslated([dest.city, dest.blurb]);
 *   // tr is the original array on first render, then re-renders with
 *   // translated strings once the gateway responds. Cached forever.
 *
 *   const lang = useUiLang();      // current normalized code (e.g. "en", "ka")
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  UI_STRINGS,
  type UiKey,
  format,
  getCachedTranslation,
  getStoredLang,
  hasStoredLang,
  normalizeLang,
  onLangChange,
  setStoredLang,
  translateBatch,
} from "@/lib/i18n";
import {
  ensureStaticLocale,
  onStaticLocaleLoaded,
  staticUiLookup,
} from "@/lib/ui-translations.generated";

/**
 * The language the SERVER renders in.
 *
 * `getStoredLang()` returns "en" when there is no `localStorage` (see
 * isBrowser() in i18n.ts), so every server-rendered page is English.
 * The first CLIENT render has to agree with that — see useUiLang.
 */
const SSR_LANG = normalizeLang("en");

/** Reactive current UI language (normalized, e.g. "en", "ka", "es", "zh-cn"). */
export function useUiLang(): string {
  const { user } = useAuth();

  /* Starts at the SERVER's language, NOT the device's.
   *
   * Beka 2026-10-25 — the new window.onerror logging caught React
   * error #418 on the homepage within an hour of going live:
   * "Hydration failed because the server rendered text didn't match
   * the client."
   *
   * The cause was this line. It used to be:
   *     useState(() => normalizeLang(getStoredLang()))
   * and a useState initializer runs during the FIRST render. On the
   * server that is "en" (no localStorage); in the browser it is
   * whatever the device picked. So the server sent English markup and
   * the very first client render produced Georgian — React compared
   * them, found different text, threw away the entire server-rendered
   * tree and re-rendered from scratch.
   *
   * I reproduced it in a browser before changing anything: empty
   * localStorage → no error; `tg.lang=ka` → #418 every load. So it hit
   * every non-English user, on every visit, and nothing reported it
   * until the global handler existed.
   *
   * The fix is React's standard two-pass approach: render what the
   * server rendered, then adopt the device's choice in an effect,
   * after hydration has already succeeded. Visually this is what
   * users ALREADY saw (English for an instant, then their language) —
   * the difference is that React now keeps the server's HTML instead
   * of discarding it, which is strictly faster.
   *
   * To remove that flash entirely the server has to KNOW the language,
   * which means a cookie rather than localStorage. That is a bigger
   * change and deliberately not done here.
   */
  const [lang, setLang] = useState<string>(SSR_LANG);

  // Adopt the device's stored language, then listen for cross-tab +
  // same-tab changes. Both live in ONE effect so the adopt always
  // happens before any subscription callback can fire.
  useEffect(() => {
    const stored = normalizeLang(getStoredLang());
    setLang((cur) => (cur === stored ? cur : stored));
    return onLangChange((l) => setLang(normalizeLang(l)));
  }, []);

  /* THE DEVICE WINS. Beka 2026-10-03:
   * "ენის სეტინგები უნდა იყოს ტელეფონზე ჩამახსოვრებული და არა
   *  უზერზე დამახსოვრებული."
   *
   * This effect used to overwrite the device's language with whatever
   * `profiles.preferred_language` said, every time the auth state
   * resolved. Two bad consequences:
   *
   *   - Signing in on a phone set to Georgian could flip the whole UI
   *     to whatever language the account last used elsewhere, with no
   *     action from the user and no way to see why.
   *   - It raced the local value on every cold start: localStorage
   *     painted first, then the profile arrived a moment later and
   *     the interface changed language under the reader's eyes.
   *
   * The profile value is now only a SEED — used when this device has
   * no choice of its own yet (fresh install, signing in on a new
   * phone). Once someone picks a language here, that pick is final
   * until they change it here.
   *
   * We still WRITE to the profile on /language (see language.tsx), so
   * a brand-new device still inherits a sensible default. Reading is
   * what had to stop being authoritative.
   */
  useEffect(() => {
    if (!user) return;
    // Device already has an explicit choice → nothing to seed.
    if (hasStoredLang()) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("preferred_language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Re-check: the user may have picked a language while the
        // request was in flight, and their tap must outrank the seed.
        if (hasStoredLang()) return;
        const code = data?.preferred_language;
        if (!code) return;
        const norm = normalizeLang(code);
        setStoredLang(norm);
        setLang(norm);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return lang;
}

/* ─── UI string translator ─── */

const UI_KEYS = Object.keys(UI_STRINGS) as UiKey[];
const UI_VALUES = UI_KEYS.map((k) => UI_STRINGS[k]);

// In-memory mirror (sync, by lang) of the UI dictionary translations.
const uiMemory = new Map<string, Map<string, string>>();

function uiLookup(lang: string, source: string): string | null {
  const m = uiMemory.get(lang);
  if (m && m.has(source)) return m.get(source) ?? null;
  const cached = getCachedTranslation(source, lang);
  if (cached !== null) {
    if (!uiMemory.has(lang)) uiMemory.set(lang, new Map());
    uiMemory.get(lang)!.set(source, cached);
    return cached;
  }
  return null;
}

function setUiMemory(lang: string, pairs: { source: string; text: string }[]) {
  if (!uiMemory.has(lang)) uiMemory.set(lang, new Map());
  const m = uiMemory.get(lang)!;
  for (const { source, text } of pairs) m.set(source, text);
}

// Per-language in-flight tracking so a Georgian batch doesn't block
// a Spanish batch (and vice versa).
const uiInflight = new Map<string, Promise<void>>();

function ensureUiTranslations(lang: string): Promise<void> {
  if (lang === "en") return Promise.resolve();
  // Find missing UI strings for this lang.
  const missing: string[] = [];
  for (const v of UI_VALUES) if (uiLookup(lang, v) === null) missing.push(v);
  if (missing.length === 0) return Promise.resolve();
  const existing = uiInflight.get(lang);
  if (existing) return existing;
  const promise = translateBatch(missing, lang)
    .then((translated) => {
      setUiMemory(
        lang,
        missing.map((s, i) => ({ source: s, text: translated[i] ?? s })),
      );
    })
    .catch(() => {
      /* fall back to source */
    })
    .finally(() => {
      uiInflight.delete(lang);
    });
  uiInflight.set(lang, promise);
  return promise;
}

export function useT() {
  const lang = useUiLang();
  const [, force] = useState(0);

  // Two-pronged lazy loading:
  //
  //  1. ensureStaticLocale(lang) — fires the dynamic import of the
  //     active language's static UI dictionary (e.g. ui-locales/ka.ts).
  //     Each locale is its own Vite chunk now, so the main bundle
  //     ships with zero translation data and the user pays only for
  //     the language they actually speak. We subscribe to "chunk
  //     loaded" events to force a re-render the moment the dict
  //     arrives — without it, the first render after a language
  //     switch shows English until React happens to re-render for
  //     other reasons.
  //
  //  2. ensureUiTranslations(lang) — runtime /api/translate fallback
  //     for keys the static dict doesn't cover. This was the original
  //     translation path; it stays as a safety net for languages
  //     whose static dict is partial or whose chunk failed to load.
  useEffect(() => {
    if (lang === "en") return;
    let cancelled = false;
    ensureStaticLocale(lang).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    const off = onStaticLocaleLoaded((loadedLang) => {
      if (cancelled) return;
      if (loadedLang === lang.toLowerCase()) force((n) => n + 1);
    });
    ensureUiTranslations(lang).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [lang]);

  return useMemo(() => {
    return (key: UiKey, vars?: Record<string, string | number>) => {
      const source = UI_STRINGS[key] ?? key;
      if (lang === "en") return format(source, vars);
      // 1. Static pre-translated dict — instant, no LLM call ever.
      const fromStatic = staticUiLookup(lang, key);
      if (fromStatic !== null) return format(fromStatic, vars);
      // 2. Runtime cache (localStorage), populated on demand by
      //    ensureUiTranslations() above. Used only for languages that
      //    don't yet have full static coverage.
      const translated = uiLookup(lang, source);
      return format(translated ?? source, vars);
    };
  }, [lang]);
}

/**
 * Translate one UI key into a SPECIFIC language — not the one on screen.
 *
 * Beka 2026-10-31: "ენას რომ ანახლებ, ცვლილების შეტყობინება გამოდის
 * ძველ ენაზე და არა ახალზე". The /language picker built its "Language
 * updated" toast with the `t` from the render that was still in the
 * OLD language, so someone switching to Georgian was told so in
 * English. Messages that confirm a language change must be written in
 * the language just chosen; this waits for that language's static
 * dictionary chunk (usually already cached) and falls back to the
 * runtime cache, then English, exactly like `useT`.
 */
export async function translateUiKeyFor(
  lang: string,
  key: UiKey,
  vars?: Record<string, string | number>,
): Promise<string> {
  const norm = normalizeLang(lang);
  const source = UI_STRINGS[key] ?? key;
  if (norm === "en") return format(source, vars);
  try {
    await ensureStaticLocale(norm);
  } catch {
    /* fall through to the runtime cache / English */
  }
  const fromStatic = staticUiLookup(norm, key);
  if (fromStatic !== null) return format(fromStatic, vars);
  return format(uiLookup(norm, source) ?? source, vars);
}

/* ─── Free-form translator (destination names, blurbs, etc.) ─── */

export function useTranslated(texts: string[] | readonly string[]): string[] {
  const lang = useUiLang();
  // Content-keyed memo dependency. Callers pass inline literals
  // (`useTranslated([item.name, a.duration])`) which produce a fresh
  // array reference every render. If we depended directly on
  // `texts`, the inner useMemos / useEffect would re-fire each
  // render → setState(initial) with a new array reference → re-render
  // → … React error #185 ("Maximum update depth exceeded"). The
  // joined string collapses content-equal arrays to the same
  // primitive key so the deps stay stable across renders. The " "
  // separator avoids accidental collisions if any source string
  // contains the more-typical "|" or ",".
  const textsKey = (texts as string[]).join(" ");
  const arr = useMemo(
    () => (texts as string[]).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textsKey],
  );

  // Initial value: cache hit if available, otherwise originals.
  const initial = useMemo(() => {
    if (lang === "en") return arr;
    return arr.map((s) => getCachedTranslation(s, lang) ?? s);
  }, [arr, lang]);

  const [state, setState] = useState<string[]>(initial);

  useEffect(() => {
    setState(initial);
    if (lang === "en") return;
    const missing = arr.filter((s) => getCachedTranslation(s, lang) === null);
    if (missing.length === 0) return;
    let cancelled = false;
    translateBatch(missing, lang)
      .then((translated) => {
        if (cancelled) return;
        const map = new Map(missing.map((s, i) => [s, translated[i] ?? s]));
        setState(arr.map((s) => map.get(s) ?? getCachedTranslation(s, lang) ?? s));
      })
      .catch(() => {
        /* keep originals */
      });
    return () => {
      cancelled = true;
    };
  }, [arr, lang, initial]);

  return state;
}

/** Single-string convenience. */
export function useTranslatedString(text: string): string {
  return useTranslated([text])[0] ?? text;
}
