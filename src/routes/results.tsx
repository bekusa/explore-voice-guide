import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
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
import { useT } from "@/hooks/useT";
import type { UiKey } from "@/lib/i18n";

/**
 * Interest catalogue. Used both as URL-state vocabulary (n8n payload
 * accepts these IDs) and as a label/emoji lookup for the per-card
 * interest chip. Beka removed the in-page filter UI but the chip
 * itself still hangs off each card so users see the bias under which
 * the list was generated.
 *
 * Adding a new interest: add a row here, add `filters.int.<id>` to
 * UI_STRINGS in src/lib/i18n.ts, and update the n8n prompt's interest
 * dictionary block.
 */
const INTERESTS: { id: string; key: UiKey; emoji: string }[] = [
  { id: "history", key: "filters.int.history", emoji: "🏛️" },
  { id: "art", key: "filters.int.art", emoji: "🎨" },
  { id: "food", key: "filters.int.food", emoji: "🍽️" },
  { id: "nature", key: "filters.int.nature", emoji: "🌿" },
  { id: "architecture", key: "filters.int.architecture", emoji: "🏗️" },
  { id: "spirituality", key: "filters.int.spirituality", emoji: "🕯️" },
  { id: "family", key: "filters.int.family", emoji: "👨‍👩‍👧" },
  { id: "couples", key: "filters.int.couples", emoji: "💞" },
  { id: "photography", key: "filters.int.photography", emoji: "📸" },
  { id: "adventure", key: "filters.int.adventure", emoji: "🧗" },
  { id: "local", key: "filters.int.local", emoji: "🏘️" },
  { id: "nightlife", key: "filters.int.nightlife", emoji: "🌙" },
];

const INTERESTS_BY_ID = new Map(INTERESTS.map((x) => [x.id, x]));
const VALID_INTEREST_IDS = new Set(INTERESTS.map((x) => x.id));

/** Beka's product call: every search defaults to History bias if the
 *  user (or some old shared link) didn't specify otherwise. Lokali's
 *  audience skews heritage-tourist, so this is the safer fallback than
 *  unbiased generic results. */
const DEFAULT_INTEREST = "history";

