<<<<<<< HEAD
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { fetchPlacePhoto } from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useTranslated } from "@/hooks/useT";
import type { TopCity } from "@/lib/topCities";

/**
 * Compact card for the Top-25 city grid on Home + Explore.
 *
 * - Tap → /results?q=<city> (existing n8n attractions search flow)
 * - Hero photo lazy-loaded via fetchPlacePhoto (Google Places →
 *   Wikipedia fallback) so we don't ship 25 hero JPGs in the bundle
 * - City + country names auto-translate to the user's UI language
 *   via useTranslated
 *
 * Until the photo lands, a gradient + flag emoji holds the slot so
 * the layout doesn't jump.
 */
export function CityCard({ city }: { city: TopCity }) {
  const language = usePreferredLanguage();
  const [name, country] = useTranslated([city.name, city.country]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlacePhoto(city.query, language)
      .then((url) => {
        if (!cancelled && url) setPhoto(url);
      })
      .catch(() => {
        /* fall back to gradient placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [city.query, language]);

  return (
    <Link
      to="/results"
      search={{ q: city.query }}
      className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/50 hover:shadow-elegant"
      aria-label={`${name ?? city.name}, ${country ?? city.country}`}
    >
      {photo && !photoFailed ? (
        <img
          src={photo}
          alt={name ?? city.name}
          loading="lazy"
          onError={() => setPhotoFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-card">
          <span className="text-[44px] leading-none drop-shadow-md">{city.flag}</span>
        </div>
      )}

      {/* Bottom gradient so the title is always legible */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Country pill (top-right) */}
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-background/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-foreground backdrop-blur-md">
        <span className="text-[11px] leading-none">{city.flag}</span>
        {country ?? city.country}
      </span>

      {/* City name (bottom) */}
      <div className="absolute inset-x-2.5 bottom-2.5">
        <h3
          className="text-[18px] font-medium leading-tight text-foreground"
          style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
        >
          {name ?? city.name}
        </h3>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[9.5px] text-foreground/70">
          <MapPin className="h-2 w-2" /> {country ?? city.country}
=======
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useTranslatedString } from "@/hooks/useT";

/**
 * Compact, image-led card for a single city. Tap → /results?q=<city>.
 * Image is loaded from Unsplash Source so we don't need a bundled
 * asset per city; falls back to a gradient block if the network is down.
 */
export function CityCard({ city, index }: { city: string; index: number }) {
  const label = useTranslatedString(city);
  const img = `https://source.unsplash.com/600x800/?${encodeURIComponent(city)},city,landmark`;
  return (
    <Link
      to="/results"
      search={{ q: city }}
      className="group relative block h-[200px] overflow-hidden rounded-2xl border border-border transition-smooth hover:border-primary/50 hover:shadow-elegant active:scale-[0.99]"
      style={{ animation: `float-up 0.5s ${index * 0.04 + 0.05}s var(--transition-smooth) both` }}
    >
      <img
        src={img}
        alt={city}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute left-3 top-3 grid h-6 w-6 place-items-center rounded-full border border-foreground/15 bg-background/55 text-[10px] font-bold text-foreground backdrop-blur-md">
        {index + 1}
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <h3
          className="text-[20px] font-medium leading-tight text-foreground"
          style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
        >
          {label}
        </h3>
        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-foreground/70">
          <MapPin className="h-2.5 w-2.5" /> {label}
>>>>>>> 4486faed9cab97f659932eca88d44b74a882e8f7
        </p>
      </div>
    </Link>
  );
}
