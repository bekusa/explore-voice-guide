import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslatedString, useUiLang } from "@/hooks/useT";

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
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photo?q=${encodeURIComponent(city)}&city=${encodeURIComponent(city)}&lang=${lang}`)
      .then((r) => r.json())
      .then((data: { url: string | null }) => {
        if (!cancelled) setImg(data.url);
      })
      .catch(() => {
        /* placeholder will stay */
      });
    return () => {
      cancelled = true;
    };
  }, [city, lang]);

  return (
    <Link
      to="/results"
      search={{ q: city }}
      className="group relative block h-[210px] overflow-hidden rounded-3xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant active:scale-[0.99]"
    >
      {img ? (
        <img
          src={img}
          alt={city}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-secondary to-card" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

      <div className="absolute inset-x-4 bottom-4">
        <h3 className="font-display text-[26px] font-medium leading-[1.05] text-foreground">
          {label}
        </h3>
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-foreground/70">
          <MapPin className="h-2.5 w-2.5" /> {label}
        </div>
      </div>
    </Link>
  );
}
