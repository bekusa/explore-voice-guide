import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bookmark,
  BookmarkX,
  ArrowLeft,
  Clock,
  Star,
  MapPin,
  Headphones,
  WifiOff,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { useSavedItems } from "@/hooks/useSavedItems";
import { clearAll, removeItem } from "@/lib/savedStore";
import { attractionSlug } from "@/lib/api";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved — Voices of Old Tbilisi" },
      {
        name: "description",
        content:
          "Your offline library: saved places and narrated guides available without a connection.",
      },
      { property: "og:title", content: "Saved — Voices of Old Tbilisi" },
      {
        property: "og:description",
        content: "Your offline library of saved places and narrated guides.",
      },
    ],
  }),
  component: SavedPage,
});

function SavedPage() {
  const items = useSavedItems();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        {/* Header */}
        <header className="relative z-10 flex items-center justify-between px-6 pt-12">
          <Link
            to="/"
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {items.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear all saved places?")) clearAll();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-smooth hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          )}
        </header>

        <section className="px-6 pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
            <Bookmark className="h-3 w-3" /> Offline library
          </span>
          <h1 className="mt-4 font-display text-[2.25rem] font-medium leading-[1.05]">
            Your <span className="italic text-primary">saved</span> places
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            Stored on this device. Available without a connection — perfect for
            wandering side streets where signal is thin.
          </p>

          {!online && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[11.5px] text-accent">
              <WifiOff className="h-3.5 w-3.5" />
              You're offline — only saved places are available.
            </div>
          )}
        </section>

        {/* List */}
        <section className="mt-7 px-6">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const a = item.attraction;
                const slug = attractionSlug(item.name);
                const hasGuide = !!item.script;
                return (
                  <li
                    key={item.id}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-smooth hover:border-primary/40"
                  >
                    <Link
                      to="/attraction/$id"
                      params={{ id: slug }}
                      search={{ name: item.name }}
                      className="flex flex-1 items-center gap-3"
                    >
                      <div className="h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl bg-secondary">
                        {item.imageDataUrl || a.image_url ? (
                          <img
                            src={item.imageDataUrl ?? a.image_url}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-muted-foreground">
                            <MapPin className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[14.5px] font-semibold">
                          {item.name}
                        </h3>
                        <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          <Headphones className="h-2.5 w-2.5" />
                          {hasGuide ? "Guide cached" : "Audio guide"}
                        </p>
                        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                          {a.duration && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" /> {a.duration}
                            </span>
                          )}
                          {typeof a.rating === "number" && (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <Star className="h-2.5 w-2.5 fill-primary" />
                              {a.rating.toFixed(2)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Bookmark className="h-2.5 w-2.5" />
                            {new Date(item.savedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-smooth hover:border-accent/50 hover:text-accent"
                    >
                      <BookmarkX className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
        <Bookmark className="h-5 w-5" />
      </div>
      <h2 className="mt-5 font-display text-[20px]">
        Nothing saved <span className="italic text-primary">yet</span>
      </h2>
      <p className="mt-2 max-w-[260px] text-[12.5px] leading-[1.55] text-muted-foreground">
        Tap the bookmark on any place to keep its story on your phone — ready
        for offline exploration.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-background transition-smooth hover:scale-[1.02]"
      >
        Explore places
      </Link>
    </div>
  );
}
