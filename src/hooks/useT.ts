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
  normalizeLang,
  onLangChange,
  setStoredLang,
  translateBatch,
} from "@/lib/i18n";
import { staticUiLookup } from "@/lib/ui-translations.generated";

/** Reactive current UI language (normalized, e.g. "en", "ka", "es", "zh-cn"). */
export function useUiLang(): string {
  const { user } = useAuth();
  const [lang, setLang] = useState<string>(() => normalizeLang(getStoredLang()));

  // Listen for cross-tab + same-tab language changes.
  useEffect(() => {
    return onLangChange((l) => setLang(normalizeLang(l)));
  }, []);

  // When the signed-in user has a profile preference, prefer it.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("preferred_language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const code = data?.preferred_language;
        if (!code) return;
        const norm = normalizeLang(code);
        // Mirror to localStorage so other parts of the app pick it up.
        if (norm !== getStoredLang()) setStoredLang(norm);
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

  // Runtime fetch is now a *fallback* — only fires for keys not
  // covered by the static dict in ui-translations.generated.ts. For
  // languages with full static coverage (Georgian today, more later),
  // this useEffect ends up doing nothing and the UI renders instantly.
  useEffect(() => {
    if (lang === "en") return;
    let cancelled = false;
    ensureUiTranslations(lang).then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
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

/* ─── Free-form translator (destination names, blurbs, etc.) ─── */

export function useTranslated(texts: string[] | readonly string[]): string[] {
  const lang = useUiLang();
  const arr = useMemo(() => texts.filter(Boolean) as string[], [texts]);

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
