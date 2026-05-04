import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Search, Sparkles } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { CITY_LIST } from "@/lib/cityList";
import { CityCard } from "@/components/CityCard";
import { useT } from "@/hooks/useT";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/destinations")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Explore destinations — Lokali" },
      {
        name: "description",
        content:
          "Browse cinematic, locally narrated audio walks across cities around the world.",
      },
      { property: "og:title", content: "Explore destinations — Lokali" },
      {
        property: "og:description",
        content: "Cinematic audio walks for cities around the world.",
      },
    ],
  }),
  component: DestinationsPage,
});

function DestinationsPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const t = useT();
  const [query, setQuery] = useState(q);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return CITY_LIST;
    return CITY_LIST.filter((c) => c.toLowerCase().includes(s));
  }, [query]);

  function submitToLokali(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate({ to: "/results", search: { q: trimmed } });
  }

  return (
    <MobileFrame>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
        <div className="h-full overflow-y-auto pb-10 scrollbar-hide">
          {/* Header */}
          <div className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 pb-3 pt-12 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Link
                to="/"
                aria-label={t("dest.backHome")}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  {t("dest.exploreTitle")}
                </div>
                <h1
                  className="text-[20px] font-medium leading-tight tracking-[-0.02em]"
                  style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
                >
                  {t("dest.chooseDest")}
                </h1>
              </div>
            </div>

            <form
              onSubmit={submitToLokali}
              className="mt-3 flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-2.5 transition-smooth focus-within:border-primary/60"
            >
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dest.searchAny")}
                enterKeyHint="search"
                autoComplete="off"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {query.trim() && (
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-gold px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition-smooth hover:scale-105"
                >
                  <Sparkles className="h-2.5 w-2.5" /> {t("home.search")}
                </button>
              )}
            </form>
          </div>

          {/* Results */}
          <div className="px-5 pt-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {filtered.length === 1
                ? t("dest.countOne", { n: filtered.length })
                : t("dest.countMany", { n: filtered.length })}
            </p>

            {filtered.length === 0 && (
              <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
                <p className="text-[13px] text-muted-foreground">
                  {t("dest.notInList")} —{" "}
                  <span className="font-semibold text-foreground">"{query}"</span>
                </p>
                {query.trim() && (
                  <button
                    onClick={() => submitToLokali()}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow transition-smooth hover:scale-105"
                  >
                    <Sparkles className="h-3 w-3" />{" "}
                    {t("dest.searchWithLokali", { query: query.trim() })}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              {filtered.map((city, i) => (
                <CityCard key={city} city={city} index={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
