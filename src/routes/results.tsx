import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, List, Map as MapIcon, MapPin } from "lucide-react";
import { z } from "zod";
import { useT } from "@/lib/i18n";
import { searchAttractions, type Attraction } from "@/lib/mockApi";
import { AttractionCard } from "@/components/AttractionCard";
import { CardSkeleton } from "@/components/CardSkeleton";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/results")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Search results — Lokali" },
      { name: "description", content: "Browse attractions and switch between list and map view." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { q = "" } = Route.useSearch();
  const { t } = useT();
  const [items, setItems] = useState<Attraction[] | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    setItems(null);
    searchAttractions(q).then(setItems);
  }, [q]);

  return (
    <div className="animate-slide-in pt-safe">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link to="/" className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 truncate">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("results")}</p>
            <p className="truncate font-display text-lg leading-tight text-foreground">{q || t("featured")}</p>
          </div>
          {/* List/map toggle */}
          <div className="flex rounded-full bg-muted p-1">
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                view === "list" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
              {t("list")}
            </button>
            <button
              onClick={() => setView("map")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                view === "map" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              <MapIcon className="h-3.5 w-3.5" />
              {t("map")}
            </button>
          </div>
        </div>
      </header>

      {view === "list" ? (
        <div className="space-y-4 p-5">
          {items === null ? (
            Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            items.map((a, i) => <AttractionCard key={a.id} attr={a} priority={i === 0} />)
          )}
        </div>
      ) : (
        <MapPlaceholder items={items ?? []} />
      )}
    </div>
  );
}

function MapPlaceholder({ items }: { items: Attraction[] }) {
  return (
    <div className="relative m-5 overflow-hidden rounded-3xl border border-border bg-secondary/40 shadow-card">
      <div
        className="aspect-[3/4] w-full"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, oklch(0.93 0.03 80 / 0.6), transparent 40%)," +
            "radial-gradient(circle at 80% 60%, oklch(0.62 0.16 35 / 0.18), transparent 50%)," +
            "linear-gradient(135deg, oklch(0.95 0.02 80), oklch(0.92 0.04 70))",
        }}
      >
        {/* faux pins */}
        {items.slice(0, 6).map((a, i) => (
          <Link
            key={a.id}
            to="/attraction/$id"
            params={{ id: a.id }}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${15 + ((i * 17) % 70)}%`, top: `${20 + ((i * 23) % 60)}%` }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-elevated ring-2 ring-card">
              <MapPin className="h-4 w-4" fill="currentColor" />
            </span>
          </Link>
        ))}
      </div>
      <div className="border-t border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "place" : "places"} on the map
        </p>
      </div>
    </div>
  );
}
