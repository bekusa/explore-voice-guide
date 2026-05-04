import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Globe,
  MapPin,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  WifiOff,
} from "lucide-react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useSelectedDestination } from "@/hooks/useSelectedDestination";
import { useT, useTranslated, useTranslatedString } from "@/hooks/useT";
import { DESTINATIONS, type Destination } from "@/lib/destinations";
import { CITY_LIST } from "@/lib/cityList";
import { CityCard } from "@/components/CityCard";
import {
  ATTRACTIONS as TIME_MACHINE_ATTRACTIONS,
  type Attraction as TimeMachineAttraction,
} from "@/components/TimeMachine";

/* ─────────────────────────────────────────────
 * UNIVERSAL HOME · Editorial magazine
 *
 * - Cinematic rotating hero (selected destination)
 * - "Where to next?" location chip → destinations browser
 * - Search bar (any city / landmark / vibe)
 * - Time Machine strip — top 10 immersive moments by score
 * - Featured destinations — large editorial cards
 * - Mini player + tab bar (kept consistent across the app)
 * ───────────────────────────────────────────── */

// Top 10 Time Machine attractions by score — surfaced as the home
// strip so first-time visitors can dip into a moment with one tap.
const TIME_MACHINE_TOP_10 = [...TIME_MACHINE_ATTRACTIONS]
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

const HERO_ROTATION = ["tbilisi", "rome", "kyoto", "lisbon", "marrakech"]
  .map((slug) => DESTINATIONS.find((d) => d.slug === slug))
  .filter((d): d is Destination => !!d);

