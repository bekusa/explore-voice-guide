import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Headphones, MapPin, Search, Sparkles } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { COLLECTIONS, DESTINATIONS, searchDestinations, type Collection } from "@/lib/destinations";
import { TOP_CITIES } from "@/lib/topCities";
import { CityCard } from "@/components/CityCard";
import { useT, useTranslated } from "@/hooks/useT";

const collectionEnum = z.enum(["ancient", "sacred", "coastal", "imperial", "mystic"]);

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  collection: fallback(collectionEnum.optional(), undefined).default(undefined),
});

export const Route = createFileRoute("/destinations")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Explore destinations — Lokali" },
      {
        name: "description",
        content:
          "Browse cinematic, locally narrated audio walks across cities around the world — from Tbilisi to Kyoto, Rome to Marrakech.",
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
  const { q, collection } = Route.useSearch();
  const navigate = useNavigate();
  const t = useT();
  const [query, setQuery] = useState(q);
  const [activeCollection, setActiveCollection] = useState<Collection | undefined>(collection);

  const results = useMemo(() => {
    let list = searchDestinations(query);
    if (activeCollection) {
      list = list.filter((d) => d.collections.includes(activeCollection));
    }
    return list;
  }, [query, activeCollection]);

  // Translate dynamic content (collection labels + city/country/vibe).
  const collectionLabels = useTranslated(COLLECTIONS.map((c) => c.label));
  const cityNames = useTranslated(results.map((d) => d.city));
  const countryNames = useTranslated(results.map((d) => d.country));
  const vibeNames = useTranslated(results.map((d) => d.vibe[0] ?? ""));

  /** Submit the typed query to the n8n-backed Lokali Attractions search. */
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
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">{t("dest.searchHint")}</p>

            <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveCollection(undefined)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                  !activeCollection
                    ? "bg-foreground text-background"
                    : "border border-border bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("dest.allCount", { n: DESTINATIONS.length })}
              </button>
              {COLLECTIONS.map((c, i) => {
                const on = activeCollection === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCollection(on ? undefined : c.id)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                      on
                        ? "bg-foreground text-background"
                        : "border border-border bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {collectionLabels[i] ?? c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results */}
          <div className="px-5 pt-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {results.length === 1
                ? t("dest.countOne", { n: results.length })
                : t("dest.countMany", { n: results.length })}
            </p>

            {results.length === 0 && (
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
                <button
                  onClick={() => {
                    setQuery("");
                    setActiveCollection(undefined);
                  }}
                  className="mt-3 block w-full text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-smooth hover:text-foreground"
                >
                  {t("dest.resetFilters")}
                </button>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              {results.map((d, i) => (
                <Link
                  key={d.slug}
                  to="/destination/$slug"
                  params={{ slug: d.slug }}
                  className="group relative block h-[200px] overflow-hidden rounded-2xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant"
                >
                  <img
                    src={d.hero}
                    alt={`${d.city}, ${d.country}`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                  <div className="absolute left-2.5 right-2.5 top-2.5 flex items-center justify-between">
                    <span className="rounded-full border border-foreground/15 bg-background/60 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em] text-foreground backdrop-blur-md">
                      {countryNames[i] ?? d.country}
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-foreground/15 bg-background/60 px-1.5 py-0.5 text-[8.5px] font-bold text-primary backdrop-blur-md">
                      <Headphones className="h-2 w-2" />
                      {d.featured.length}
                    </span>
                  </div>
                  <div className="absolute inset-x-2.5 bottom-2.5">
                    <h3
                      className="text-[18px] font-medium leading-tight text-foreground"
                      style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
                    >
                      {cityNames[i] ?? d.city}
                    </h3>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[9.5px] text-foreground/70">
                      <MapPin className="h-2 w-2" /> {vibeNames[i] ?? d.vibe[0]}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* ─── TOP 25 CITIES — quick-tap grid ───
                Mirrors the Home strip but as a 2-col grid so the
                Explore page exposes the full Top-25 in one
                browseable surface. Each card → /results?q=<city>,
                same as on Home. */}
            <div className="mt-8">
              <h2 className="font-display text-[20px] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {t("home.topCities.title")}
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {t("home.topCities.sub")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {TOP_CITIES.map((c) => (
                  <CityCard key={c.id} city={c} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
