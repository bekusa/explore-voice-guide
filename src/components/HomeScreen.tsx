import { useState } from "react";
import {
  Search,
  MapPin,
  Globe,
  Bell,
  ChevronDown,
  Play,
  Pause,
  Headphones,
  Star,
  Clock,
  ArrowRight,
  Compass,
  Bookmark,
  User as UserIcon,
  Home as HomeIcon,
  LogOut,
  Settings as SettingsIcon,
  WifiOff,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import abanotubaniImg from "@/assets/abanotubani.jpg";
import samebaImg from "@/assets/sameba.jpg";
import rustaveliImg from "@/assets/rustaveli.jpg";
import heroImg from "@/assets/tbilisi-hero.jpg";

/* ─────────────────────────────────────────────
 * V1 · CINEMATIC HOME
 * Tall hero photo, italic display title, gold CTA,
 * soft category pills, editorial "Near you" list,
 * Spotify-style mini player + tab bar.
 * ───────────────────────────────────────────── */

type Place = {
  id: string;
  title: string;
  subtitle: string;
  img: string;
  duration: string;
  rating: number;
  stops: number;
  distance: string;
  category: string;
};

const PLACES: Place[] = [
  {
    id: "abano",
    title: "Abanotubani Steam",
    subtitle: "Sulfur Baths · Old Town",
    img: abanotubaniImg,
    duration: "18 min",
    rating: 4.92,
    stops: 6,
    distance: "0.4 km",
    category: "Historic",
  },
  {
    id: "sameba",
    title: "Sameba at Dusk",
    subtitle: "Holy Trinity Cathedral",
    img: samebaImg,
    duration: "24 min",
    rating: 4.88,
    stops: 8,
    distance: "1.2 km",
    category: "Sacred",
  },
  {
    id: "rustaveli",
    title: "Rustaveli Reverie",
    subtitle: "Avenue of Poets",
    img: rustaveliImg,
    duration: "31 min",
    rating: 4.9,
    stops: 11,
    distance: "0.8 km",
    category: "Culture",
  },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "historic", label: "Historic" },
  { id: "sacred", label: "Sacred" },
  { id: "culinary", label: "Culinary" },
  { id: "hidden", label: "Hidden" },
  { id: "fortress", label: "Fortress" },
];

export function HomeScreen() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [cat, setCat] = useState("all");
  const [playing, setPlaying] = useState(true);
  const [query, setQuery] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate({ to: "/results", search: { q } });
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
      <div className="h-full overflow-y-auto pb-36 scrollbar-hide">
        {/* ─── HERO ─── */}
        <section className="relative h-[560px] w-full">
          <img
            src={heroImg}
            alt="Tbilisi old town at golden hour"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-hero" />

          {/* top bar */}
          <div className="absolute left-5 right-5 top-12 z-[5] flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                Currently in
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Tbilisi, Georgia
                <ChevronDown className="h-3 w-3 opacity-60" />
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
              <button className="relative grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth hover:bg-background/60">
                <Bell className="h-3.5 w-3.5" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
              </button>
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
              Whispers of <span className="italic text-primary">Old Tbilisi</span>
            </h1>
            <p className="mt-3.5 max-w-[300px] text-[13.5px] leading-[1.55] text-foreground/75">
              From sulfur baths and crooked balconies to the chants of Sioni — a cinematic walk
              through the soul of the old town.
            </p>
            <div className="mt-4 flex items-center gap-3 text-[11px] text-foreground/60">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> 47 min
              </span>
              <span className="h-2.5 w-px bg-foreground/20" />
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Star className="h-3 w-3 fill-primary" /> 4.96
              </span>
              <span className="h-2.5 w-px bg-foreground/20" />
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> 12 stops
              </span>
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="relative z-10 -mt-1 px-5">
          <button className="flex w-full items-center justify-between rounded-2xl bg-gradient-gold px-5 py-3.5 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01]">
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
          </button>
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
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                ⌘K
              </span>
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
                Near <span className="italic text-primary">you</span>
              </h2>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Curated stops within walking distance
              </p>
            </div>
            <button className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              See all <ArrowRight className="h-2.5 w-2.5" />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3 px-5">
            {PLACES.map((p) => (
              <article
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-smooth hover:border-primary/40"
              >
                <div className="h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl">
                  <img src={p.img} alt={p.title} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14.5px] font-semibold text-foreground">{p.title}</h3>
                  <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Headphones className="h-2.5 w-2.5" /> Audio guide
                  </p>
                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> {p.duration}
                    </span>
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Star className="h-2.5 w-2.5 fill-primary" /> {p.rating}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" /> {p.distance}
                    </span>
                  </div>
                </div>
                <button
                  aria-label={`Play ${p.title}`}
                  className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-smooth hover:scale-105"
                >
                  <Play className="h-3 w-3 fill-current" />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      <NowPlaying playing={playing} setPlaying={setPlaying} />
      <TabBar user={user} signOut={signOut} />
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Mini player — sticky above the tab bar
 * ───────────────────────────────────────────── */
function NowPlaying({
  playing,
  setPlaying,
}: {
  playing: boolean;
  setPlaying: (v: boolean) => void;
}) {
  const progress = 0.44;
  return (
    <div className="absolute bottom-[78px] left-2.5 right-2.5 z-30">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 p-2 shadow-elegant backdrop-blur-xl">
        <div className="h-[42px] w-[42px] flex-shrink-0 overflow-hidden rounded-xl">
          <img src={abanotubaniImg} alt="" className="h-full w-full object-cover" />
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

/* ─────────────────────────────────────────────
 * Tab bar — 5 tabs, auth-aware Profile slot
 * ───────────────────────────────────────────── */
type TabUser = { id: string } | null;

function TabBar({ user, signOut }: { user: TabUser; signOut: () => Promise<void> }) {
  const tabs = [
    { id: "home", icon: HomeIcon, label: "Home", to: "/" as const, active: true },
    { id: "explore", icon: Compass, label: "Explore", to: "/" as const, active: false },
    { id: "map", icon: MapPin, label: "Map", to: "/map" as const, active: false },
    { id: "saved", icon: Bookmark, label: "Saved", to: "/saved" as const, active: false },
  ];
  return (
    <nav className="absolute bottom-0 left-0 right-0 z-40 flex h-[74px] items-start justify-around border-t border-border bg-background/85 px-2 pb-4 pt-2 backdrop-blur-xl">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            to={t.to}
            className={`flex flex-1 flex-col items-center gap-1 transition-smooth ${
              t.active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
          >
            <Icon className="h-[19px] w-[19px]" />
            <span className="text-[10px] font-medium">{t.label}</span>
          </Link>
        );
      })}
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
