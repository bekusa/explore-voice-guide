import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Download,
  Headphones,
  Loader2,
  MapPin,
  Search,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import {
  attractionSlug,
  detectQueryLanguage,
  fetchAttractions,
  fetchGuideFresh,
  fetchPlacePhoto,
  type Attraction,
} from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSavedItems } from "@/hooks/useSavedItems";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { getCachedGuide, onGuideCacheChange } from "@/lib/guideCache";

type Search = {
  q: string;
  /** Comma-separated interest IDs from INTERESTS, e.g. "history,couples". */
  interests?: string;
  /** "short" | "medium" | "long". */
  duration?: string;
};

const VALID_DURATIONS = new Set(["short", "medium", "long"]);

export const Route = createFileRoute("/results")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const duration = typeof search.duration === "string" ? search.duration : "";
    return {
      q: typeof search.q === "string" ? search.q : "",
      interests: typeof search.interests === "string" ? search.interests : "",
      duration: VALID_DURATIONS.has(duration) ? duration : "",
    };
  },
  head: () => ({
    meta: [
      { title: "Search results — Voices of Old Tbilisi" },
      { name: "description", content: "Curated attractions matching your search across Tbilisi." },
    ],
  }),
  component: ResultsPage,
});

/**
 * Curated interest tags shown as filter chips above the results.
 * Beka asked us to bring back the "interests" picker from the original
 * Lokali app and explicitly include "Couples" (წყვილები). The id is what
 * we send to n8n — keep it stable and ASCII so the workflow can prompt
 * Claude with a clean, predictable token. The label is what the user
 * sees; emoji are intentional — they read warmer and more universal
 * than any single language label across Lokali's 37+ supported tongues.
 */
