import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, Search } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { CityCard } from "@/components/CityCard";
import { CITY_LIST } from "@/lib/cityList";
import { useT, useTranslated } from "@/hooks/useT";

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
        content: "Browse cinematic, locally narrated audio walks across cities around the world.",
      },
    ],
  }),
  component: DestinationsPage,
});

function DestinationsPage() {
  const { q } = Route.useSearch();
  const t = useT();
  const [query, setQuery] = useState(q);

  // Translate every city name once so we can match the user's typed
  // query against either the English source or its translation.
  const translated = useTranslated(CITY_LIST);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return CITY_LIST;
    return CITY_LIST.filter((city, i) => {
      const t = (translated[i] ?? city).toLowerCase();
      return city.toLowerCase().includes(needle) || t.includes(needle);
    });
  }, [query, translated]);

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

            <div className="mt-3 flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-2.5 transition-smooth focus-within:border-primary/60">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dest.searchAny")}
                enterKeyHint="search"
                autoComplete="off"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Results */}
          <div className="px-5 pt-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {results.length === 1
                ? t("dest.countOne", { n: results.length })
                : t("dest.countMany", { n: results.length })}
            </p>

            <div className="mt-3 flex flex-col gap-4">
              {results.map((city) => (
                <CityCard key={city} city={city} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
