import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Headphones,
  Loader2,
  MapPin,
  Search,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingMessages } from "@/components/LoadingMessages";
import { MobileFrame } from "@/components/MobileFrame";
import { UnescoBadge } from "@/components/UnescoBadge";
import { isUnescoSite } from "@/lib/unesco";
import {
  attractionSlug,
  detectQueryLanguage,
  fetchAttractions,
  fetchGuideFresh,
  fetchMoreAttractions,
  type Attraction,
} from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useLazyPlacePhoto } from "@/hooks/useLazyPlacePhoto";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSavedItems } from "@/hooks/useSavedItems";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { getCachedGuide, onGuideCacheChange } from "@/lib/guideCache";
import { useT } from "@/hooks/useT";

/**
 * URL state. Interest filtering moved to the attraction page (the bias
 * lives on the per-place guide, not the discovery list), so we no
 * longer surface it here. The `interests` and `duration` keys are kept
 * in the URL schema so old shared links don't crash validation, but
 * they're ignored on this page.
 *
 * `page` drives client-side pagination — the full ≤30-item result set
 * is fetched once (and Supabase-cached in `cached_attractions` as a
 * single row), then sliced into PAGE_SIZE chunks here. URL-backed so
 * the browser back button steps through pages instead of jumping out
 * of /results.
 */
type Search = {
  q: string;
  interests?: string;
  duration?: string;
  page?: number;
};

const VALID_DURATIONS = new Set(["short", "medium", "long"]);

/**
 * Pagination knobs. 10 results per page, capped at 3 pages — Beka's
 * spec: "10-ის მერე გადავიდეს შემდეგ ფეიჯზე, მაქსიმუმ შეიძლებოდეს 3
 * ფეიჯის ჩატვირთვა". The n8n /webhook/attractions prompt is asked to
 * return up to PAGE_SIZE * MAX_PAGES (= 30) attractions; anything past
 * that the LLM hands back is simply ignored on the client. The ceiling
 * lives here so a single source of truth drives both the prompt and
 * the slice — bumping PAGE_SIZE / MAX_PAGES is the only edit needed
 * to grow the catalogue (plus a one-line tweak to the n8n prompt's
 * "return up to N" instruction).
 */
const PAGE_SIZE = 10;
const MAX_PAGES = 3;
const MAX_RESULTS = PAGE_SIZE * MAX_PAGES;

