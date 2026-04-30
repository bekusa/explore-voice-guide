import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Globe,
  Headphones,
  MapPin,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useSelectedDestination } from "@/hooks/useSelectedDestination";
import { useT, useTranslated, useTranslatedString } from "@/hooks/useT";
import {
  COLLECTIONS,
  DESTINATIONS,
  destinationsByCollection,
  type Destination,
} from "@/lib/destinations";

/* ─────────────────────────────────────────────
 * UNIVERSAL HOME · Editorial magazine
 *
 * - Cinematic rotating hero (selected destination)
 * - "Where to next?" location chip → destinations browser
 * - Search bar (any city / landmark / vibe)
 * - Curated collections strip
 * - Featured destinations — large editorial cards
 * - Mini player + tab bar (kept consistent across the app)
 * ───────────────────────────────────────────── */

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
  const featured = useMemo(() => DESTINATIONS.slice(0, 6), []);

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
        <section className="relative h-[560px] w-full overflow-hidden">
          {HERO_ROTATION.map((d, i) => (
            <img
              key={d.slug}
              src={d.hero}
              alt={`${d.city}, ${d.country}`}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
                i === heroIdx ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-hero" />

          {/* top bar */}
          <div className="absolute left-5 right-5 top-12 z-[5] flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                {t("home.whereNext")}
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
                {selectedCity}, {selectedCountry}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Link>
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
                {mounted && unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* hero copy */}
          <div className="absolute bottom-8 left-5 right-5 z-[5]">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
              <Sparkles className="h-2.5 w-2.5" />
              {t("home.featuredBadge")} · {heroCountry}
            </span>
            <h1
              className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.02em] text-foreground"
              style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
            >
              {heroPart1} <span className="italic text-primary">{heroPart2}</span>
            </h1>
            <p className="mt-3.5 max-w-[300px] text-[13.5px] leading-[1.55] text-foreground/75">
              {heroBlurb}
            </p>
            <Link
              to="/destination/$slug"
              params={{ slug: heroDest.slug }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.03]"
            >
              {t("home.openCity", { city: heroCity })}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </section>

        {/* ─── SEARCH ─── */}
        <section className="mt-5 px-5">
          <form
            onSubmit={submitSearch}
            className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-3 transition-smooth focus-within:border-primary/60"
          >
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query.trim() ? (
              <button
                type="submit"
                className="rounded-full bg-gradient-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition-smooth hover:scale-105"
              >
                {t("home.search")}
              </button>
            ) : (
              <Link
                to="/destinations"
                className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-smooth hover:text-foreground"
              >
                {t("home.browse")}
              </Link>
            )}
          </form>
        </section>

        {/* ─── COLLECTIONS ─── */}
        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between px-5">
            <div>
              <h2
                className="text-[22px] font-medium tracking-[-0.02em] text-foreground"
                style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
              >
                {t("home.collections.title")}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("home.collections.sub")}
              </p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
            <TimeMachineCollectionCard />
            {COLLECTIONS.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        </section>

        {/* ─── FEATURED DESTINATIONS ─── */}
        <section className="mt-8">
          <div className="flex items-end justify-between px-5">
            <div>
              <h2
                className="text-[26px] font-medium tracking-[-0.02em] text-foreground"
                style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
              >
                {t("home.featured.title")}
              </h2>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{t("home.featured.sub")}</p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"
            >
              {t("home.seeAll")} <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3 px-5">
            {featured.map((d) => (
              <DestinationCard key={d.slug} dest={d} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Editorial collection card
 * ───────────────────────────────────────────── */
function CollectionCard({ collection }: { collection: (typeof COLLECTIONS)[number] }) {
  const sample = destinationsByCollection(collection.id)[0];
  const [label, tagline] = useTranslated([collection.label, collection.tagline]);
  return (
    <Link
      to="/destinations"
      search={{ collection: collection.id }}
      className="group relative h-[140px] w-[200px] flex-shrink-0 overflow-hidden rounded-2xl border border-border"
    >
      {sample && (
        <img
          src={sample.hero}
          alt={label}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute inset-x-3 bottom-3">
        <div
          className="text-[15px] font-medium leading-tight text-foreground"
          style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
        >
          {label}
        </div>
        <div className="mt-0.5 text-[10px] text-foreground/65">{tagline}</div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────
 * Time Machine — featured collection card
 * Distinguished gold/dark editorial tile that opens the immersive
 * historical simulation experience at /time-machine.
 * ───────────────────────────────────────────── */
function TimeMachineCollectionCard() {
  const t = useT();
  const [label, tagline] = useTranslated([
    "Time Machine",
    "Step inside history — 34 immersive moments",
  ]);
  return (
    <Link
      to="/time-machine"
      className="group relative h-[140px] w-[220px] flex-shrink-0 overflow-hidden rounded-2xl border border-primary/50 shadow-glow"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.18_0.04_60)] via-[oklch(0.12_0.02_60)] to-black" />
      <div
        aria-hidden
        className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-gradient-gold opacity-30 blur-2xl transition-opacity group-hover:opacity-50"
      />
      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-background/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-md">
        <Sparkles className="h-2.5 w-2.5" /> New
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <div
          className="text-[15px] font-medium leading-tight text-primary"
          style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
        >
          {label}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[10px] text-foreground/70">{tagline}</div>
      </div>
      <ArrowRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
      {/* suppress unused t */}
      <span className="hidden">{t("home.collections.title")}</span>
    </Link>
  );
}

/* ─────────────────────────────────────────────
 * Editorial destination card
 * ───────────────────────────────────────────── */
function DestinationCard({ dest }: { dest: Destination }) {
  const t = useT();
  const tours = dest.featured.length;
  const [city, country, ...vibes] = useTranslated([
    dest.city,
    dest.country,
    ...dest.vibe.slice(0, 3),
  ]);
  return (
    <Link
      to="/destination/$slug"
      params={{ slug: dest.slug }}
      className="group relative block h-[200px] overflow-hidden rounded-2xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant"
    >
      <img
        src={dest.hero}
        alt={`${dest.city}, ${dest.country}`}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

      <div className="absolute left-4 right-4 top-3 flex items-center justify-between">
        <span className="rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-foreground backdrop-blur-md">
          {country}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-primary backdrop-blur-md">
          <Headphones className="h-2.5 w-2.5" />{" "}
          {tours === 1 ? t("home.tours.one", { n: tours }) : t("home.tours.many", { n: tours })}
        </span>
      </div>

      <div className="absolute inset-x-4 bottom-3.5">
        <h3
          className="text-[24px] font-medium leading-[1.05] text-foreground"
          style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
        >
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