const INTERESTS: { id: string; label: string; emoji: string }[] = [
  { id: "history", label: "History", emoji: "🏛️" },
  { id: "art", label: "Art", emoji: "🎨" },
  { id: "food", label: "Food", emoji: "🍽️" },
  { id: "nature", label: "Nature", emoji: "🌿" },
  { id: "architecture", label: "Architecture", emoji: "🏰" },
  { id: "spirituality", label: "Spirituality", emoji: "🛐" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { id: "couples", label: "Couples", emoji: "💑" },
  { id: "photography", label: "Photography", emoji: "📷" },
  { id: "adventure", label: "Adventure", emoji: "🥾" },
  { id: "local", label: "Local culture", emoji: "✨" },
  { id: "nightlife", label: "Nightlife", emoji: "🌙" },
];

/**
 * Three audio-guide length presets — also a Lokali classic. NOTE: this
 * is the *narration* length (how long the user will be listening), not
 * how long it takes to walk the route. The id goes to n8n; the helper
 * text reminds the user roughly how long the spoken guide will run.
 */
const DURATIONS: { id: "short" | "medium" | "long"; label: string; hint: string }[] = [
  { id: "short", label: "Short", hint: "~ 3–7 min" },
  { id: "medium", label: "Medium", hint: "~ 8–15 min" },
  { id: "long", label: "Long", hint: "15–30 min" },
];

function ResultsPage() {
  const { q, interests: interestsParam, duration: durationParam } = Route.useSearch();
  const navigate = useNavigate();
  const preferredLanguage = usePreferredLanguage();
  // Auto-detect from the query itself so "Batumi" → en, "ბათუმი" → ka.
  // Without this, anonymous users fell back to Georgian regardless of
  // what they typed. Preferred language is used when the query is empty
  // or all punctuation.
  const language = detectQueryLanguage(q, preferredLanguage);

  // Decode URL-state into the working sets used by the chip rows.
  // Memoize so the fetch effect's dep array stays stable across renders.
  const selectedInterests = useMemo<string[]>(
    () =>
      (interestsParam ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => INTERESTS.some((i) => i.id === s)),
    [interestsParam],
  );
  const interestsKey = selectedInterests.join(",");
  const duration = durationParam ?? "";

  const [results, setResults] = useState<Attraction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(q);

  useEffect(() => {
    setQuery(q);
    let cancelled = false;
    setLoading(true);
    setResults(null);
    fetchAttractions(q, language, {
      interests: interestsKey ? interestsKey.split(",") : [],
      duration,
    })
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
  }, [q, language, interestsKey, duration]);

  // Update the URL whenever the user toggles a filter chip — the fetch
  // effect above re-runs because interestsKey / duration are derived
  // from the URL. Going through the URL means back/forward and shared
  // links keep the user's filter set intact.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = query.trim();
    if (!next) return;
    navigate({
      to: "/results",
      search: { q: next, interests: interestsKey, duration },
    });
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
            <form
              onSubmit={submit}
              className="flex flex-1 items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-soft"
            >
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Country, city, or landmark…"
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

        {/* Interests / Guide-length filters intentionally removed from
            the results list — they live inside an individual attraction
            screen instead. */}

        {/* Body */}
        <section className="px-6 pt-4">
          {loading && <SkeletonList />}

          {!loading && results && results.length === 0 && <EmptyState query={q} />}

          {!loading && results && results.length > 0 && (
            <div className="flex flex-col gap-4">
              {results.map((a, i) => (
                <ResultCard
                  key={`${a.name}-${i}`}
                  attraction={a}
                  index={i}
                  language={language}
                  cityContext={q}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

/**
 * Rich, always-expanded result card modelled on the home page's
 * NearYouCard. Beka asked for the result list to use the same fuller
 * format he sees under "Inside Tbilisi" so search results read as
 * curated guides rather than lean rows. Three actions live at the
 * bottom — Save, Offline (download), Details — and tapping Details
 * opens the attraction page. The bottom "Play narrated guide" button
 * from NearYouCard is intentionally omitted: Beka doesn't want users
 * starting playback straight from the result list.
 */
function ResultCard({
  attraction,
  index,
  language,
  cityContext,
}: {
  attraction: Attraction;
  index: number;
  language: string;
  // The user's original search query (e.g. "Batumi"). Passed to Google
  // Places to disambiguate generic attraction names.
  cityContext: string;
}) {
  const slug = useMemo(() => attractionSlug(attraction.name), [attraction.name]);
  const online = useOnlineStatus();
  const savedItems = useSavedItems();
  const isFav = savedItems.some((s) => s.id === slug) || isSaved(slug);

  // n8n-supplied image_url wins; otherwise lazily fetch from Google/Wikipedia.
  const [photo, setPhoto] = useState<string | null>(attraction.image_url ?? null);
  useEffect(() => {
    if (attraction.image_url) {
      setPhoto(attraction.image_url);
      return;
    }
    let cancelled = false;
    fetchPlacePhoto(attraction.name, language, cityContext).then((url) => {
      if (!cancelled && url) setPhoto(url);
    });
    return () => {
      cancelled = true;
    };
  }, [attraction.name, attraction.image_url, language, cityContext]);

  // Live "Offline" state — flips when a download finishes / cache cleared.
  const [cached, setCached] = useState(false);
  useEffect(() => {
    const refresh = () => setCached(!!getCachedGuide(attraction.name, language));
    refresh();
    return onGuideCacheChange(refresh);
  }, [attraction.name, language]);

  const [downloading, setDownloading] = useState(false);

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFav) {
      removeItem(slug);
      toast("Removed from Saved");
      return;
    }
    saveItem({
      id: slug,
      name: attraction.name,
      language,
      savedAt: Date.now(),
      attraction: { ...attraction, image_url: photo ?? attraction.image_url },
    });
    toast.success("Saved", {
      description: "Tap Offline to keep the guide for offline.",
    });
  };

  const downloadOffline = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cached) {
      toast.info("Already offline", { description: "This guide plays offline." });
      return;
    }
    if (!online) {
      toast.error("You're offline", { description: "Connect once to download the guide." });
      return;
    }
    setDownloading(true);
    try {
      const script = await fetchGuideFresh(attraction.name, language);
      if (script) {
        toast.success("Downloaded for offline", { description: attraction.name });
        setCached(true);
      } else {
        toast.error("No guide returned");
      }
    } catch (err) {
      toast.error("Download failed", {
        description: err instanceof Error ? err.message : "Try again later.",
      });
    } finally {
      setDownloading(false);
    }
  };

  // Short description preference: insider_desc > description > outside_desc.
  const description =
    (typeof attraction.insider_desc === "string" && attraction.insider_desc) ||
    attraction.description ||
    (typeof attraction.outside_desc === "string" && attraction.outside_desc) ||
    "";

  const subtitleChip =
    (typeof attraction.type === "string" && attraction.type) || cityContext || "";

  return (
    <article
      className="overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/40"
      style={{ animation: `float-up 0.5s ${index * 0.06 + 0.05}s var(--transition-smooth) both` }}
    >
      {/* Header — image + title + meta */}
      <div className="flex items-start gap-3 p-3">
        <div className="relative h-[78px] w-[78px] shrink-0 overflow-hidden rounded-xl bg-secondary">
          {photo ? (
            <img
              src={photo}
              alt={attraction.name}
              loading="lazy"
              onError={() => setPhoto(null)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-card">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold leading-tight text-foreground">
            {attraction.name}
          </h3>
          <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Headphones className="h-2.5 w-2.5" /> Audio guide
            {cached && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8.5px] tracking-[0.12em] text-primary">
                <Download className="h-2 w-2" /> Offline
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground">
            {attraction.duration && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> {attraction.duration}
              </span>
            )}
            {typeof attraction.rating === "number" && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Star className="h-2.5 w-2.5 fill-primary" /> {attraction.rating.toFixed(2)}
              </span>
            )}
            {typeof attraction.lat === "number" && typeof attraction.lng === "number" && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> {attraction.lat.toFixed(2)},{" "}
                {attraction.lng.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body — chips + description + 3 actions */}
      <div className="border-t border-border px-4 pb-4 pt-4">
        {/* Category / type / city chips */}
        {(attraction.category || subtitleChip) && (
          <div className="flex flex-wrap items-center gap-2">
            {attraction.category && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-primary">
                {attraction.category}
              </span>
            )}
            {subtitleChip && (
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {subtitleChip}
              </span>
            )}
          </div>
        )}

        {description && (
          <p className="mt-3 text-[12.5px] leading-[1.55] text-foreground/75 line-clamp-4">
            {description}
          </p>
        )}

        {/* Save / Offline / Details — three action grid */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={toggleSave}
            aria-pressed={isFav}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-smooth ${
              isFav
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {isFav ? (
              <BookmarkCheck className="h-4 w-4 fill-current" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            {isFav ? "Saved" : "Save"}
          </button>

          <button
            onClick={downloadOffline}
            disabled={downloading}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-smooth ${
              cached
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            } disabled:cursor-wait disabled:opacity-70`}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cached ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? "Saving" : cached ? "Offline" : "Download"}
          </button>

          <Link
            to="/attraction/$id"
            params={{ id: slug }}
            search={{ name: attraction.name }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-gold px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02]"
          >
            <ArrowRight className="h-4 w-4" />
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card"
          style={{ animation: `float-up 0.4s ${i * 0.06}s var(--transition-smooth) both` }}
        >
          <div className="flex items-start gap-3 p-3">
            <div className="h-[78px] w-[78px] shrink-0 animate-pulse rounded-xl bg-secondary" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <div className="h-3.5 w-3/5 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-secondary/70" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/50" />
            </div>
          </div>
          <div className="border-t border-border px-4 pb-4 pt-4">
            <div className="flex gap-2">
              <div className="h-5 w-20 animate-pulse rounded-full bg-secondary/60" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-secondary/40" />
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="h-3 w-full animate-pulse rounded bg-secondary/50" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/40" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="h-11 animate-pulse rounded-xl bg-secondary/50" />
              <div className="h-11 animate-pulse rounded-xl bg-secondary/50" />
              <div className="h-11 animate-pulse rounded-xl bg-secondary/70" />
            </div>
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
      <h2 className="mt-5 font-display text-[22px] text-foreground">Nothing found</h2>
      <p className="mt-2 px-6 text-[12.5px] text-muted-foreground">
        We couldn't find places matching “{query}”. Try a different word — a place, a feeling, or an
        era.
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