export const Route = createFileRoute("/results")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const rawDuration = typeof search.duration === "string" ? search.duration : "";
    const rawInterests = typeof search.interests === "string" ? search.interests : "";
    const rawPage =
      typeof search.page === "number"
        ? search.page
        : typeof search.page === "string"
          ? parseInt(search.page, 10)
          : 1;
    const page = Number.isFinite(rawPage) ? Math.min(MAX_PAGES, Math.max(1, rawPage)) : 1;
    // Interests + duration filters were retired from the discovery
    // page (the bias now lives on the per-attraction guide). Strip
    // their stale empty entries from the URL so /results?q=Tokyo
    // doesn't render as /results?q=Tokyo&interests=&duration=&page=1.
    // We still accept them on parse so old shared links don't crash
    // validation — they're just silently dropped from the canonical URL.
    const out: Search = { q: typeof search.q === "string" ? search.q : "", page };
    if (rawInterests) out.interests = rawInterests;
    if (VALID_DURATIONS.has(rawDuration)) out.duration = rawDuration;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Search results — Lokali" },
      { name: "description", content: "Curated attractions matching your search across Tbilisi." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { q, page = 1 } = Route.useSearch();
  const navigate = useNavigate();
  const t = useT();
  const preferredLanguage = usePreferredLanguage();
  // Auto-detect from the query itself so "Batumi" → en, "ბათუმი" → ka.
  // Without this, anonymous users fell back to Georgian regardless of
  // what they typed. Preferred language is used when the query is empty
  // or all punctuation.
  const language = detectQueryLanguage(q, preferredLanguage);

  const [results, setResults] = useState<Attraction[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Background prefetch is in flight — drives the spinner on the
  // pagination dots so the user knows pages 2-3 are warming up.
  const [prefetching, setPrefetching] = useState(false);
  const [query, setQuery] = useState(q);

  useEffect(() => {
    setQuery(q);
    let cancelled = false;
    setLoading(true);
    setResults(null);
    setPrefetching(false);
    // Discovery list is unbiased — interest tilts only the per-place
    // guide on /attraction/$id. So no `interests` payload from here.
    // First call returns up to ~10 attractions. A background
    // fetchMoreAttractions() call kicks off as soon as page 1 lands,
    // and merges 20 more into state + cache so the user's first
    // search stays fast (~5-10s) while pages 2-3 still feel instant
    // by the time they tap Next.
    fetchAttractions(q, language)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(t("toast.couldNotLoadAttractions"), {
          description: err instanceof Error ? err.message : t("toast.tryAgainPlease"),
        });
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, language]);

  // Background prefetch for pages 2-3. Fires once after the first
  // page lands, asking n8n for ~20 more attractions excluding the
  // ones already on screen. The server merges the result into the
  // Supabase cache row, so the very next visitor to this query
  // reads all 30 in one cache hit — zero LLM cost. If the prefetch
  // fails, the user just keeps page 1; pagination dots stay hidden.
  useEffect(() => {
    if (!results || results.length === 0) return;
    // Already have enough? Either the cache served us the full 30
    // (no work needed) or the LLM returned <PAGE_SIZE so pagination
    // is impossible anyway.
    if (results.length >= MAX_RESULTS) return;
    if (results.length < PAGE_SIZE) return;
    let cancelled = false;
    setPrefetching(true);
    const excludeNames = results.map((a) => a.name).filter(Boolean);
    const need = MAX_RESULTS - results.length;
    fetchMoreAttractions(q, language, excludeNames, need)
      .then((more) => {
        if (cancelled || more.length === 0) return;
        // Append, dedup by name (case-insensitive), cap at MAX_RESULTS
        // so a generous LLM can't blow past the 30-item ceiling.
        setResults((prev) => {
          if (!prev) return more.slice(0, MAX_RESULTS);
          const seen = new Set(prev.map((a) => a.name.trim().toLowerCase()));
          const fresh = more.filter((a) => {
            const n = a.name.trim().toLowerCase();
            if (!n || seen.has(n)) return false;
            seen.add(n);
            return true;
          });
          return [...prev, ...fresh].slice(0, MAX_RESULTS);
        });
      })
      .catch(() => {
        /* Silent — page 1 still works, pagination just won't appear */
      })
      .finally(() => {
        if (!cancelled) setPrefetching(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-runs whenever the result set length changes — but the gates
    // above (`< PAGE_SIZE` and `>= MAX_RESULTS`) keep it firing only
    // once per query, on the transition from the first-page payload
    // to "needs prefetching".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, language, results?.length]);

  // Slice the cached payload for the current page. The n8n response is
  // capped at MAX_RESULTS so longer payloads are silently truncated —
  // we never want page 4 to exist even if the LLM gets generous.
  const totalAvailable = Math.min(results?.length ?? 0, MAX_RESULTS);
  const pageCount = Math.max(1, Math.ceil(totalAvailable / PAGE_SIZE));
  // Clamp to the available range (e.g. user lands on /results?page=3 but
  // only 12 results came back → bounce to page 2 in the URL).
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedResults = useMemo(() => {
    if (!results) return null;
    const start = (safePage - 1) * PAGE_SIZE;
    return results.slice(0, MAX_RESULTS).slice(start, start + PAGE_SIZE);
  }, [results, safePage]);

  // If the URL says page=3 but the data only has 1 page, rewrite the
  // URL so back/forward stays consistent. Replace (not push) so we
  // don't pollute history with a redirect step.
  useEffect(() => {
    if (!results) return;
    if (page === safePage) return;
    navigate({
      to: "/results",
      search: (prev) => ({ ...prev, q, page: safePage }),
      replace: true,
    });
  }, [results, page, safePage, q, navigate]);

  const goToPage = (next: number) => {
    const clamped = Math.min(pageCount, Math.max(1, next));
    if (clamped === safePage) return;
    navigate({
      to: "/results",
      search: (prev) => ({ ...prev, q, page: clamped }),
    });
    // Scroll back to the top so page 2 doesn't dump the user mid-list.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = query.trim();
    if (!next) return;
    // New search → reset to page 1.
    navigate({
      to: "/results",
      search: { q: next, page: 1 },
    });
  };

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-16 text-foreground">
        {/* Header — tightened per Beka's request: top padding cut from
            pt-12 to pt-7 (still clears the iOS notch but stops wasting
            space), buttons h-9 instead of h-10, search field py-2
            instead of py-2.5, and the meta line moved from mt-3 to
            mt-2. Net trim ≈ 30 px without changing the layout. */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-6 pt-7 pb-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <Link
              to="/"
              aria-label={t("nav.back")}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card transition-smooth hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <form
              onSubmit={submit}
              className="flex flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-2 shadow-soft"
            >
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("results.placeholder")}
                // 200-char cap — keeps a paste of 50 KB of text from
                // flooding the n8n / Claude call. A real city name or
                // landmark stays well under this; the limit kicks in
                // only on accidental / abuse input.
                maxLength={200}
                className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
              />
            </form>
          </div>
          {/* Count line removed per Beka — "30 results for 'Bangkok'"
              felt like noise once the rest of the row already shows
              the query in the search field. The "Searching…" status
              still surfaces while loading. */}
          {loading && (
            <p className="mt-2 text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("results.searching")}
            </p>
          )}
        </header>

        {/* Body */}
        <section className="px-6 pt-4">
          {loading && (
            <>
              <LoadingMessages className="mb-4 mt-2" />
              <SkeletonList />
            </>
          )}

          {!loading && results && results.length === 0 && <EmptyState query={q} />}

          {!loading && pagedResults && pagedResults.length > 0 && (
            <>
              <div className="flex flex-col gap-3">
                {pagedResults.map((a, i) => (
                  <ResultCard
                    // Stable key across pages: `${name}-${absoluteIndex}`,
                    // so React doesn't re-mount cards on a page swap.
                    key={`${a.name}-${(safePage - 1) * PAGE_SIZE + i}`}
                    attraction={a}
                    index={i}
                    language={language}
                    cityContext={q}
                  />
                ))}
              </div>

              {(pageCount > 1 || prefetching) && (
                <Pagination
                  page={safePage}
                  pageCount={pageCount}
                  onChange={goToPage}
                  prefetching={prefetching}
                  label={t("results.pageLabel", { n: safePage, total: pageCount })}
                  prevLabel={t("results.prev")}
                  nextLabel={t("results.next")}
                  navLabel={t("results.pagination")}
                  pageButtonLabel={(n) => t("results.goToPage", { n })}
                />
              )}
            </>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

/**
 * Pagination strip — Prev / page-number dots / Next. Renders only when
 * pageCount > 1 (single-page result sets get nothing extra). Numbered
 * dots are tappable so the user can jump straight to a page; chevrons
 * step ±1. Disabled state on the edge buttons keeps tap targets but
 * dims them so it's clear nothing happens.
 */
function Pagination({
  page,
  pageCount,
  onChange,
  prefetching,
  label,
  prevLabel,
  nextLabel,
  navLabel,
  pageButtonLabel,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
  // Background prefetch in flight. Renders a faded "ghost" dot for
  // each not-yet-loaded page so the user sees pagination is on the
  // way — Beka picked the prefetch path specifically so the user
  // never waits when they click Next.
  prefetching: boolean;
  label: string;
  prevLabel: string;
  nextLabel: string;
  /** aria-label for the surrounding <nav> (e.g. "Pagination") */
  navLabel: string;
  /** aria-label per page button — receives the page number as `n` */
  pageButtonLabel: (n: number) => string;
}) {
  const atStart = page <= 1;
  const atEnd = page >= pageCount;
  // While prefetching, show a placeholder for every page slot up to
  // MAX_PAGES so the strip's footprint doesn't pop wider once the
  // 20 extra results land.
  const totalSlots = prefetching ? Math.max(pageCount, MAX_PAGES) : pageCount;
  return (
    <nav aria-label={navLabel} className="mt-6 flex flex-col items-center gap-3 pb-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={atStart}
          aria-label={prevLabel}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: totalSlots }, (_, i) => i + 1).map((p) => {
          const active = p === page;
          const ghost = p > pageCount; // not yet available — prefetching
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              disabled={ghost}
              aria-label={pageButtonLabel(p)}
              aria-current={active ? "page" : undefined}
              className={`h-10 min-w-[40px] rounded-full border px-3 text-[13px] font-bold transition-smooth ${
                active
                  ? "border-primary/60 bg-gradient-gold text-primary-foreground shadow-glow"
                  : ghost
                    ? "border-dashed border-border/60 bg-transparent text-muted-foreground/40 cursor-wait"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={atEnd && !prefetching}
          aria-label={nextLabel}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        {prefetching && (
          <span className="inline-flex items-center gap-1 text-primary/80">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          </span>
        )}
      </p>
    </nav>
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
  const t = useT();

  const [open, setOpen] = useState(false);

  // n8n-supplied image_url wins; otherwise lazily fetch from
  // Google / Wikipedia via the shared hook. Use the English name
  // when present — translated names like "თავისუფლების ქანდაკება"
  // misfired the photo lookup against Tbilisi's Freedom Square
  // instead of New York's Statue of Liberty. name_en is set by
  // translateAttractionsPayload on every translated row; English
  // baseline rows fall back to `name`.
  const fetched = useLazyPlacePhoto(attraction.name_en ?? attraction.name, {
    cityHint: cityContext,
    skip: !!attraction.image_url,
  });
  // <img onError> fires when the resolved URL 404s in the browser
  // (CDN miss, Wikipedia removed the file, etc.) — flip this and the
  // card falls back to the MapPin placeholder.
  const [imgFailed, setImgFailed] = useState(false);
  const photo = imgFailed ? null : (attraction.image_url ?? fetched);

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
      toast(t("toast.removedFromSaved"));
      return;
    }
    saveItem({
      id: slug,
      name: attraction.name,
      language,
      savedAt: Date.now(),
      attraction: { ...attraction, image_url: photo ?? attraction.image_url },
    });
    toast.success(t("toast.saved"), {
      description: t("toast.savedDesc"),
    });
  };

  const downloadOffline = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cached) {
      toast.info(t("results.alreadyOffline"), { description: t("toast.alreadyCachedDesc") });
      return;
    }
    if (!online) {
      toast.error(t("toast.youreOffline"), { description: t("toast.youreOfflineDesc") });
      return;
    }
    setDownloading(true);
    try {
      const script = await fetchGuideFresh(attraction.name, language);
      if (script) {
        toast.success(t("toast.downloaded"), { description: attraction.name });
        setCached(true);
      } else {
        toast.error(t("toast.noGuide"));
      }
    } catch (err) {
      toast.error(t("toast.downloadFailed"), {
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
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
      {/* Beka's restructure (was a horizontal compact row): big photo
          on top, title + meta + actions below, expand chevron reveals
          the chips + description + teaser. Same shape as the museum
          highlight cards so all surfaces feel consistent. */}
      {/* Hero image — full width, fixed height. Tapping the image
          (anywhere except the action buttons) toggles the expanded
          info section. */}
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
        className="relative block h-[180px] w-full cursor-pointer overflow-hidden bg-secondary"
      >
        {photo ? (
          <img
            src={photo}
            alt={attraction.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-card">
            <MapPin className="h-7 w-7 text-primary" />
          </div>
        )}
        {/* Light-theme darkening wash — same trick as Home cards so
            the cinematic photo doesn't read pale on daylight. */}
        <div className="pointer-events-none absolute inset-0 bg-black/0 [.light_&]:bg-black/30" />
        {/* Offline pill overlay (top-left) when guide is cached. */}
        {cached && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-background/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary backdrop-blur-md">
            <Download className="h-2.5 w-2.5" /> {t("card.offline")}
          </span>
        )}
      </div>

      {/* Title + meta strip */}
      <div className="px-4 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className="truncate text-[16px] font-semibold leading-tight text-foreground"
                style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
              >
                {attraction.name}
              </h3>
              {isUnescoSite(attraction.name_en ?? attraction.name, {
                city: cityChip,
                type: attraction.type ?? attraction.category,
                description: attraction.outside_desc ?? attraction.description,
              }) && <UnescoBadge />}
            </div>
            <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Headphones className="h-2.5 w-2.5" /> {t("card.audioGuide")}
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
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Collapse" : "Expand"}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-smooth ${
              open ? "rotate-180" : ""
            }`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Actions — always visible (was inside the expanded body
          before). Beka's spec: Save / Offline / Details should
          always be one tap away, no need to expand first. */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-3">
        <button
          onClick={toggleSave}
          aria-pressed={isFav}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] transition-smooth whitespace-normal break-words ${
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
          {isFav ? t("card.saved") : t("card.save")}
        </button>

        <button
          onClick={downloadOffline}
          disabled={downloading}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] transition-smooth whitespace-normal break-words ${
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
          {downloading ? t("card.saving") : cached ? t("card.offline") : t("card.download")}
        </button>

        <Link
          to="/attraction/$id"
          params={{ id: slug }}
          // Pass the user's city query through so the attraction
          // page can give the photo lookup a city hint. Without
          // this, generic names like "Grand Palace" resolved to
          // a Tbilisi-area restaurant because the Google Places
          // key has Tbilisi region bias.
          search={{ name: attraction.name, city: cityContext }}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-gold px-2 py-2.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02] whitespace-normal break-words"
        >
          <ArrowRight className="h-4 w-4" />
          {t("card.details")}
        </Link>
      </div>

      {/* Expanded body — chips + description + teaser. CSS-grid
          height animation (grid-rows-[0fr] ↔ 1fr) gives a smooth
          reveal without JS measurement. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 pb-4 pt-4 mt-3">
            {(typeChip || cityChip) && (
              <div className="flex flex-wrap items-center gap-2">
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

            {description && (
              <p className="mt-3 text-[12px] leading-[1.55] text-muted-foreground">{description}</p>
            )}
            {teaser && (
              <p className="mt-2 text-[12.5px] italic leading-[1.55] text-foreground/80">
                {teaser}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom padding so the actions row breathes when expanded
          is closed (no border-top body underneath). */}
      <div className={`${open ? "pb-0" : "pb-3"}`} />
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
            <div className="h-[100px] w-[100px] shrink-0 animate-pulse rounded-xl bg-secondary" />
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
  const t = useT();
  return (
    <div className="mt-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-card">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="mt-5 font-display text-[22px] text-foreground">{t("results.empty")}</h2>
      <p className="mt-2 px-6 text-[12.5px] text-muted-foreground">
        {t("results.emptyHelp", { query })}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground transition-smooth hover:border-primary/40"
      >
        {t("results.backHome")}
      </Link>
    </div>
  );
}
