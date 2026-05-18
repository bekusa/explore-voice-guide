import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
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
  const navigate = useNavigate();
  const lang = usePreferredLanguage();

  // Auto-translate the editorial intro paragraphs + etiquette tips
  // so a Georgian visitor doesn't read English copy. The translate
  // hook caches per-locale so repeat visits don't burn API calls.
  const tIntro = useTranslated(profile.intro);
  const tEtiquette = useTranslated(profile.etiquette);

  // Hero photo — prefer the curated DESTINATIONS asset (local
  // /assets/*.webp for Tbilisi / Rome, hosted Unsplash for Istanbul).
  // Falls back to a Wikipedia lookup of the first gallery landmark
  // if no curated hero is on file. Beka caught the previous version
  // serving a Tbilisi construction-site photo when the gallery URL
  // pointed at a stale Unsplash ID.
  const destinationEntry = DESTINATIONS.find((d) => d.slug === profile.slug);
  const heroLookup = useLazyPlacePhoto(profile.gallery[0] ?? profile.city, {
    cityHint: profile.city,
    skip: !!destinationEntry?.hero,
  });
  const heroSrc = destinationEntry?.hero ?? heroLookup;

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        {/* ─── Hero ──────────────────────────────────────────────── */}
        <section className="relative h-[440px] w-full overflow-hidden">
          {heroSrc ? (
            <img
              src={heroSrc}
              alt={profile.city}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary to-card" />
          )}
          {/* Constant gradient over the photo so the hero copy is
              legible regardless of the lead image's exposure. */}
          <div className="absolute inset-0 bg-gradient-hero" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background/70 to-transparent" />

          {/* Back to home. pt-safe handles notch / status-bar inset
              the same way every other top header does. */}
          <header className="absolute inset-x-5 z-10 pt-safe">
            <Link
              to="/"
              aria-label={t("nav.back")}
              className="grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </header>

          <div className="absolute inset-x-6 bottom-8 z-10">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
              {profile.country}
            </span>
            <h1 className="mt-2 font-display text-[2.75rem] font-medium leading-[1.02] text-foreground">
              {profile.city}
            </h1>
          </div>
        </section>

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
          </div>
        </section>

        {/* ─── Photo gallery ─────────────────────────────────────── */}
        <section className="pt-8">
          <div className="px-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              {t("city.gallery")}
            </span>
          </div>
          {/* Horizontal scroll. Touch-friendly on mobile, mouse-wheel
              friendly on desktop. snap-x keeps cards aligned cleanly
              at any scroll position. Each card is a LANDMARK name
              (e.g. "Narikala Fortress"), resolved at render time
              through useLazyPlacePhoto so the photos come from real
              Wikipedia/Google sources — not stale Unsplash IDs. */}
          <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 scrollbar-hide">
            {profile.gallery.map((landmark, i) => (
              <GalleryTile
                key={`${landmark}-${i}`}
                landmark={landmark}
                cityHint={profile.city}
                eager={i === 0}
              />
            ))}
          </div>
        </section>

        {/* ─── Attractions strip (auto) ──────────────────────────── */}
        <CityAttractionsSection
          query={profile.attractionQuery ?? profile.city}
          lang={lang}
          onOpen={(name) =>
            navigate({
              to: "/attraction/$id",
              params: { id: attractionSlug(name) },
              search: { name, city: profile.city },
            })
          }
        />

        {/* ─── Featured museums ──────────────────────────────────── */}
        {profile.museumIds.length > 0 && (
          <FeaturedMuseumsSection museumIds={profile.museumIds} />
        )}

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
 * Single gallery card. Resolves a landmark name (e.g. "Narikala
 * Fortress") to an image URL via the shared /api/photo pipeline.
 * Same component the rest of the app uses for places, so a tile
 * shown once on a city page is cached for instant re-load on any
 * later /attraction/$id visit.
 */
function GalleryTile({
  landmark,
  cityHint,
  eager,
}: {
  landmark: string;
  cityHint: string;
  eager: boolean;
}) {
  const photo = useLazyPlacePhoto(landmark, { cityHint });
  const [tName] = useTranslated([landmark]);
  return (
    <div className="relative h-56 w-72 shrink-0 snap-start overflow-hidden rounded-2xl bg-secondary">
      {photo ? (
        <img
          src={photo}
          alt={tName}
          loading={eager ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground">
          <Sparkles className="h-5 w-5 opacity-60" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-3 py-2.5">
        <div className="text-[12px] font-semibold leading-tight text-foreground">{tName}</div>
      </div>
    </div>
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
  onOpen,
}: {
  query: string;
  lang: string;
  onOpen: (name: string) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<Attraction[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial fetch — first 10 attractions for the city.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    setPageCount(1);
    fetchAttractions(query, lang)
      .then((res) => {
        if (cancelled) return;
        const list = (res.attractions ?? []).slice(0, CITY_PAGE_SIZE);
        setItems(list);
      })
      .catch(() => {
        if (cancelled) return;
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
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((a, i) => (
            <AttractionRow
              key={`${a.name}-${i}`}
              attraction={a}
              index={i}
              cityHint={query}
              onOpen={onOpen}
            />
          ))}
        </ul>
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
 * Single attraction row in the city page's vertical list. Same
 * visual scale as the cards on /results so the experience feels
 * consistent across both surfaces. Tapping opens /attraction/$id.
 */
function AttractionRow({
  attraction,
  index,
  cityHint,
  onOpen,
}: {
  attraction: Attraction;
  index: number;
  cityHint: string;
  onOpen: (name: string) => void;
}) {
  // Photo lookup — `name_en` first (English baseline canonical),
  // then `name`. Skip when the API already gave us an image_url.
  const lookupName =
    attraction.name_en ?? (typeof attraction.name === "string" ? attraction.name : "");
  const photo = useLazyPlacePhoto(lookupName, {
    cityHint:
      typeof attraction.city === "string" ? attraction.city : cityHint || null,
    skip: !!attraction.image_url,
  });
  const heroPhoto = attraction.image_url ?? photo;
  const [tName, tDesc] = useTranslated([
    attraction.name,
    (typeof attraction.outside_desc === "string" && attraction.outside_desc) ||
      (typeof attraction.description === "string" && attraction.description) ||
      "",
  ]);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(attraction.name)}
        className="group flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-card text-left transition-smooth hover:border-primary/40"
      >
        <div className="relative h-24 w-24 shrink-0 bg-secondary">
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt={tName}
              loading={index < 3 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <Sparkles className="h-4 w-4 opacity-60" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3">
          <div className="text-[13.5px] font-semibold leading-tight">{tName}</div>
          {tDesc && (
            <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
              {tDesc}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
            {typeof attraction.rating === "number" && (
              <span className="font-semibold text-primary">★ {attraction.rating}</span>
            )}
            {typeof attraction.duration === "string" && attraction.duration && (
              <span>· {attraction.duration}</span>
            )}
          </div>
        </div>
      </button>
    </li>
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