export function HomeScreen() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const unread = useUnreadCount();
  const selected = useSelectedDestination();
  const t = useT();
  const [query, setQuery] = useState("");
  const [heroIdx, setHeroIdx] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Defer client-only state (notifications) until after hydration.
  useEffect(() => setMounted(true), []);

  // Slow rotation through featured cinematic shots.
  useEffect(() => {
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_ROTATION.length), 7000);
    return () => clearInterval(t);
  }, []);

  const heroDest = HERO_ROTATION[heroIdx];

  // Translate the selected destination + hero copy on the fly.
  const [selectedCity, selectedCountry] = useTranslated([selected.city, selected.country]);
  const taglineParts = heroDest.tagline.split("|");
  const [heroCountry, heroPart1, heroPart2, heroBlurb, heroCity] = useTranslated([
    heroDest.country,
    taglineParts[0] ?? "",
    taglineParts[1] ?? "",
    heroDest.blurb,
    heroDest.city,
  ]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Send the query straight to the n8n-backed /results page so any city,
    // country or landmark resolves through the Lokali Attractions workflow.
    navigate({ to: "/results", search: { q } });
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
      <div className="h-full overflow-y-auto pb-36 scrollbar-hide">
        {/* ─── HERO ─── */}
        <section className="relative h-[600px] w-full overflow-hidden">
          {HERO_ROTATION.map((d, i) => (
            <img
              key={d.slug}
              src={d.hero}
              alt={`${d.city}, ${d.country}`}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
                i === heroIdx ? "scale-100 opacity-100" : "scale-105 opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-hero" />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/60 to-transparent" />

          {/* top bar */}
          <div className="absolute left-5 right-5 top-12 z-[5] flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                {t("home.whereNext")}
                {!online && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-accent">
                    <WifiOff className="h-2.5 w-2.5" /> {t("home.offline")}
                  </span>
                )}
              </div>
              <Link
                to="/destinations"
                className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate text-[15px] font-semibold text-foreground transition-smooth hover:text-primary"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  {selectedCity}, {selectedCountry}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </Link>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                to="/settings"
                aria-label={t("nav.settings")}
                className="grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
              >
                <SettingsIcon className="h-4 w-4" />
              </Link>
              <Link
                to="/language"
                aria-label={t("nav.language")}
                className="grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
              >
                <Globe className="h-4 w-4" />
              </Link>
              <Link
                to="/notifications"
                aria-label={t("nav.notifications")}
                className="relative grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
              >
                <Bell className="h-4 w-4" />
                {mounted && unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* hero copy */}
          <div className="absolute bottom-9 left-5 right-5 z-[5]">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
              <Sparkles className="h-2.5 w-2.5" />
              {t("home.featuredBadge")} · {heroCountry}
            </span>
            <h1 className="font-display mt-4 text-[44px] font-medium leading-[0.98] tracking-[-0.025em] text-foreground">
              {heroPart1} <span className="italic text-primary">{heroPart2}</span>
            </h1>
            <p className="mt-4 max-w-[320px] text-[14px] leading-[1.55] text-foreground/75">
              {heroBlurb}
            </p>
            <Link
              to="/destination/$slug"
              params={{ slug: heroDest.slug }}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-gold px-6 text-[12px] font-bold uppercase tracking-[0.18em] text-primary-foreground shadow-glow transition-smooth active:scale-95 hover:scale-[1.03]"
            >
              {t("home.openCity", { city: heroCity })}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* ─── SEARCH ─── */}
        <section className="-mt-6 relative z-10 px-5">
          <form
            onSubmit={submitSearch}
            className="flex h-14 items-center gap-3 rounded-full border border-border bg-card px-5 shadow-elegant transition-smooth focus-within:border-primary/60"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query.trim() ? (
              <button
                type="submit"
                className="h-9 shrink-0 rounded-full bg-gradient-gold px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground transition-smooth active:scale-95 hover:scale-105"
              >
                {t("home.search")}
              </button>
            ) : (
              <Link
                to="/destinations"
                className="h-9 shrink-0 inline-flex items-center rounded-full border border-border bg-secondary/60 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-smooth hover:text-foreground"
              >
                {t("home.browse")}
              </Link>
            )}
          </form>
        </section>

        {/* ─── TIME MACHINE STRIP ─── */}
        <section className="mt-9">
          <div className="mb-4 flex items-end justify-between px-5">
            <div>
              <h2 className="font-display text-[22px] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {t("home.timeMachine.title")}
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {t("home.timeMachine.sub")}
              </p>
            </div>
            <Link
              to="/time-machine"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary transition-smooth hover:opacity-80"
            >
              {t("home.seeAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {TIME_MACHINE_TOP_10.map((a, i) => (
              <TimeMachineMomentCard key={a.id} attraction={a} rank={i + 1} />
            ))}
          </div>
        </section>

        {/* ─── FEATURED DESTINATIONS ─── */}
        <section className="mt-10">
          <div className="flex items-end justify-between px-5">
            <div>
              <h2 className="font-display text-[26px] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {t("home.featured.title")}
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {t("home.featured.sub")}
              </p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary transition-smooth hover:opacity-80"
            >
              {t("home.seeAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 px-5">
            {CITY_LIST.map((city, i) => (
              <CityCard key={city} city={city} index={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Time Machine moment card — one of the top-10 entries on Home.
 *
 * Cinematic single shot of the moment, era + year tags overlaid, rank
 * pill in the corner. Tap → /time-machine?id=<id>, where the chosen
 * card auto-expands and scrolls into view.
 * ───────────────────────────────────────────── */
function TimeMachineMomentCard({
  attraction,
  rank,
}: {
  attraction: TimeMachineAttraction;
  rank: number;
}) {
  // Free-form fields are translated on the fly; the era / year strings
  // live in the dataset in English so they round-trip through the
  // gateway just like destination blurbs.
  const [name, era] = useTranslated([attraction.name, attraction.era]);
  return (
    <Link
      to="/time-machine"
      search={{ id: attraction.id }}
      className="group relative h-[170px] w-[240px] flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/50 active:scale-[0.98]"
    >
      <img
        src={attraction.image}
        alt={name}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />

      {/* Rank pill */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-background/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-primary backdrop-blur-md">
        <Sparkles className="h-2.5 w-2.5" /> #{rank}
      </div>

      {/* Year pill */}
      <div className="absolute right-3 top-3 rounded-full border border-foreground/15 bg-background/45 px-2 py-0.5 text-[9.5px] font-semibold tracking-wide text-foreground/80 backdrop-blur-md">
        {attraction.year}
      </div>

      <div className="absolute inset-x-3.5 bottom-3.5">
        <div className="text-[18px] leading-none">{attraction.emoji}</div>
        <div className="mt-1.5 font-display text-[15px] font-medium leading-tight text-foreground line-clamp-2">
          {name}
        </div>
        <div className="mt-1 text-[10.5px] leading-snug text-foreground/65">{era}</div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────
 * Editorial destination card
 * ───────────────────────────────────────────── */
function DestinationCard({ dest }: { dest: Destination }) {
  const t = useT();
  const [city, country, ...vibes] = useTranslated([
    dest.city,
    dest.country,
    ...dest.vibe.slice(0, 3),
  ]);
  return (
    <Link
      to="/destination/$slug"
      params={{ slug: dest.slug }}
      className="group relative block h-[210px] overflow-hidden rounded-3xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant active:scale-[0.99]"
    >
      <img
        src={dest.hero}
        alt={`${dest.city}, ${dest.country}`}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

      <div className="absolute left-4 right-4 top-3.5 flex items-center justify-between">
        <span className="rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-foreground backdrop-blur-md">
          {country}
        </span>
        {/* Tour count pill removed per Beka's request — the number was
            sourced from the static `dest.featured.length` and didn't
            reflect what the n8n attractions workflow returns, so it
            was misleading. */}
      </div>

      <div className="absolute inset-x-4 bottom-4">
        <h3 className="font-display text-[26px] font-medium leading-[1.05] text-foreground">
          {city}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-foreground/70">
          {vibes.map((v, i) => (
            <span
              key={i}
              className="rounded-full border border-foreground/15 bg-background/40 px-2 py-0.5 backdrop-blur-md"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
