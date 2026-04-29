import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Bookmark,
  ChevronDown,
  Compass,
  Globe,
  Headphones,
  Home as HomeIcon,
  LogOut,
  MapPin,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  User as UserIcon,
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const unread = useUnreadCount();
  const selected = useSelectedDestination();
  const [query, setQuery] = useState("");
  const [heroIdx, setHeroIdx] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Defer client-only state (notifications) until after hydration.
  useEffect(() => setMounted(true), []);

  // Slow rotation through featured cinematic shots.
  useEffect(() => {
    const t = setInterval(
      () => setHeroIdx((i) => (i + 1) % HERO_ROTATION.length),
      7000,
    );
    return () => clearInterval(t);
  }, []);

  const heroDest = HERO_ROTATION[heroIdx];
  const featured = useMemo(() => DESTINATIONS.slice(0, 6), []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate({ to: "/destinations", search: { q } });
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
                Where next?
                {!online && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-accent">
                    <WifiOff className="h-2.5 w-2.5" /> Offline
                  </span>
                )}
              </div>
              <Link
                to="/destinations"
                className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground transition-smooth hover:text-primary"
              >
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {selected.city}, {selected.country}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Link>
            </div>
            <div className="flex gap-2">
              <Link
                to="/settings"
                aria-label="Settings"
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/language"
                aria-label="Change language"
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <Globe className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/notifications"
                aria-label="Notifications"
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
              Featured · {heroDest.country}
            </span>
            <h1
              className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.02em] text-foreground"
              style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
            >
              {heroDest.tagline.split("|")[0]}{" "}
              <span className="italic text-primary">
                {heroDest.tagline.split("|")[1]}
              </span>
            </h1>
            <p className="mt-3.5 max-w-[300px] text-[13.5px] leading-[1.55] text-foreground/75">
              {heroDest.blurb}
            </p>
            <Link
              to="/destination/$slug"
              params={{ slug: heroDest.slug }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.03]"
            >
              Open {heroDest.city}
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
              placeholder="Country, city, or landmark…"
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query.trim() ? (
              <button
                type="submit"
                className="rounded-full bg-gradient-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition-smooth hover:scale-105"
              >
                Search
              </button>
            ) : (
              <Link
                to="/destinations"
                className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-smooth hover:text-foreground"
              >
                Browse
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
                Curated <span className="italic text-primary">collections</span>
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Themes for the way you travel
              </p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {COLLECTIONS.map((c) => {
              const sample = destinationsByCollection(c.id)[0];
              return (
                <Link
                  key={c.id}
                  to="/destinations"
                  search={{ collection: c.id }}
                  className="group relative h-[140px] w-[200px] flex-shrink-0 overflow-hidden rounded-2xl border border-border"
                >
                  {sample && (
                    <img
                      src={sample.hero}
                      alt={c.label}
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
                      {c.label}
                    </div>
                    <div className="mt-0.5 text-[10px] text-foreground/65">
                      {c.tagline}
                    </div>
                  </div>
                </Link>
              );
            })}
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
                Featured <span className="italic text-primary">cities</span>
              </h2>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Cinematic walks, narrated by locals
              </p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"
            >
              See all <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3 px-5">
            {featured.map((d) => (
              <DestinationCard key={d.slug} dest={d} />
            ))}
          </div>
        </section>
      </div>

      <TabBar user={user} signOut={signOut} />
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Editorial destination card
 * ───────────────────────────────────────────── */
function DestinationCard({ dest }: { dest: Destination }) {
  const tours = dest.featured.length;
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
          {dest.country}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background/60 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-primary backdrop-blur-md">
          <Headphones className="h-2.5 w-2.5" /> {tours} tour{tours === 1 ? "" : "s"}
        </span>
      </div>

      <div className="absolute inset-x-4 bottom-3.5">
        <h3
          className="text-[24px] font-medium leading-[1.05] text-foreground"
          style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
        >
          {dest.city}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-foreground/70">
          {dest.vibe.slice(0, 3).map((v) => (
            <span
              key={v}
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

/* ─────────────────────────────────────────────
 * Tab bar (universal)
 * ───────────────────────────────────────────── */
type TabUser = { id: string } | null;

function TabBar({ user, signOut }: { user: TabUser; signOut: () => Promise<void> }) {
  return (
    <nav className="absolute bottom-0 left-0 right-0 z-40 flex h-[74px] items-start justify-around border-t border-border bg-background/85 px-2 pb-4 pt-2 backdrop-blur-xl">
      <Link
        to="/"
        className="flex flex-1 flex-col items-center gap-1 text-primary"
      >
        <HomeIcon className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">Home</span>
      </Link>
      <Link
        to="/destinations"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <Compass className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">Explore</span>
      </Link>
      <Link
        to="/map"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <MapPin className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">Map</span>
      </Link>
      <Link
        to="/saved"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <Bookmark className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">Saved</span>
      </Link>
      {user ? (
        <button
          onClick={() => signOut()}
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        >
          <LogOut className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">Sign out</span>
        </button>
      ) : (
        <Link
          to="/auth"
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        >
          <UserIcon className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">Sign in</span>
        </Link>
      )}
    </nav>
  );
}