type Search = {
  q: string;
  /** Comma-separated interest IDs from INTERESTS, e.g. "history,couples". */
  interests?: string;
  /** "short" | "medium" | "long". UI is hidden for now (see commit
   *  history); kept on the URL so previously-shared links don't break. */
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

function ResultsPage() {
  const { q, interests: interestsParam, duration: durationParam } = Route.useSearch();
  const navigate = useNavigate();
  const preferredLanguage = usePreferredLanguage();
  const t = useT();
  // Auto-detect from the query itself so "Batumi" → en, "ბათუმი" → ka.
  // Without this, anonymous users fell back to Georgian regardless of
  // what they typed. Preferred language is used when the query is empty
  // or all punctuation.
  const language = detectQueryLanguage(q, preferredLanguage);

  // URL-state → request payload. Filter UI was removed (Beka asked for
  // a cleaner results page) so in practice `interestsParam` is empty,
  // which falls back to DEFAULT_INTEREST. URL-tampered values that
  // aren't in our catalogue are dropped.
  const selectedInterests = useMemo<string[]>(() => {
    const fromUrl = (interestsParam ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => VALID_INTEREST_IDS.has(s));
    return fromUrl.length > 0 ? fromUrl : [DEFAULT_INTEREST];
  }, [interestsParam]);
  const interestsKey = selectedInterests.join(",");
  const duration = durationParam ?? "";

  // The interest we render as a chip on every card — first selected,
  // because (today) we only ever ship one bias. If we re-introduce a
  // multi-pick filter, this should become a per-attraction lookup.
  const primaryInterest = INTERESTS_BY_ID.get(selectedInterests[0]) ?? null;

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

        {/* Body */}
        <section className="px-6 pt-4">
          {loading && <SkeletonList />}

          {!loading && results && results.length === 0 && <EmptyState query={q} />}

          {!loading && results && results.length > 0 && (
            <div className="flex flex-col gap-3">
              {results.map((a, i) => (
                <ResultCard
                  key={`${a.name}-${i}`}
                  attraction={a}
                  index={i}
                  language={language}
                  cityContext={q}
                  interest={primaryInterest}
                  interestLabel={primaryInterest ? t(primaryInterest.key) : null}
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
 * Result card modeled on the Time Machine cards (TimeMachine.tsx). The
 * collapsed row is a compact image + title + meta strip; tapping the
 * row (or the chevron) reveals chips, a short story-style blurb, the
 * full description, and three actions: Save, Download, Details. The
 * Details button is a real Link → /attraction/$id (opens the rich
 * narrated page); Save/Download mutate local state.
 *
 * The score progress bar from Time Machine is intentionally omitted —
 * Beka asked for a calmer card now that the per-attraction "appeal
 * score" isn't shown anywhere else in the product.
 */
function ResultCard({
  attraction,
  index,
  language,
  cityContext,
  interest,
  interestLabel,
}: {
  attraction: Attraction;
  index: number;
  language: string;
  // The user's original search query (e.g. "Batumi"). Passed to Google
  // Places to disambiguate generic attraction names.
  cityContext: string;
  // Search-level interest bias rendered as a chip on every card. Null
  // if the URL somehow ended up with an unknown ID.
  interest: { id: string; key: UiKey; emoji: string } | null;
  // Pre-translated label so we don't run useT() per card (the hook
  // would re-render every result on lang flip).
  interestLabel: string | null;
}) {
  const slug = useMemo(() => attractionSlug(attraction.name), [attraction.name]);
  const online = useOnlineStatus();
  const savedItems = useSavedItems();
  const isFav = savedItems.some((s) => s.id === slug) || isSaved(slug);

  const [open, setOpen] = useState(false);

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
      description: "Tap Download to keep the guide for offline.",
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

  // Story-style teaser preference: insider_desc → outside_desc → "".
  // Long-form description preference: description → outside_desc.
  // We split them so the italic teaser at the top reads like a vivid
  // first-line and the regular paragraph below carries the facts.
  const teaser =
    (typeof attraction.insider_desc === "string" && attraction.insider_desc) ||
    (typeof attraction.outside_desc === "string" && attraction.outside_desc) ||
    "";
  const description =
    attraction.description ||
    (typeof attraction.outside_desc === "string" &&
      attraction.outside_desc !== teaser &&
      attraction.outside_desc) ||
    "";

  const typeChip = typeof attraction.type === "string" && attraction.type ? attraction.type : null;
  const cityChip = cityContext || null;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-card transition-smooth ${
        open ? "border-primary/60 shadow-glow" : "border-border hover:border-primary/40"
      }`}
      style={{ animation: `float-up 0.5s ${index * 0.06 + 0.05}s var(--transition-smooth) both` }}
    >
      {/* Collapsed header — tap anywhere to expand. We use div+role so
          the expanded body's <button>s aren't nested inside another
          <button> (invalid HTML, breaks click handling in some browsers). */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 p-3 text-left"
      >
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-secondary">
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
          <h3
            className="truncate text-[15px] font-semibold leading-tight text-foreground"
            style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
          >
            {typeof attraction.icon === "string" && attraction.icon && (
              <span className="mr-1">{attraction.icon}</span>
            )}
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
            {cityChip && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> {cityChip}
              </span>
            )}
          </div>
        </div>
        <span
          className={`grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-smooth ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* Expanded body. The CSS-grid trick (`grid-rows-[0fr]` ↔ `1fr`)
          gives a smooth height animation without needing JS to measure
          content height. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 pb-4 pt-4">
            {/* Chips: search interest bias + attraction type + search city.
                Same shape as Time Machine's MVP / year / era row. */}
            {(interest || typeChip || cityChip) && (
              <div className="flex flex-wrap items-center gap-2">
                {interest && interestLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-primary">
                    <span aria-hidden>{interest.emoji}</span>
                    {interestLabel}
                  </span>
                )}
                {typeChip && (
                  <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {typeChip}
                  </span>
                )}
                {cityChip && (
                  <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {cityChip}
                  </span>
                )}
              </div>
            )}

            {teaser && (
              <p className="mt-3 text-[12.5px] italic leading-[1.55] text-foreground/80">
                {teaser}
              </p>
            )}
            {description && (
              <p className="mt-2 text-[12px] leading-[1.55] text-muted-foreground">{description}</p>
            )}

            {/* Actions — Save / Download / Details (no Play; that lives
                on the attraction page). */}
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
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-gold px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02]"
              >
                <ArrowRight className="h-4 w-4" />
                Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card"
          style={{ animation: `float-up 0.4s ${i * 0.06}s var(--transition-smooth) both` }}
        >
          <div className="flex items-center gap-3 p-3">
            <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-xl bg-secondary" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <div className="h-3.5 w-3/5 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-secondary/70" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-secondary/50" />
            </div>
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-secondary/70" />
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
