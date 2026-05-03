import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronDown,
  Clock,
  Globe,
  Loader2,
  MapPin,
  Search,
  Settings as SettingsIcon,
  Star,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { NearYouCard, type NearPlace } from "@/components/NearYouCard";
import type { Destination } from "@/lib/destinations";
import { setSelectedSlug } from "@/lib/destinationStore";
import { useT, useTranslated } from "@/hooks/useT";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { attractionSlug, detectQueryLanguage, fetchAttractions, type Attraction } from "@/lib/api";

/* ─────────────────────────────────────────────
 * DESTINATION SCREEN — what used to be the home screen
 * Now scoped to a single city, driven by the destinations catalog.
 * "Inside {city}" pulls top attractions live from the n8n
 * /attractions workflow, with the static `dest.featured` list
 * used only as a fallback while loading or on failure.
 * ───────────────────────────────────────────── */

export function DestinationScreen({ dest }: { dest: Destination }) {
  useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const t = useT();
  const preferredLanguage = usePreferredLanguage();
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const CATEGORIES = [
    { id: "all", label: t("dest.cat.all") },
    { id: "historic", label: t("dest.cat.historic") },
    { id: "sacred", label: t("dest.cat.sacred") },
    { id: "culinary", label: t("dest.cat.culinary") },
    { id: "hidden", label: t("dest.cat.hidden") },
    { id: "fortress", label: t("dest.cat.fortress") },
  ];

  // Translate destination name + blurb on the fly.
  const headline = dest.tagline.split("|");
  const [city, country, blurb, headline1, headline2] = useTranslated([
    dest.city,
    dest.country,
    dest.blurb,
    headline[0] ?? "",
    headline[1] ?? "",
  ]);

  // When a user lands on a destination page, persist it as their current.
  useEffect(() => {
    setSelectedSlug(dest.slug);
  }, [dest.slug]);

  // ── Live "Inside {city}" list, sourced from the n8n /attractions
  // workflow. We query for the destination's English city name (the
  // workflow handles translation downstream via `language`). While the
  // request is in flight or if it fails, we fall back to the static
  // curated list shipped in destinations.ts so the screen never feels
  // empty.
  const language = detectQueryLanguage(dest.city, preferredLanguage);
  const [liveAttractions, setLiveAttractions] = useState<Attraction[] | null>(null);
  const [loadingAttractions, setLoadingAttractions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingAttractions(true);
    setLiveAttractions(null);
    fetchAttractions(dest.city, language)
      .then((data) => {
        if (cancelled) return;
        setLiveAttractions(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(t("toast.couldNotLoadAttractions"), {
          description: err instanceof Error ? err.message : t("dest.showingCurated"),
        });
        setLiveAttractions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAttractions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest.city, language]);

  // Adapt n8n Attraction → NearYouCard's NearPlace shape.
  const placesFromLive: NearPlace[] = useMemo(
    () =>
      (liveAttractions ?? []).map((a, i): NearPlace => {
        const description =
          (typeof a.insider_desc === "string" && a.insider_desc) ||
          a.description ||
          (typeof a.outside_desc === "string" && a.outside_desc) ||
          "";
        return {
          id: attractionSlug(a.name) || `live-${i}`,
          title: a.name,
          subtitle: (typeof a.type === "string" && a.type) || dest.city,
          img: a.image_url || dest.featured[i % dest.featured.length]?.img || dest.hero,
          duration: a.duration || "10–20 min",
          rating: typeof a.rating === "number" ? a.rating : 4.8,
          stops: 1,
          distance: dest.city,
          category: (typeof a.category === "string" && a.category) || t("card.audioGuide"),
          description,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveAttractions, dest.city, dest.featured, dest.hero],
  );

  const places: NearPlace[] = placesFromLive.length > 0 ? placesFromLive : dest.featured;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate({ to: "/results", search: { q } });
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
      <div className="h-full overflow-y-auto pb-24 scrollbar-hide">
        {/* ─── HERO ─── */}
        <section className="relative h-[560px] w-full">
          <img
            src={dest.hero}
            alt={`${dest.city}, ${dest.country}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-hero" />

          {/* top bar */}
          <div className="absolute left-5 right-5 top-12 z-[5] flex items-start justify-between">
            <div className="flex items-start gap-2">
              <Link
                to="/"
                aria-label={t("dest.backHome")}
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  {t("dest.currentlyIn")}
                  {!online && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-accent">
                      <WifiOff className="h-2.5 w-2.5" /> {t("home.offline")}
                    </span>
                  )}
                </div>
                <Link
                  to="/destinations"
                  className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground transition-smooth hover:text-primary"
                >
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {city}, {country}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Link>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to="/settings"
                aria-label={t("nav.settings")}
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/language"
                aria-label={t("nav.language")}
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <Globe className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/notifications"
                aria-label={t("nav.notifications")}
                className="relative grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <Bell className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* hero copy */}
          <div className="absolute bottom-8 left-5 right-5 z-[5]">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
              <span className="relative h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-primary" />
                <span className="absolute -inset-0.5 animate-ping rounded-full bg-primary opacity-40" />
              </span>
              {t("dest.featuredTour")}
            </span>
            <h1
              className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.02em] text-foreground"
              style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
            >
              {headline1} <span className="italic text-primary">{headline2}</span>
            </h1>
            <p className="mt-3.5 max-w-[300px] text-[13.5px] leading-[1.55] text-foreground/75">
              {blurb}
            </p>
          </div>
        </section>

        {/* ─── SEARCH ─── */}
        <section className="mt-6 px-5">
          <form
            onSubmit={submitSearch}
            className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-3 transition-smooth focus-within:border-primary/60"
          >
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dest.searchIn", { city })}
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query.trim() && (
              <button
                type="submit"
                className="rounded-full bg-gradient-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition-smooth hover:scale-105"
              >
                {t("home.search")}
              </button>
            )}
          </form>
        </section>

        {/* ─── CATEGORIES ─── */}
        <section className="mt-5">
          <div className="flex gap-2 overflow-x-auto px-5 scrollbar-hide">
            {CATEGORIES.map((c) => {
              const on = cat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                    on
                      ? "bg-foreground text-background"
                      : "border border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── INSIDE {city} — top attractions from n8n ─── */}
        <section className="mt-8">
          <div className="flex items-end justify-between px-5">
            <div>
              <h2
                className="text-[26px] font-medium tracking-[-0.02em] text-foreground"
                style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
              >
                {t("dest.insideWord")} <span className="italic text-primary">{city}</span>
              </h2>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {loadingAttractions
                  ? t("dest.loadingTop")
                  : liveAttractions && liveAttractions.length > 0
                    ? t("dest.topPicks")
                    : t("dest.insideSub")}
              </p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"
            >
              {t("dest.otherCities")} <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3 px-5">
            {loadingAttractions && placesFromLive.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-8 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("dest.loadingTop")}
              </div>
            ) : (
              places.map((p) => (
                <NearYouCard
                  key={p.id}
                  place={p}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId((curr) => (curr === p.id ? null : p.id))}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Featured-tour stat strip in the hero used to surface duration/rating/stops
// from `dest.featured[0]`. It was tied to the now-removed "Begin Journey"
// CTA, so we drop it together with the CTA — the page focuses on the live
// attractions list below the search instead.
