import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslatedString, useUiLang } from "@/hooks/useT";

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
