import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Loader2,
  Plug,
  Sparkles,
  Wallet,
} from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { getCityProfile, type CityProfile } from "@/lib/cityProfiles";
import {
  attractionSlug,
  fetchAttractions,
  fetchMoreAttractions,
  type Attraction,
} from "@/lib/api";
import { MUSEUMS, type Museum } from "@/lib/topMuseums";
import { DESTINATIONS } from "@/lib/destinations";
import { useLazyPlacePhoto } from "@/hooks/useLazyPlacePhoto";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useT, useTranslated } from "@/hooks/useT";
import { ResultCard } from "@/routes/results";

/**
 * /destinations/$slug — editorial landing page for a launch city.
 *
 * Scope (per Beka's product spec, 2026-05-19):
 *   1. Cinematic hero with city + country + brand tagline
 *   2. 2–3 paragraphs of hand-authored editorial intro
 *   3. Horizontal photo gallery (6–8 shots)
 *   4. Practical strip (season, language, currency, tz, plug)
 *   5. Attractions strip — auto-pulled from /api/attractions?q=City
 *   6. Local etiquette / tips card
 *
 * Content is hand-curated for the 3 launch cities (Tbilisi, Rome,
 * Istanbul) in `src/lib/cityProfiles.ts`. Slugs not in that catalogue
 * fall through to the "not yet covered" empty state so we don't 404
 * a user who guessed a URL.
 */
