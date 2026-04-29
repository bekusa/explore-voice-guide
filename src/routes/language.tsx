import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LANGUAGES, type Language } from "@/lib/languages";
import { setStoredLang } from "@/lib/i18n";

export const Route = createFileRoute("/language")({
  head: () => ({
    meta: [
      { title: "Language — Whispers of Old Tbilisi" },
      {
        name: "description",
        content: "Switch the language of your audio guides at any time.",
      },
      { property: "og:title", content: "Language — Whispers of Old Tbilisi" },
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
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>("ka");
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
      toast.success("Language updated", {
        description: `${lang.flag} ${lang.native}`,
      });
      // Brief delay so the user sees the checkmark before we leave
      setTimeout(() => navigate({ to: "/" }), 350);
    } catch (err) {
      toast.error("Couldn't change language", {
        description: err instanceof Error ? err.message : "Try again later.",
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

  const activeLang = LANGUAGES.find((l) => l.code === active) ?? LANGUAGES[0];

  return (
    <MobileFrame>
      <div className="relative flex h-full flex-col bg-background text-foreground">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pt-12">
          <button
            onClick={() => navigate({ to: "/" })}
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
            <span className="text-[15px] leading-none">{activeLang.flag}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Current
            </span>
          </div>
        </header>

        <section className="px-6 pt-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            Audio guide
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            Speak my <span className="italic text-primary">language</span>
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            Tap a language to switch instantly. Your narrator voice will reset so
            you can pick a new one.
          </p>
        </section>

        {/* Search */}
        <div className="mt-6 px-6">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 37 languages…"
              autoComplete="off"
              className="h-auto border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        {/* List */}
        <div className="mt-4 flex-1 overflow-y-auto px-6 pb-10 scrollbar-hide">
          <ul className="flex flex-col gap-2">
            {filtered.map((l) => {
              const isActive = active === l.code;
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
                      <span className="text-[11px] text-muted-foreground">
                        {l.name}
                      </span>
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
                No languages match "{query}"
              </li>
            )}
          </ul>
        </div>
      </div>
    </MobileFrame>
  );
}
