import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslatedString, useUiLang } from "@/hooks/useT";
import { getCityProfile } from "@/lib/cityProfiles";

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
  const label = useTranslatedString(city);
  const cacheKey = `${lang}:${city}`;
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
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
  }, [city, lang, cacheKey]);

  // Route to the editorial city detail page when we've hand-authored
  // a profile for this city (Tbilisi / Rome / Istanbul today). Falls
  // back to /results for every other city so the broader Featured
  // strip still works without needing per-city content. Beka's spec:
  // the 3 launch cities get a curated landing, the rest dispatch
  // straight to search.
  const slug = city.toLowerCase();
  const hasProfile = !!getCityProfile(slug);
  const linkProps = hasProfile
    ? ({ to: "/destinations/$slug", params: { slug } } as const)
    : ({ to: "/results", search: { q: city } } as const);

  return (
    <Link
      {...linkProps}
      className="group relative block h-[168px] overflow-hidden rounded-3xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant active:scale-[0.99]"
    >
      {img ? (
        <img
          src={img}
          alt={city}
          loading="lazy"
          onError={() => {
            clearCache(cacheKey);
            setImg(null);
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
      <div className="pointer-events-none absolute inset-0 bg-black/20" />
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
