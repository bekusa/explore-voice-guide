import {
  Search,
  MapPin,
  Bell,
  Headphones,
  Play,
  Clock,
  Star,
  Compass,
  Bookmark,
  User,
  Home as HomeIcon,
  ArrowRight,
} from "lucide-react";
import heroImg from "@/assets/tbilisi-hero.jpg";
import abanotubaniImg from "@/assets/abanotubani.jpg";
import samebaImg from "@/assets/sameba.jpg";
import rustaveliImg from "@/assets/rustaveli.jpg";

const categories = [
  { label: "All", active: true },
  { label: "Historic" },
  { label: "Sacred" },
  { label: "Culinary" },
  { label: "Hidden" },
];

const nearby = [
  {
    title: "Abanotubani Steam",
    duration: "18 min",
    rating: 4.92,
    img: abanotubaniImg,
  },
  {
    title: "Sameba at Dusk",
    duration: "24 min",
    rating: 4.88,
    img: samebaImg,
  },
  {
    title: "Rustaveli Reverie",
    duration: "31 min",
    rating: 4.9,
    img: rustaveliImg,
  },
];

export function HomeScreen() {
  return (
    <div className="relative pb-32 bg-background text-foreground">
      {/* HERO */}
      <section className="relative h-[620px] w-full overflow-hidden">
        <img
          src={heroImg}
          alt="Old Tbilisi rooftops at golden hour with sulfur bath domes"
          width={1024}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-hero" />

        {/* Top bar */}
        <header className="relative z-10 flex items-start justify-between px-6 pt-12">
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-primary">
              Currently in
            </span>
            <span className="mt-1.5 flex items-center gap-1.5 text-[15px] font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
              Tbilisi, Georgia
            </span>
          </div>
          <button
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/30 backdrop-blur-md transition-smooth hover:bg-background/50"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
        </header>

        {/* Hero copy */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-9 animate-float-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Featured Tour
            </span>
          </span>

          <h1 className="mt-5 font-display text-[2.5rem] font-medium leading-[1.02] text-foreground">
            Whispers of <span className="italic text-primary">Old Tbilisi</span>
          </h1>

          <p className="mt-4 max-w-[19rem] text-[13.5px] leading-relaxed text-foreground/75">
            From sulfur baths and crooked balconies to the chants of Sioni — a cinematic walk through the soul of the old town.
          </p>

          <div className="mt-5 flex items-center gap-3 text-[11px] text-foreground/70">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> 47 min
            </span>
            <span className="h-3 w-px bg-foreground/25" />
            <span className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" /> 4.96
            </span>
            <span className="h-3 w-px bg-foreground/25" />
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> 12 stops
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 -mt-2 relative z-20">
        <button className="group flex w-full items-center justify-between rounded-2xl bg-gradient-gold px-5 py-4 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01]">
          <span className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15">
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
            </span>
            <span className="text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">
                Begin journey
              </span>
              <span className="block text-[14px] font-semibold">
                Listen to first chapter
              </span>
            </span>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
            Free
          </span>
        </button>
      </section>

      {/* SEARCH */}
      <section className="mt-6 px-6">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3.5 shadow-soft">
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
          <input
            placeholder="Search places, stories, themes…"
            className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="mt-6">
        <div className="flex gap-2 overflow-x-auto px-6 scrollbar-hide">
          {categories.map((c) => (
            <button
              key={c.label}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-smooth ${
                c.active
                  ? "bg-foreground text-background"
                  : "border border-border bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* NEAR YOU */}
      <section className="mt-10">
        <div className="flex items-end justify-between px-6">
          <div>
            <h2 className="font-display text-[28px] font-medium leading-tight text-foreground">
              Near <span className="italic text-primary">you</span>
            </h2>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Curated stops within walking distance
            </p>
          </div>
          <button className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            See all <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="mt-5 flex gap-4 overflow-x-auto px-6 pb-2 scrollbar-hide">
          {nearby.map((item, i) => (
            <article
              key={item.title}
              className="group flex w-[300px] shrink-0 items-center gap-3 rounded-2xl border border-border/60 p-3 transition-smooth hover:border-primary/40 hover:shadow-soft"
              style={{
                backgroundColor: "oklch(0.20 0.014 60)",
                animation: `float-up 0.6s ${i * 0.08 + 0.1}s var(--transition-smooth) both`,
              }}
            >
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl">
                <img
                  src={item.img}
                  alt={item.title}
                  width={144}
                  height={144}
                  loading="lazy"
                  className="h-full w-full object-cover transition-smooth group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <h3 className="text-[14px] font-semibold leading-tight text-foreground">
                  {item.title}
                </h3>
                <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Headphones className="h-3 w-3" /> Audio guide
                </p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.duration}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    {item.rating}
                  </span>
                </div>
              </div>
              <button
                aria-label={`Play ${item.title}`}
                className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-smooth hover:bg-primary hover:text-primary-foreground"
              >
                <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* NOW PLAYING (mini) */}
      <NowPlaying />

      {/* TAB BAR */}
      <TabBar />
    </div>
  );
}

function NowPlaying() {
  return (
    <div className="fixed bottom-20 left-0 right-0 z-30 px-4 md:absolute md:left-1/2 md:-translate-x-1/2 md:max-w-[388px]">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/90 px-3 py-2.5 shadow-elegant backdrop-blur-xl">
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
            Chapter 2 · Sulfur & Stone
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-3 items-center gap-[2px]">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-full w-[2px] origin-center rounded-full bg-primary animate-wave"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">04:12 / 09:30</span>
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

function TabBar() {
  const tabs = [
    { icon: HomeIcon, label: "Home", active: true },
    { icon: Compass, label: "Explore" },
    { icon: Bookmark, label: "Saved" },
    { icon: User, label: "Profile" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/80 backdrop-blur-xl md:absolute md:rounded-b-[3rem]">
      <div className="mx-auto flex max-w-md items-center justify-around px-4 py-3 pb-5">
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
      </div>
    </nav>
  );
}
