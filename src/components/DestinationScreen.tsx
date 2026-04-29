import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  ChevronDown,
  Clock,
  Compass,
  Globe,
  Home as HomeIcon,
  LogOut,
  MapPin,
  Pause,
  Play,
  Search,
  Settings as SettingsIcon,
  Star,
  User as UserIcon,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { NearYouCard } from "@/components/NearYouCard";
import type { Destination } from "@/lib/destinations";
import { setSelectedSlug } from "@/lib/destinationStore";
import { useT, useTranslated } from "@/hooks/useT";

/* ─────────────────────────────────────────────
 * DESTINATION SCREEN — what used to be the home screen
 * Now scoped to a single city, driven by the destinations catalog.
 * ───────────────────────────────────────────── */

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "historic", label: "Historic" },
  { id: "sacred", label: "Sacred" },
  { id: "culinary", label: "Culinary" },
  { id: "hidden", label: "Hidden" },
  { id: "fortress", label: "Fortress" },
];

export function DestinationScreen({ dest }: { dest: Destination }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const t = useT();
  const [cat, setCat] = useState("all");
  const [playing, setPlaying] = useState(true);
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

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate({ to: "/results", search: { q } });
  }

  const featured = dest.featured[0];

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
      <div className="h-full overflow-y-auto pb-36 scrollbar-hide">
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
                aria-label="Back to home"
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  Currently in
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
                  {dest.city}, {dest.country}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Link>
              </div>
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
              Featured Tour
            </span>
            <h1
              className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.02em] text-foreground"
              style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
            >
              {headline[0]} <span className="italic text-primary">{headline[1]}</span>
            </h1>
            <p className="mt-3.5 max-w-[300px] text-[13.5px] leading-[1.55] text-foreground/75">
              {dest.blurb}
            </p>
            {featured && (
              <div className="mt-4 flex items-center gap-3 text-[11px] text-foreground/60">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> {featured.duration}
                </span>
                <span className="h-2.5 w-px bg-foreground/20" />
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <Star className="h-3 w-3 fill-primary" /> {featured.rating}
                </span>
                <span className="h-2.5 w-px bg-foreground/20" />
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {featured.stops} stops
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ─── CTA ─── */}
        {featured && (
          <section className="relative z-10 -mt-1 px-5">
            <Link
              to="/player"
              search={{ name: featured.title }}
              className="flex w-full items-center justify-between rounded-2xl bg-gradient-gold px-5 py-3.5 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01]"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                <span className="text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">
                    Begin journey
                  </span>
                  <span className="block text-[14px] font-semibold">Listen to first chapter</span>
                </span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">
                Free · 3 min
              </span>
            </Link>
          </section>
        )}

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
              placeholder={`Search ${dest.city}…`}
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query.trim() && (
              <button
                type="submit"
                className="rounded-full bg-gradient-gold px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground transition-smooth hover:scale-105"
              >
                Search
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

        {/* ─── NEAR YOU ─── */}
        <section className="mt-8">
          <div className="flex items-end justify-between px-5">
            <div>
              <h2
                className="text-[26px] font-medium tracking-[-0.02em] text-foreground"
                style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
              >
                Inside <span className="italic text-primary">{dest.city}</span>
              </h2>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Curated stops, narrated by locals
              </p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"
            >
              Other cities <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3 px-5">
            {dest.featured.map((p) => (
              <NearYouCard
                key={p.id}
                place={p}
                expanded={expandedId === p.id}
                onToggle={() =>
                  setExpandedId((curr) => (curr === p.id ? null : p.id))
                }
              />
            ))}
          </div>
        </section>
      </div>

      {featured && <NowPlaying playing={playing} setPlaying={setPlaying} img={featured.img} />}
      <TabBar user={user} signOut={signOut} />
    </div>
  );
}

function NowPlaying({
  playing,
  setPlaying,
  img,
}: {
  playing: boolean;
  setPlaying: (v: boolean) => void;
  img: string;
}) {
  const progress = 0.44;
  return (
    <div className="absolute bottom-[78px] left-2.5 right-2.5 z-30">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 p-2 shadow-elegant backdrop-blur-xl">
        <div className="h-[42px] w-[42px] flex-shrink-0 overflow-hidden rounded-xl">
          <img src={img} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-foreground">
            Chapter 2 · Sulfur &amp; Stone
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="relative h-0.5 flex-1 rounded-full bg-foreground/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">4:12</span>
          </div>
        </div>
        <button
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause" : "Play"}
          className="grid h-9 w-9 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow transition-smooth hover:scale-105"
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
        </button>
      </div>
    </div>
  );
}

type TabUser = { id: string } | null;

function TabBar({ user, signOut }: { user: TabUser; signOut: () => Promise<void> }) {
  return (
    <nav className="absolute bottom-0 left-0 right-0 z-40 flex h-[74px] items-start justify-around border-t border-border bg-background/85 px-2 pb-4 pt-2 backdrop-blur-xl">
      <Link
        to="/"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
        activeOptions={{ exact: true }}
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
