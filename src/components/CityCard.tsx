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
        </p>
      </div>
    </Link>
  );
}
