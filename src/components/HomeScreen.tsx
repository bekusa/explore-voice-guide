import { useState } from "react";
import {
  Search,
  MapPin,
  User,
  Layers,
  Compass,
  Navigation,
  Sparkles,
  Filter,
  Headphones,
  Play,
  Star,
  Clock,
  ChevronRight,
  Download,
  Home as HomeIcon,
  Bookmark,
  LogOut,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import abanotubaniImg from "@/assets/abanotubani.jpg";
import samebaImg from "@/assets/sameba.jpg";
import rustaveliImg from "@/assets/rustaveli.jpg";
import heroImg from "@/assets/tbilisi-hero.jpg";

/* ─────────────────────────────────────────────
 * V2 · ATLAS MAP — map-first home screen
 * Full-bleed stylized map background, pin markers
 * for audio-guide stops, draggable bottom sheet
 * with horizontal cards + curated lists.
 * Apple Maps × Spotify hybrid for travelers.
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
  price: string;
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
    price: "Free",
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
    price: "Free",
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
    price: "₾4",
  },
  {
    id: "narikala",
    title: "Narikala Ascent",
    subtitle: "Fortress above the city",
    img: heroImg,
    duration: "26 min",
    rating: 4.81,
    stops: 7,
    distance: "0.9 km",
    category: "Fortress",
    price: "Free",
  },
];

const CURATED = [
  { title: "A poet's walk through Rustaveli", meta: "11 stops · 47 min", img: rustaveliImg },
  { title: "Sulfur, silk, and street food", meta: "7 stops · 32 min", img: abanotubaniImg },
];

const FILTERS = ["All · 12", "Historic", "Sacred", "Hidden gems", "Under 30 min", "Free"];

// Pin positions are percentages of the phone frame so they scale across viewports
const PINS = [
  { x: 33, y: 38, label: "Abanotubani" },
  { x: 59, y: 31, label: "Sameba", accent: true },
  { x: 44, y: 53, label: "Rustaveli" },
  { x: 23, y: 24, label: "Narikala" },
];

type SheetState = "low" | "mid" | "high";

export function HomeScreen() {
  const [sheet, setSheet] = useState<SheetState>("mid");
  const [sel, setSel] = useState(0);
  const { user, signOut } = useAuth();

  // Sheet covers a fraction of the viewport — pulled up reveals more cards
  const sheetTopClass =
    sheet === "low" ? "top-[70%]" : sheet === "high" ? "top-[15%]" : "top-[45%]";

  const cycleSheet = () => setSheet(sheet === "low" ? "mid" : sheet === "mid" ? "high" : "low");

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
      {/* MAP BACKGROUND */}
      <MapBackground />

      {/* TOP CONTROLS — search + profile */}
      <header className="absolute inset-x-4 top-12 z-20 flex items-center gap-2.5">
        <div className="flex flex-1 items-center gap-2.5 rounded-full border border-border bg-background/85 px-4 py-3 backdrop-blur-xl">
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
          <span className="flex-1 truncate text-[13px] text-muted-foreground">Search Tbilisi</span>
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            ქა ⌄
          </span>
        </div>
        {user ? (
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-xl transition-smooth hover:bg-card"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
          </button>
        ) : (
          <Link
            to="/auth"
            aria-label="Sign in"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur-xl transition-smooth hover:bg-card"
          >
            <User className="h-4 w-4" strokeWidth={1.8} />
          </Link>
        )}
      </header>

      {/* RIGHT-SIDE CONTROL STACK — map layers, compass, directions, AI */}
      <div className="absolute right-3 top-32 z-20 flex flex-col gap-2">
        {[Layers, Compass, Navigation, Sparkles].map((Icon, i) => (
          <button
            key={i}
            aria-label={["Map layers", "Compass", "Directions", "AI suggestions"][i]}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background/80 text-foreground shadow-soft backdrop-blur-xl transition-smooth hover:bg-card"
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </button>
        ))}
      </div>

      {/* MAP PINS */}
      {PINS.map((p, i) => {
        const on = i === sel;
        return (
          <button
            key={i}
            onClick={() => setSel(i)}
            className="absolute z-10 flex flex-col items-center"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            {on && (
              <span className="mb-1.5 whitespace-nowrap rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur-md">
                {p.label}
              </span>
            )}
            <span
              className={`grid place-items-center rounded-full transition-all ${
                on
                  ? "h-10 w-10 bg-gradient-gold text-primary-foreground shadow-glow"
                  : p.accent
                    ? "h-7 w-7 bg-primary text-primary-foreground"
                    : "h-7 w-7 bg-foreground text-background"
              }`}
              style={{
                border: "2px solid var(--card)",
                boxShadow: on ? undefined : "0 4px 10px oklch(0 0 0 / 0.35)",
              }}
            >
              <Headphones className={on ? "h-4 w-4" : "h-3 w-3"} strokeWidth={2} />
            </span>
            {/* tail */}
            <span className={`h-2.5 w-px ${on ? "bg-primary" : "bg-foreground"} opacity-60`} />
            <span
              className={`h-1.5 w-1.5 rounded-full ${on ? "bg-primary" : "bg-foreground"}`}
              style={{ boxShadow: "0 0 0 3px oklch(0.97 0.012 80 / 0.18)" }}
            />
          </button>
        );
      })}

      {/* AI TOUR PICKS — floating chip over the map */}
      <button className="absolute left-4 top-[170px] z-[15] flex items-center gap-2 rounded-full border border-primary/40 bg-card/95 py-1.5 pl-1.5 pr-3 shadow-glow backdrop-blur-md transition-smooth hover:scale-[1.02]">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-gold text-primary-foreground">
          <Sparkles className="h-2.5 w-2.5" strokeWidth={2.4} />
        </span>
        <span className="text-[11px] font-semibold text-foreground">AI tour picks for today</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* BOTTOM SHEET */}
      <section
        className={`absolute inset-x-0 bottom-0 z-20 ${sheetTopClass} overflow-hidden rounded-t-[28px] border-t border-border bg-card/95 shadow-elegant backdrop-blur-2xl transition-[top] duration-300`}
        style={{ transitionTimingFunction: "var(--transition-smooth)" }}
      >
        {/* drag handle (tap to cycle through low/mid/high) */}
        <button
          onClick={cycleSheet}
          aria-label="Toggle sheet height"
          className="grid w-full cursor-pointer place-items-center pb-1.5 pt-2.5"
        >
          <div className="h-1 w-9 rounded-full bg-foreground/25" />
        </button>

        <div className="h-full overflow-y-auto pb-24 scrollbar-hide">
          {/* sheet header */}
          <div className="flex items-center justify-between px-5 pb-3.5 pt-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Along your route
              </div>
              <div className="mt-0.5 font-display text-[22px] font-medium leading-tight text-foreground">
                {PLACES.length} audio stops nearby
              </div>
            </div>
            <button
              aria-label="Filter"
              className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground transition-smooth hover:bg-card"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* filter chips */}
          <div className="flex gap-1.5 overflow-x-auto px-5 pb-3.5 scrollbar-hide">
            {FILTERS.map((c, i) => (
              <button
                key={c}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-smooth ${
                  i === 0
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-transparent text-foreground hover:border-primary/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* horizontal cards */}
          <div className="flex gap-3 overflow-x-auto px-5 pb-4 scrollbar-hide">
            {PLACES.map((p, i) => (
              <article
                key={p.id}
                onClick={() => setSel(i)}
                className={`w-60 flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl border transition-smooth ${
                  sel === i ? "border-primary/55 shadow-glow" : "border-border"
                }`}
                style={{ backgroundColor: "oklch(0.22 0.014 60)" }}
              >
                <div className="relative h-32">
                  <img
                    src={p.img}
                    alt={p.title}
                    width={480}
                    height={256}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-semibold text-foreground backdrop-blur-md">
                    {p.category}
                  </span>
                  <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-primary-foreground">
                    <Play className="h-3 w-3 translate-x-px fill-current" />
                  </span>
                  {i === 0 && (
                    <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary backdrop-blur-md">
                      <Download className="h-2.5 w-2.5" /> Offline
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-[13.5px] font-semibold text-foreground">{p.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{p.subtitle}</div>
                  <div className="mt-2 flex gap-2 text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" /> {p.distance}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> {p.duration}
                    </span>
                    <span className="flex items-center gap-1 text-primary">
                      <Star className="h-2.5 w-2.5 fill-current" /> {p.rating}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* curated lists */}
          <div className="px-5 pb-8 pt-1.5">
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Curated lists
            </div>
            {CURATED.map((r, i) => (
              <div
                key={r.title}
                className={`flex items-center gap-3 py-2.5 ${
                  i < CURATED.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="h-11 w-11 overflow-hidden rounded-lg">
                  <img
                    src={r.img}
                    alt=""
                    width={88}
                    height={88}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-foreground">{r.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{r.meta}</div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <NowPlaying />
      <TabBar />
    </div>
  );
}

/* ─────────────────────────────────────────────
 * MAP BACKGROUND
 * Stylized abstract map: river (Mtkvari), parks,
 * roads, labels. Pure SVG so it scales freely.
 * ───────────────────────────────────────────── */
function MapBackground() {
  const land = "oklch(0.22 0.015 60)";
  const road = "oklch(0.30 0.012 60)";
  const water = "oklch(0.30 0.04 230)";
  const park = "oklch(0.28 0.04 150)";
  const label = "oklch(0.70 0.025 70)";

  const majorRoads = [
    "M 0 250 L 390 220",
    "M 0 400 L 390 350",
    "M 0 560 L 390 600",
    "M 0 680 L 390 700",
    "M 60 0 L 130 800",
    "M 200 0 L 180 800",
    "M 320 0 L 350 800",
  ];

  return (
    <div className="absolute inset-0" style={{ background: land }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 390 800"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* river — soft outer halo + sharper core */}
        <path
          d="M -20 180 C 80 200, 120 260, 180 290 S 260 380, 240 500 S 180 680, 220 820"
          stroke={water}
          strokeWidth="58"
          fill="none"
          opacity="0.35"
        />
        <path
          d="M -20 180 C 80 200, 120 260, 180 290 S 260 380, 240 500 S 180 680, 220 820"
          stroke={water}
          strokeWidth="40"
          fill="none"
          opacity="0.85"
        />

        {/* parks */}
        <ellipse cx="90" cy="520" rx="75" ry="50" fill={park} />
        <ellipse cx="320" cy="280" rx="55" ry="40" fill={park} />

        {/* major roads */}
        {majorRoads.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke={road}
            strokeWidth={i % 2 ? 2 : 3.5}
            fill="none"
            opacity={0.9}
          />
        ))}

        {/* minor roads — pseudorandom from index */}
        {Array.from({ length: 12 }).map((_, i) => (
          <path
            key={`m${i}`}
            d={`M ${i * 32} ${50 + ((i * 60) % 700)} l ${40 + i * 3} ${(i * 7) % 40}`}
            stroke={road}
            strokeWidth="1"
            fill="none"
            opacity={0.5}
          />
        ))}

        {/* labels */}
        <text
          x="40"
          y="470"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          fill={label}
          letterSpacing="3"
        >
          PARK
        </text>
        <text
          x="220"
          y="360"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          fill={label}
          letterSpacing="3"
        >
          MTKVARI
        </text>
      </svg>

      {/* vignette to focus the eye toward the centre */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, oklch(0.16 0.012 60 / 0.32) 100%)",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
 * NOW PLAYING — sticky mini player
 * Sits above the tab bar. Shows current chapter,
 * animated wave bars, and play/pause.
 * ───────────────────────────────────────────── */
function NowPlaying() {
  return (
    <div className="absolute inset-x-3 bottom-[88px] z-30">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-3 py-2.5 shadow-elegant backdrop-blur-xl">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
          <img
            src={abanotubaniImg}
            alt=""
            width={88}
            height={88}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">
            Chapter 4 · The Armenian Quarter
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-3 items-center gap-[2px]">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-full w-[2px] origin-center animate-wave rounded-full bg-primary"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">06:18 / 11:42</span>
          </div>
        </div>
        <button
          aria-label="Pause"
          className="grid h-10 w-10 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow"
        >
          <span className="flex gap-[3px]">
            <span className="h-3 w-[3px] rounded-sm bg-current" />
            <span className="h-3 w-[3px] rounded-sm bg-current" />
          </span>
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * TAB BAR — bottom navigation
 * Home · Explore · Map (active) · Saved · Auth
 * ───────────────────────────────────────────── */
function TabBar() {
  const { user, signOut } = useAuth();
  const tabs = [
    { icon: HomeIcon, label: "Home" },
    { icon: Compass, label: "Explore" },
    { icon: MapPin, label: "Map", active: true },
    { icon: Bookmark, label: "Saved" },
  ];
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl md:rounded-b-[3rem]">
      <div className="mx-auto flex max-w-md items-center justify-around px-3 py-3 pb-5">
        {tabs.map((t) => (
          <button
            key={t.label}
            className={`flex flex-col items-center gap-1 transition-smooth ${
              t.active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon
              className={`h-5 w-5 ${t.active ? "fill-primary/20 stroke-primary" : ""}`}
              strokeWidth={t.active ? 2.2 : 1.8}
            />
            <span className="text-[10px] font-medium">{t.label}</span>
          </button>
        ))}
        {user ? (
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Sign out</span>
          </button>
        ) : (
          <Link
            to="/auth"
            className="flex flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <User className="h-5 w-5" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Sign in</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
