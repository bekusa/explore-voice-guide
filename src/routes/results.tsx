import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Star, Headphones, Search } from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import {
  fetchAttractions,
  attractionSlug,
  type Attraction,
} from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";

type Search = { q: string };

export const Route = createFileRoute("/results")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({
    meta: [
      { title: "Search results — Whispers of Old Tbilisi" },
      { name: "description", content: "Curated attractions matching your search across Tbilisi." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const language = usePreferredLanguage();
  const [results, setResults] = useState<Attraction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(q);

  useEffect(() => {
    setQuery(q);
    let cancelled = false;
    setLoading(true);
    setResults(null);
    fetchAttractions(q, language)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error("Couldn't load attractions", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, language]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = query.trim();
    if (!next) return;
    navigate({ to: "/results", search: { q: next } });
  };

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-16 text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-6 pt-12 pb-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label="Back"
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <form onSubmit={submit} className="flex flex-1 items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-soft">
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search places, stories…"
                className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
              />
            </form>
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {loading
              ? "Searching…"
              : results
                ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”`
                : ""}
          </p>
        </header>

        {/* Body */}
        <section className="px-6 pt-6">
          {loading && <SkeletonList />}

          {!loading && results && results.length === 0 && (
            <EmptyState query={q} />
          )}

          {!loading && results && results.length > 0 && (
            <div className="flex flex-col gap-3">
              {results.map((a, i) => (
                <ResultCard key={`${a.name}-${i}`} attraction={a} index={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

function ResultCard({ attraction, index }: { attraction: Attraction; index: number }) {
  const slug = attractionSlug(attraction.name);
  return (
    <Link
      to="/attraction/$id"
      params={{ id: slug }}
      search={{ name: attraction.name }}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 transition-smooth hover:border-primary/40 hover:shadow-soft"
      style={{ animation: `float-up 0.5s ${index * 0.06 + 0.05}s var(--transition-smooth) both` }}
    >
      <div className="relative h-[78px] w-[78px] shrink-0 overflow-hidden rounded-xl bg-secondary">
        {attraction.image_url ? (
          <img
            src={attraction.image_url}
            alt={attraction.name}
            loading="lazy"
            className="h-full w-full object-cover transition-smooth group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-card">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <h3 className="text-[14px] font-semibold leading-tight text-foreground">
          {attraction.name}
        </h3>
        {attraction.description && (
          <p className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
            {attraction.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Headphones className="h-3 w-3" /> Audio guide
          </span>
          {typeof attraction.rating === "number" && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              {attraction.rating.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3"
          style={{ animation: `float-up 0.4s ${i * 0.06}s var(--transition-smooth) both` }}
        >
          <div className="h-[78px] w-[78px] shrink-0 animate-pulse rounded-xl bg-secondary" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/70" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-secondary/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="mt-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-card">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="mt-5 font-display text-[22px] text-foreground">
        Nothing found
      </h2>
      <p className="mt-2 px-6 text-[12.5px] text-muted-foreground">
        We couldn't find places matching “{query}”. Try a different word — a place, a feeling, or an era.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground transition-smooth hover:border-primary/40"
      >
        Back to home
      </Link>
    </div>
  );
}