export const Route = createFileRoute("/destinations/$slug")({
  head: ({ params }) => {
    const profile = getCityProfile(params.slug);
    const title = profile ? `${profile.city} · Lokali` : "Destination · Lokali";
    const desc = profile
      ? `Cinematic audio guide to ${profile.city}, ${profile.country}. Stories, attractions, and what locals love.`
      : "A Lokali destination guide.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: CityDetailPage,
});

function CityDetailPage() {
  const { slug } = Route.useParams();
  const profile = getCityProfile(slug);

  if (!profile) {
    return <NotYetCovered />;
  }
  return <Profile profile={profile} />;
}

function Profile({ profile }: { profile: CityProfile }) {
  const t = useT();
  const lang = usePreferredLanguage();

  // Auto-translate the editorial intro paragraphs + etiquette tips
  // so a Georgian visitor doesn't read English copy. The translate
  // hook caches per-locale so repeat visits don't burn API calls.
  const tIntro = useTranslated(profile.intro);
  const tEtiquette = useTranslated(profile.etiquette);

  // Build the hero-carousel slide list. The curated DESTINATIONS
  // brand asset (when present) leads, followed by the gallery
  // landmarks. Beka's spec (2026-05-19): the gallery should LIVE
  // in the hero, not as a separate strip below — arrows on either
  // side cycle through the slides.
  const destinationEntry = DESTINATIONS.find((d) => d.slug === profile.slug);
  const heroSlides = [
    ...(destinationEntry?.hero
      ? [{ kind: "brand" as const, url: destinationEntry.hero, label: profile.city }]
      : []),
    ...profile.gallery.map((landmark) => ({
      kind: "landmark" as const,
      landmark,
      label: landmark,
    })),
  ];

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        {/* ─── Hero carousel ─────────────────────────────────────── */}
        <HeroCarousel
          slides={heroSlides}
          cityHint={profile.city}
          country={profile.country}
          city={profile.city}
          backLabel={t("nav.back")}
        />

        {/* ─── Editorial intro ───────────────────────────────────── */}
        <section className="px-6 pt-8">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("city.about")}
          </span>
          <div className="mt-3 flex flex-col gap-3.5 text-[14px] leading-[1.65] text-foreground/85">
            {tIntro.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </section>

        {/* ─── Practical strip ──────────────────────────────────── */}
        <section className="px-6 pt-8">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("city.practical")}
          </span>
          {/* Five chips on a horizontal scroll. Each carries an icon
              + label-pair so the user can scan at a glance. The strip
              is narrow enough on mobile that 5 chips fit without
              scrolling for most languages; longer translations
              (Georgian + German) reflow into a second row gracefully
              via `flex-wrap`. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <PracticalChip
              icon={<Calendar className="h-3.5 w-3.5" />}
              label={t("city.season")}
              value={profile.practical.season}
            />
            <PracticalChip
              icon={<Globe className="h-3.5 w-3.5" />}
              label={t("city.language")}
              value={profile.practical.language}
            />
            <PracticalChip
              icon={<Wallet className="h-3.5 w-3.5" />}
              label={t("city.currency")}
              value={profile.practical.currency}
            />
            <PracticalChip
              icon={<Clock className="h-3.5 w-3.5" />}
              label={t("city.timezone")}
              value={profile.practical.tz}
            />
            <PracticalChip
              icon={<Plug className="h-3.5 w-3.5" />}
              label={t("city.plug")}
              value={profile.practical.plug}
            />
            {/* UNESCO count chip — shows how many inscribed World
                Heritage properties cover this city (or are
                inscribed within day-trip distance, like Mtskheta
                for Tbilisi). Hidden when there are zero. */}
            {profile.unesco.length > 0 && (
              <PracticalChip
                icon={<Award className="h-3.5 w-3.5" />}
                label={t("unesco.short")}
                value={
                  profile.unesco.length === 1
                    ? t("city.unescoCountOne", { n: profile.unesco.length })
                    : t("city.unescoCountMany", { n: profile.unesco.length })
                }
              />
            )}
          </div>
        </section>

        {/* The standalone gallery strip moved INTO the hero
            carousel above per Beka's 2026-05-19 spec — landmarks
            now cycle in the hero with arrow buttons. */}

        {/* ─── Attractions list — same ResultCard shell /results uses ── */}
        <CityAttractionsSection
          query={profile.attractionQuery ?? profile.city}
          lang={lang}
        />

        {/* ─── Featured museums ──────────────────────────────────── */}
        {profile.museumIds.length > 0 && (
          <FeaturedMuseumsSection museumIds={profile.museumIds} />
        )}

        {/* UNESCO section removed per Beka (2026-05-19) — the
            inscription count now lives as a chip in the Practical
            strip above; per-attraction UNESCO badges still show on
            ResultCard in the list below. */}

        {/* Where-to-stay / Neighbourhoods section removed per Beka
            (2026-05-19). Per his spec, the city page should focus
            on what to SEE — neighbourhoods belong in a future
            standalone "where to stay" feature, not the editorial
            landing. */}

        {/* ─── What locals love (pull-quotes) ─────────────────────── */}
        <section className="px-6 pt-8">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("city.localsLove")}
          </span>
          <h2 className="mt-2 font-display text-[1.5rem] font-medium leading-tight">
            {t("city.localsLoveHead")}
          </h2>
          <LocalLovesList quotes={profile.localLoves} />
        </section>

        {/* ─── Etiquette tips ────────────────────────────────────── */}
        <section className="px-6 pt-8">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("city.etiquette")}
          </span>
          <h2 className="mt-2 font-display text-[1.5rem] font-medium leading-tight">
            {t("city.etiquetteHead")}
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {tEtiquette.map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-[13px] leading-[1.55] text-foreground/85">{tip}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </MobileFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Sub-components
 * ───────────────────────────────────────────────────────────────── */

/**
 * Hero carousel — full-bleed image carousel that lives where the
 * static hero used to. Cycles through the curated DESTINATIONS
 * brand asset (when present) + gallery landmarks. Side arrows let
 * the user step through manually; auto-rotates every 6s until the
 * user interacts.
 *
 * Image resolution: brand asset slides ship a URL directly;
 * landmark slides resolve via useLazyPlacePhoto inside HeroSlide.
 * The carousel preloads neighbouring slides eagerly so taps feel
 * instant once the page has been on screen for a moment.
 */
type HeroSlide =
  | { kind: "brand"; url: string; label: string }
  | { kind: "landmark"; landmark: string; label: string };

function HeroCarousel({
  slides,
  cityHint,
  country,
  city,
  backLabel,
}: {
  slides: HeroSlide[];
  cityHint: string;
  country: string;
  city: string;
  backLabel: string;
}) {
  const [idx, setIdx] = useState(0);
  // `paused` flips true when the user taps an arrow / dot. We don't
  // resume auto-rotate after that — Beka's spec elsewhere ("rotation
  // pauses while listening / on user interaction") favours steady
  // state over surprise movement once the user has engaged.
  const [paused, setPaused] = useState(false);

  // Wrap-around helpers so the carousel never dead-ends. With only
  // one slide the auto-rotation timer is a no-op (i % 1 === 0).
  const total = slides.length;
  const prevIdx = (idx - 1 + total) % total;
  const nextIdx = (idx + 1) % total;
  const go = (next: number) => {
    setPaused(true);
    setIdx(((next % total) + total) % total);
  };

  useEffect(() => {
    if (paused || total <= 1) return;
    const id = setInterval(() => {
      setIdx((current) => (current + 1) % total);
    }, 6000);
    return () => clearInterval(id);
  }, [paused, total]);

  // Edge case: no slides at all (shouldn't happen for the 3 launch
  // cities, but guards future cities authored without a hero). Show
  // a charcoal placeholder so the layout below still has a header.
  if (total === 0) {
    return (
      <section className="relative h-[440px] w-full overflow-hidden bg-gradient-to-br from-secondary to-card">
        <CarouselChrome city={city} country={country} backLabel={backLabel} />
      </section>
    );
  }

  return (
    <section className="relative h-[440px] w-full overflow-hidden">
      {/* Stacked slides, cross-fading. opacity drives visibility so
          we never unmount a slide once it loads — the lookup hook
          stays warm and the image cache survives a cycle. */}
      {slides.map((s, i) => (
        <HeroSlide
          key={i}
          slide={s}
          cityHint={cityHint}
          active={i === idx}
          // Eagerly load the current slide + its neighbours so a
          // tap on the next arrow feels instant.
          eager={i === idx || i === prevIdx || i === nextIdx}
        />
      ))}

      {/* Constant gradient overlays for legibility of header + city
          name regardless of slide exposure. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background/70 to-transparent" />

      <CarouselChrome city={city} country={country} backLabel={backLabel} />

      {/* Side arrows. Only render when there's more than one slide.
          Generous tap target (44 × 44 px) on mobile; subtle glass-
          morphic background so the chevron reads against any photo. */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(prevIdx)}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(nextIdx)}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dot indicator — horizontally centered, raised above
              the city-name block. Beka caught the previous bottom-
              left position colliding with the "GEORGIA · Tbilisi"
              title; this position keeps the dots clear of the
              title regardless of which city is on screen. */}
          <div className="absolute bottom-32 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-6 bg-primary" : "w-1.5 bg-foreground/30 hover:bg-foreground/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Single carousel slide. Resolves landmark photos via the shared
 *  /api/photo cache; brand slides ship a URL directly. Stays
 *  mounted across cycles (opacity-driven visibility) so the image
 *  pipeline doesn't reload on every tap. */
function HeroSlide({
  slide,
  cityHint,
  active,
  eager,
}: {
  slide: HeroSlide;
  cityHint: string;
  active: boolean;
  eager: boolean;
}) {
  // Always call the hook — keep the hook count stable across renders.
  // For brand slides we skip the lookup by passing skip=true; the hook
  // returns null and the `src` short-circuits to slide.url below.
  const landmarkName = slide.kind === "landmark" ? slide.landmark : "";
  const resolved = useLazyPlacePhoto(landmarkName, {
    cityHint,
    skip: slide.kind !== "landmark",
  });
  const src = slide.kind === "brand" ? slide.url : resolved;
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-700 ${
        active ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={!active}
    >
      {src ? (
        <img
          src={src}
          alt={slide.label}
          loading={eager ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-secondary to-card" />
      )}
    </div>
  );
}

/** Header overlay shared by the carousel + the empty-state slide.
 *  Back arrow top-left, city name + country bottom-left. */
function CarouselChrome({
  city,
  country,
  backLabel,
}: {
  city: string;
  country: string;
  backLabel: string;
}) {
  return (
    <>
      <header className="absolute inset-x-5 z-10 pt-safe">
        <Link
          to="/"
          aria-label={backLabel}
          className="grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </header>
      <div className="absolute inset-x-6 bottom-8 z-10">
        <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
          {country}
        </span>
        <h1 className="mt-2 font-display text-[2.75rem] font-medium leading-[1.02] text-foreground">
          {city}
        </h1>
      </div>
    </>
  );
}

function PracticalChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
      <span className="text-primary">{icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[11.5px] font-semibold text-foreground">{value}</span>
      </span>
    </div>
  );
}

/**
 * Top attractions list — mirrors the /results pagination model
 * (10 per page, up to 30 total). Initial fetch lands the first 10
 * rows; the "Show more" tile below the list fetches the next page
 * on demand via `fetchMoreAttractions`. Same Anthropic + cache path
 * /results uses, so a warm city pays nothing on revisit.
 *
 * Why not just link to /results: Beka asked for the list to live
 * INSIDE the city page so the user doesn't lose the editorial
 * context (intro, gallery, museums, etc.) when browsing places.
 */
const CITY_PAGE_SIZE = 10;
const CITY_MAX_PAGES = 3;

function CityAttractionsSection({
  query,
  lang,
}: {
  query: string;
  lang: string;
}) {
  const t = useT();
  const [items, setItems] = useState<Attraction[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial fetch — first 10 attractions for the city.
  // `fetchAttractions` already unwraps the API response to a bare
  // `Attraction[]` (see lib/api.ts line ~367), so we treat the
  // resolved value as the array directly. Beka caught the previous
  // version reading `res.attractions` on what was already the array
  // — that always evaluated to `undefined`, falling through to the
  // "No attractions found" empty state on every load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    setPageCount(1);
    fetchAttractions(query, lang)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res.slice(0, CITY_PAGE_SIZE) : [];
        setItems(list);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[city] fetchAttractions failed", err);
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, lang]);

  const canLoadMore = pageCount < CITY_MAX_PAGES && items.length > 0;

  const handleLoadMore = async () => {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    try {
      const existingNames = items.map((a) => a.name);
      const next = await fetchMoreAttractions(query, lang, existingNames, CITY_PAGE_SIZE);
      if (next && next.length > 0) {
        setItems((prev) => [...prev, ...next.slice(0, CITY_PAGE_SIZE)]);
        setPageCount((p) => p + 1);
      } else {
        // No more rows came back — cap pageCount so the button
        // stops offering more pages.
        setPageCount(CITY_MAX_PAGES);
      }
    } catch {
      // Soft-fail: leave existing rows visible.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="px-6 pt-8">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
        {t("city.toExperience")}
      </span>
      <h2 className="mt-2 font-display text-[1.5rem] font-medium leading-tight">
        {t("city.topPlaces")}
      </h2>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("city.loadingAttractions")}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="mt-4 text-[12px] text-muted-foreground">
          {t("city.noAttractions")}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {items.map((a, i) => (
            <ResultCard
              key={`${a.name}-${i}`}
              attraction={a}
              index={i}
              language={lang}
              cityContext={query}
            />
          ))}
        </div>
      )}

      {canLoadMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground transition-smooth hover:border-primary/40 disabled:opacity-60"
        >
          {loadingMore ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("city.loadingAttractions")}
            </>
          ) : (
            t("city.showMore")
          )}
        </button>
      )}
    </section>
  );
}

