import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useT, useTranslatedString, useUiLang } from "@/hooks/useT";
import type { UiKey } from "@/lib/i18n";
import { getCityProfile } from "@/lib/cityProfiles";
import { getStaticCityHeroUrl } from "@/lib/cityHeroPhotos";

/**
 * Slugs of cities whose canonical localized name is stored in every
 * locale's static UI dict as `hero.<slug>.city`. For these we trust
 * the hand-authored translation instead of going through live Google
 * Translate, which has been observed to drop trailing characters
 * (Georgian "Tbilisi" → "თბილის" instead of "თბილისი") and stale-cache
 * partial outputs in localStorage from the legacy Haiku pipeline.
 *
 * Other city names continue to flow through useTranslatedString.
 */
const STATIC_CITY_SLUGS = new Set(["tbilisi", "rome", "istanbul"]);

/**
 * Persistent cross-session cache for city hero images. The server route
 * /api/photo already does in-memory + HTTP caching, but a cold worker or
 * a fresh browser tab still pays the round-trip + image latency. We mirror
 * the resolved URL into localStorage so subsequent visits paint instantly.
 *
 * TTL kept generous (30 days) — Google Places photo URLs are signed and
 * eventually expire (~2 days for the redirect target on lh3), so we re-
 * fetch periodically. On image load error we also bust the entry.
 */
const CACHE_PREFIX = "cityPhoto:v1:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type CacheEntry = { url: string; ts: number };

function readCache(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.url || Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.url;
  } catch {
    return null;
  }
}

function writeCache(key: string, url: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ url, ts: Date.now() } satisfies CacheEntry),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

function clearCache(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Editorial city card shown on Home + Explore. Same visual language as
 * the previous DestinationCard (large rounded image, gradient overlay,
 * city label bottom-left) — but the destination is a plain city string
 * and tapping the card jumps to /results?q=<city> so the n8n attractions
 * workflow surfaces top picks for that city.
 *
 * Hero image is fetched through our /api/photo proxy (Google Places →
 * Wikipedia fallback), giving us real city photography without a paid
 * Unsplash key.
 */
export function CityCard({ city }: { city: string }) {
  const lang = useUiLang();
  const t = useT();
  // For Tbilisi/Rome/Istanbul, read the canonical localized name
  // from the static UI dictionary; otherwise fall back to live
  // Google Translate via useTranslatedString. The static dict is
  // hand-authored and won't drop trailing characters or stay stale
  // across translation-pipeline migrations.
  const slug = city.toLowerCase();
  const fallbackLabel = useTranslatedString(city);
  const label = STATIC_CITY_SLUGS.has(slug)
    ? t(`hero.${slug}.city` as UiKey)
    : fallbackLabel;
  const cacheKey = `${lang}:${city}`;
  // Curated static hero URL for the 3 launch cities — paints on first
  // frame without a /api/photo round-trip. Falls back to the API
  // lookup only if the static URL fails to load (file moved, image
  // taken down, etc.) via the `staticFailed` state below.
  const staticHero = getStaticCityHeroUrl(slug);
  const [staticFailed, setStaticFailed] = useState(false);
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    // Static-hero path: trust the curated URL on first paint. We
    // only kick off the API fallback if the <img onError> below
    // flips `staticFailed` to true.
    if (staticHero && !staticFailed) {
      setImg(staticHero);
      return;
    }
    const cached = readCache(cacheKey);
    if (cached) {
      setImg(cached);
      return;
    }
    let cancelled = false;
    fetch(`/api/photo?q=${encodeURIComponent(city)}&city=${encodeURIComponent(city)}&lang=${lang}`)
      .then((r) => r.json())
      .then((data: { url: string | null }) => {
        if (cancelled) return;
        setImg(data.url);
        if (data.url) writeCache(cacheKey, data.url);
      })
      .catch(() => {
        /* placeholder will stay */
      });
    return () => {
      cancelled = true;
    };
  }, [city, lang, cacheKey, staticHero, staticFailed]);

  // Route to the editorial city detail page when we've hand-authored
  // a profile for this city (Tbilisi / Rome / Istanbul today). Falls
  // back to /results for every other city so the broader Featured
  // strip still works without needing per-city content. Beka's spec:
  // the 3 launch cities get a curated landing, the rest dispatch
  // straight to search.
  const hasProfile = !!getCityProfile(slug);
  const linkProps = hasProfile
    ? ({ to: "/destinations/$slug", params: { slug } } as const)
    : ({ to: "/results", search: { q: city } } as const);

  return (
    <Link
      {...linkProps}
      className="group relative block h-[210px] overflow-hidden rounded-3xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant active:scale-[0.99]"
    >
      {img ? (
        <img
          src={img}
          alt={city}
          loading="lazy"
          onError={() => {
            // Static curated URL failed — flip the flag so the
            // useEffect kicks the /api/photo fallback. Otherwise
            // we'd be stuck on the placeholder gradient if a
            // Wikipedia file got renamed or taken down.
            if (img === staticHero && !staticFailed) {
              setStaticFailed(true);
              setImg(null);
              return;
            }
            clearCache(cacheKey);
            setImg(null);
          }}
          onLoad={(e) => {
            // Lovable / Cloudflare Pages serves the SPA index.html
            // shell as a 200 OK for any unknown asset path — so a
            // missing /images/cities/<slug>.jpg never triggers
            // `onError`. The HTML response decodes to a 0×0 image
            // with no pixels. Detect that here and fall through to
            // the API lookup just like a real 404 would.
            const target = e.currentTarget;
            if (
              img === staticHero &&
              !staticFailed &&
              (target.naturalWidth === 0 || target.naturalHeight === 0)
            ) {
              setStaticFailed(true);
              setImg(null);
            }
          }}
          className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-secondary to-card" />
      )}
      {/* Bottom gradient + label text are LOCKED to dark / white in
          both themes. The previous `from-background` gradient followed
          the theme — fine in dark mode, but in light mode it poured
          a near-white wash over the bottom half of the photo and
          bleached the cityscape (Beka caught this on the Featured
          Cities row: Tbilisi, Rome, and Istanbul all looked milky
          under the title labels). Hardcoding a black-based gradient
          keeps the photo punchy in both themes while still giving
          enough contrast for the white city name. */}
      {/* Uniform darkening overlay removed per Beka 2026-06-06 — the
          static bundled photos already have plenty of dynamic range
          and the wash made cityscapes look flat. The bottom gradient
          stays because it carries the contrast for the white city
          label. The Hero on HomeScreen.tsx is intentionally left
          untouched. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

      {/* Curated-page badge — top-right pill on cards that route to
          the editorial /destinations/$slug page. Helps users spot
          which cities have full landing pages (intro / gallery /
          museums / neighborhoods / local-loves) vs the search-only
          dispatch for everything else. Gold pill matches brand. Uses
          a dark frosted background in both themes for the same
          reason as the bottom gradient — light-theme `bg-background`
          made the badge nearly invisible against bright skies. */}
      {hasProfile && (
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-black/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-md">
          ★ Lokali Guide
        </div>
      )}
      <div className="absolute inset-x-4 bottom-4">
        <h3 className="font-display text-[26px] font-medium leading-[1.05] text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]">
          {label}
        </h3>
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
          <MapPin className="h-2.5 w-2.5" /> {label}
        </div>
      </div>
    </Link>
  );
}
