import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
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
  const matchRoute = useMatchRoute();
  const inChild = matchRoute({ to: "/destinations/$slug", fuzzy: true });

  // Translate every city name once so we can match the user's typed
  // query against either the English source or its translation.
  //
  // CRITICAL: this hook MUST run on every render of DestinationsPage,
  // including renders where we're about to bail out to <Outlet />.
  // Previously it was called AFTER the `if (inChild)` early-return,
  // which meant the hook count flipped between "parent list" and
  // "child slug" renders — React caught the mismatch and threw the
  // minified #300 "Too many re-renders" error Beka saw on his phone
  // whenever the saved tab tried to deep-link into a city page.
  // Keeping the hook above the early return restores a stable hook
  // order and the deep-link path renders cleanly.
  const translated = useTranslated(CITY_LIST);

  // When the URL points at a child route (`/destinations/$slug`),
  // render only the child via <Outlet />. TanStack Router's file-
  // based router treats `destinations.$slug.tsx` as a CHILD of
  // `destinations.tsx`, so without this check, hitting
  // `/destinations/tbilisi` resolved the child route but still
  // painted the parent's city-list UI on top — Beka caught the
  // detail page being invisible behind the browser list. Matching
  // with `fuzzy: true` so any deeper sub-path under /destinations/
  // also hands off to the child outlet.
  if (inChild) {
    return <Outlet />;
  }

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
          {/* Header trimmed per Beka — pt-12 → pt-7 (still clears
              the iOS notch), title font 20 → 17, eyebrow text 10 → 9.
              Net trim ≈ 30 px without losing any affordance. */}
          <div className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 pb-3 pt-7 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Link
                to="/"
                aria-label={t("dest.backHome")}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-primary">
                  {t("dest.exploreTitle")}
                </div>
                <h1
                  className="text-[17px] font-medium leading-tight tracking-[-0.02em]"
                  style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
                >
                  {t("dest.chooseDest")}
                </h1>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-2 transition-smooth focus-within:border-primary/60">
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

          {/* Results — count line removed per Beka. */}
          <div className="px-5 pt-4">
            <div className="flex flex-col gap-4">
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
