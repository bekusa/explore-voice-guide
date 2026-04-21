import { Link } from "@tanstack/react-router";
import { Star, Clock, MapPin } from "lucide-react";
import type { Attraction } from "@/lib/mockApi";
import { useT } from "@/lib/i18n";

export function AttractionCard({ attr, priority }: { attr: Attraction; priority?: boolean }) {
  const { t } = useT();
  return (
    <Link
      to="/attraction/$id"
      params={{ id: attr.id }}
      className="group block overflow-hidden rounded-2xl bg-card shadow-card transition-smooth hover:shadow-elevated"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={attr.image}
          alt={attr.name}
          loading={priority ? "eager" : "lazy"}
          width={1024}
          height={768}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur">
          <Star className="h-3 w-3 fill-primary text-primary" />
          {attr.rating.toFixed(1)}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="font-display text-lg leading-tight text-foreground">{attr.name}</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {attr.city}, {attr.country}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {attr.durationMin} min · {attr.stops} {t("stops")}
          </span>
        </div>
      </div>
    </Link>
  );
}