/**
 * Featured museums — looks up museum metadata by id (from
 * `src/lib/topMuseums.ts`) and renders a horizontal card strip.
 * Tapping a card opens the museum's existing attraction route, where
 * the museum highlights section already lives.
 */
function FeaturedMuseumsSection({ museumIds }: { museumIds: string[] }) {
  const t = useT();
  // Resolve ids → Museum objects. Missing ids are filtered out
  // silently — a typo in cityProfiles shouldn't break the section.
  const museums = museumIds
    .map((id) => MUSEUMS.find((m) => m.id === id))
    .filter((m): m is Museum => !!m);
  if (museums.length === 0) return null;
  return (
    <section className="pt-8">
      <div className="px-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
          {t("city.featuredMuseums")}
        </span>
        <h2 className="mt-2 font-display text-[1.5rem] font-medium leading-tight">
          {t("city.museumsHead")}
        </h2>
      </div>
      <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 scrollbar-hide">
        {museums.map((m) => (
          <MuseumCard key={m.id} museum={m} />
        ))}
      </div>
    </section>
  );
}

function MuseumCard({ museum }: { museum: Museum }) {
  // Same photo pipeline as the rest of the app — once a museum is
  // cached its hero loads instantly on revisit.
  const photo = useLazyPlacePhoto(museum.name, {
    cityHint: museum.city,
    skip: !!museum.image,
  });
  const heroPhoto = museum.image ?? photo;
  const [tName] = useTranslated([museum.name]);
  return (
    <Link
      to="/attraction/$id"
      params={{ id: attractionSlug(museum.name) }}
      search={{ name: museum.name, city: museum.city }}
      className="relative h-44 w-60 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card text-left transition-smooth hover:scale-[1.01]"
    >
      {heroPhoto ? (
        <img
          src={heroPhoto}
          alt={tName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-secondary text-muted-foreground">
          <Sparkles className="h-5 w-5 opacity-60" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-3 bottom-3">
        <div className="text-[13px] font-semibold leading-tight text-foreground">{tName}</div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/70">
          {museum.city}
        </div>
      </div>
    </Link>
  );
}

/**
 * "What locals love" — 3-4 pull-quote-style cards, each one tip in
 * sensory specifics ("the ferry costs ₺15", not "take a boat ride").
 * Auto-translated to the user's UI language.
 */
function LocalLovesList({ quotes }: { quotes: string[] }) {
  const tQuotes = useTranslated(quotes);
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {tQuotes.map((q, i) => (
        <li
          key={i}
          className="relative rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4"
        >
          {/* Decorative open-quote glyph in gold. Positioned so it
              hangs into the card's top-left margin — magazine pull-
              quote feel. */}
          <span
            aria-hidden
            className="absolute -left-1 -top-2 font-display text-[34px] font-medium leading-none text-primary/60"
          >
            “
          </span>
          <p className="pl-3 text-[13px] leading-[1.6] text-foreground/90 italic">{q}</p>
        </li>
      ))}
    </ul>
  );
}

function NotYetCovered() {
  const t = useT();
  return (
    <MobileFrame>
      <div className="grid min-h-full place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
          <h1 className="font-display text-[1.5rem] font-medium">{t("city.notCovered")}</h1>
          <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
            {t("city.notCoveredDesc")}
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-background"
          >
            {t("nav.back")}
          </Link>
        </div>
      </div>
    </MobileFrame>
  );
}
