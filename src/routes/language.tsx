import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LANGUAGES, type Language } from "@/lib/languages";
import { setStoredLang, getStoredLang } from "@/lib/i18n";
import { useT } from "@/hooks/useT";

/**
 * Resolve a stored language code (could be short like "en" / "ka" or
 * full BCP-47 like "en-US" / "ka-GE") to a Language entry in LANGUAGES.
 *
 * Why we need this: the localStorage form is the normalised short
 * code (see `normalizeLang` in lib/i18n.ts — "en-US" → "en") while the
 * LANGUAGES array uses full BCP-47 codes. A naive
 * `LANGUAGES.find(l => l.code === active)` with active="ka" returned
 * undefined and fell through to `LANGUAGES[0]`, which after the A-Z
 * sort is Arabic 🇸🇦. Beka caught the wrong "Current" pill on the
 * /language page.
 *
 * Lookup order:
 *   1. Exact match on full code (covers "en-US", "ka-GE", "zh-CN").
 *   2. Prefix match — and when the prefix is "en", explicitly prefer
 *      "en-US" over "en-GB" so the default English speaker doesn't
 *      land on the UK flag. Same logic could apply to "es" / "pt" /
 *      "zh" but those variants aren't ambiguous in the same way.
 *   3. Hard fall back to "en-US", not LANGUAGES[0], so the default
 *      never silently becomes Arabic again.
 */
function resolveLanguage(code: string): Language {
  if (!code) return LANGUAGES.find((l) => l.code === "en-US") ?? LANGUAGES[0];
  const exact = LANGUAGES.find((l) => l.code === code);
  if (exact) return exact;
  const prefix = code.split("-")[0].toLowerCase();
  if (prefix === "en") {
    const enUS = LANGUAGES.find((l) => l.code === "en-US");
    if (enUS) return enUS;
  }
  const prefixed = LANGUAGES.find((l) => l.code.toLowerCase().startsWith(`${prefix}-`));
  if (prefixed) return prefixed;
  return LANGUAGES.find((l) => l.code === "en-US") ?? LANGUAGES[0];
}

export const Route = createFileRoute("/language")({
  head: () => ({
    meta: [
      { title: "Language — Lokali" },
      {
        name: "description",
        content: "Switch the language of your audio guides at any time.",
      },
      { property: "og:title", content: "Language — Lokali" },
      {
        property: "og:description",
        content: "Switch the language of your audio guides.",
      },
    ],
  }),
  component: LanguagePage,
});

function LanguagePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [query, setQuery] = useState("");
  // Seed `active` from localStorage instead of hardcoded "ka". The
  // hardcoded default plus a strict `code === active` find() meant
  // anonymous visitors landed on LANGUAGES[0] = Arabic. Now we read
  // the stored preference (short form like "en" / "ka") and rely on
  // resolveLanguage() to map it to a real Language entry below.
  const [active, setActive] = useState<string>(() => getStoredLang());
  const [pending, setPending] = useState<string | null>(null);

  // Load current preferred language from profile
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
        if (data?.preferred_language) setActive(data.preferred_language);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const filtered = useMemo(() => {
    if (!query.trim()) return LANGUAGES;
    const q = query.toLowerCase();
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  const pick = async (lang: Language) => {
    if (lang.code === active || pending) return;
    setPending(lang.code);
    try {
      if (user) {
        // Reset preferred_voice — voices are language-specific.
        const { error } = await supabase
          .from("profiles")
          .update({
            preferred_language: lang.code,
            preferred_voice: "browser-default",
          })
          .eq("user_id", user.id);
        if (error) throw error;
      }
      setActive(lang.code);
      setStoredLang(lang.code);
      toast.success(t("toast.langUpdated"), {
        description: `${lang.flag} ${lang.native}`,
      });
      // Brief delay so the user sees the checkmark before we leave
      setTimeout(() => navigate({ to: "/" }), 350);
    } catch (err) {
      toast.error(t("toast.langFailed"), {
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
      });
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return (
      <MobileFrame>
        <div className="grid h-full place-items-center bg-background text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </MobileFrame>
    );
  }

  // Smart lookup — handles short "en" / "ka" forms from localStorage
  // AND full "en-US" / "ka-GE" forms from the profiles table. Never
  // falls back to LANGUAGES[0] (Arabic after the A-Z sort) — uses
  // en-US as the universal default. See resolveLanguage() comment.
  const activeLang = resolveLanguage(active);

  return (
    <MobileFrame>
      {/* The whole page scrolls (not just the list). Previously the
          page used `flex h-full flex-col` with `flex-1 overflow-y-auto`
          on the list, which pinned the header + title + search at the
          top and only let the language list scroll. On small phones
          that left the language rows squeezed into a 200-300px strip.
          Beka asked for the entire page to scroll instead. */}
      <div className="relative min-h-full bg-background text-foreground pb-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pt-safe">
          <button
            onClick={() => navigate({ to: "/" })}
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
            <span className="text-[15px] leading-none">{activeLang.flag}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("lang.current")}
            </span>
          </div>
        </header>

        <section className="px-6 pt-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("lang.audioGuide")}
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            {t("lang.speakMy")} <span className="italic text-primary">{t("lang.language")}</span>
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            {t("lang.tapHint")}
          </p>
        </section>

        {/* Search */}
        <div className="mt-6 px-6">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("lang.searchPlaceholder")}
              autoComplete="off"
              className="h-auto border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        {/* List — scrolls with the rest of the page now. */}
        <div className="mt-4 px-6">
          <ul className="flex flex-col gap-2">
            {filtered.map((l) => {
              // Compare against the *resolved* full code, otherwise
              // active="en" wouldn't checkmark the en-US row.
              const isActive = activeLang.code === l.code;
              const isPending = pending === l.code;
              return (
                <li key={l.code}>
                  <button
                    onClick={() => pick(l)}
                    disabled={!!pending}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-smooth disabled:cursor-wait ${
                      isActive
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <span className="text-[22px] leading-none">{l.flag}</span>
                    <span className="flex flex-1 flex-col leading-tight">
                      <span className="text-[14px] font-semibold">{l.native}</span>
                      <span className="text-[11px] text-muted-foreground">{l.name}</span>
                    </span>
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isActive ? (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-10 text-center text-[13px] text-muted-foreground">
                {t("lang.noMatches")} "{query}"
              </li>
            )}
          </ul>
        </div>
      </div>
    </MobileFrame>
  );
}
