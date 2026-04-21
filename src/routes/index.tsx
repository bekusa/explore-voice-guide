import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Bell, MapPin, Play, Star, Clock, Headphones, ChevronRight } from "lucide-react";
import { useT, hasFirstLaunched } from "@/lib/i18n";
import { listAttractions, type Attraction } from "@/lib/mockApi";
import heroTbilisi from "@/assets/hero-tbilisi.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lokali — Whispers of the world, in your language" },
      { name: "description", content: "Cinematic AI-narrated audio guides for travellers. Curated journeys, local stories, 37 languages." },
    ],
  }),
  component: DiscoverPage,
});

const FILTERS = ["All", "Historic", "Sacred", "Culinary", "Hidden"];

function DiscoverPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [items, setItems] = useState<Attraction[] | null>(null);
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!hasFirstLaunched()) navigate({ to: "/splash" });
  }, [navigate]);

  useEffect(() => { listAttractions().then(setItems); }, []);

  const featured = items?.[0];
  const nearby = items?.slice(1) ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate({ to: "/results", search: { q: q.trim() } });
  };

  return (
    <div className="animate-slide-in pt-safe pb-2">
      {/* Top bar */}
      <header className="flex items-start justify-between px-5 pb-5 pt-4">
        <div>
          <p className="text-[10px] font-semibold tracking-editorial text-primary-bright uppercase">
            Currently in
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary-bright" strokeWidth={2.4} />
            <h2 className="font-sans text-base font-semibold text-foreground">Tbilisi, Georgia</h2>
          </div>
        </div>
        <button
          aria-label="notifications"
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:border-primary"
        >
          <Bell className="h-4 w-4" />
        </button>
      </header>

      {/* HERO featured tour */}
      {featured && (
        <section className="px-5">
          <Link
            to="/attraction/$id"
            params={{ id: featured.id }}
            className="group relative block overflow-hidden rounded-3xl shadow-card transition-smooth"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-card">
              <img
                src={heroTbilisi}
                alt={featured.name}
                width={1080}
                height={1440}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-hero" />

              <div className="absolute inset-x-0 bottom-0 space-y-3 p-6">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold tracking-editorial text-primary-bright uppercase backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-bright" />
                  Featured Tour
                </span>
                <h1 className="font-display text-[34px] leading-[1.1] text-foreground">
                  Whispers of <em className="italic font-medium">Old Tbilisi</em>
                </h1>
                <p className="line-clamp-2 max-w-[90%] text-sm leading-relaxed text-foreground/85">
                  {featured.description}
                </p>
                <div className="flex items-center gap-3 pt-1 text-[11px] font-medium text-foreground/75">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {featured.durationMin} min
                  </span>
                  <span className="h-3 w-px bg-foreground/30" />
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-primary-bright text-primary-bright" /> {featured.rating.toFixed(2)}
                  </span>
                  <span className="h-3 w-px bg-foreground/30" />
                  <span>{featured.stops} stops</span>
                </div>
              </div>
            </div>
          </Link>

          {/* CTA pill */}
          <Link
            to="/player/$id"
            params={{ id: featured.id }}
            className="mt-4 flex items-center gap-4 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-amber transition-smooth hover:brightness-105"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
              <Play className="h-4 w-4 fill-current" />
            </span>
            <span className="flex-1">
              <span className="block text-[10px] font-bold tracking-editorial uppercase opacity-80">
                Begin Journey
              </span>
              <span className="block font-semibold leading-tight">Listen to first chapter</span>
            </span>
            <span className="text-sm font-bold">Free</span>
          </Link>
        </section>
      )}

      {!featured && (
        <div className="mx-5 aspect-[3/4] rounded-3xl shimmer" />
      )}

      {/* Search */}
      <form onSubmit={submit} className="mt-7 px-5">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search places, stories, themes..."
            className="h-13 w-full rounded-full border border-border bg-secondary py-3.5 pl-12 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </span>
        </div>
      </form>

      {/* Filters */}
      <div className="scrollbar-hide mt-5 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                active
                  ? "shrink-0 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                  : "shrink-0 rounded-full border border-border bg-transparent px-4 py-2 text-xs font-medium text-muted-foreground transition-smooth hover:text-foreground"
              }
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Near you section */}
      <section className="mt-8 pl-5">
        <div className="mb-4 flex items-end justify-between pr-5">
          <div>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              Near <em className="italic font-medium">you</em>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Curated stops within walking distance
            </p>
          </div>
          <Link
            to="/results"
            search={{ q: "" }}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary-bright"
          >
            See all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="scrollbar-hide flex gap-3 overflow-x-auto pr-5 pb-2">
          {(items === null ? Array.from({ length: 4 }) : nearby).map((a, i) =>
            a ? (
              <NearbyCard key={(a as Attraction).id} attr={a as Attraction} />
            ) : (
              <div key={i} className="h-24 w-[300px] shrink-0 rounded-2xl shimmer" />
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function NearbyCard({ attr }: { attr: Attraction }) {
  return (
    <Link
      to="/attraction/$id"
      params={{ id: attr.id }}
      className="group flex w-[300px] shrink-0 items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-smooth hover:border-primary/60"
    >
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-muted">
        <img
          src={attr.image}
          alt={attr.name}
          loading="lazy"
          width={144}
          height={144}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base leading-tight text-foreground">
          {attr.name}
        </h3>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Headphones className="h-3 w-3" /> Audio guide
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {attr.durationMin}m
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 fill-primary-bright text-primary-bright" /> {attr.rating.toFixed(2)}
          </span>
        </div>
      </div>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-smooth group-hover:bg-primary group-hover:text-primary-foreground">
        <Play className="h-3.5 w-3.5 fill-current" />
      </span>
    </Link>
  );
}
