import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  MapPin,
  Star,
  Clock,
  Play,
  Headphones,
  Loader2,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import {
  attractionSlug,
  fetchAttractions,
  unslugAttraction,
  type Attraction,
} from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";

type Search = { name?: string };

export const Route = createFileRoute("/attraction/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    name: typeof search.name === "string" ? search.name : undefined,
  }),
  head: ({ params }) => {
    const title = unslugAttraction(params.id);
    return {
      meta: [
        { title: `${title} — Whispers of Old Tbilisi` },
        { name: "description", content: `A cinematic audio guide to ${title} in Tbilisi.` },
        { property: "og:title", content: `${title} — Whispers of Old Tbilisi` },
        { property: "og:description", content: `A cinematic audio guide to ${title}.` },
      ],
    };
  },
  component: AttractionPage,
});

function AttractionPage() {
  const { id } = Route.useParams();
  const { name: searchName } = Route.useSearch();
  const navigate = useNavigate();
  const language = usePreferredLanguage();

  const fallbackName = searchName ?? unslugAttraction(id);
  const [attraction, setAttraction] = useState<Attraction | null>(
    searchName ? { name: searchName } : null,
  );
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAttractions(fallbackName, language)
      .then((list) => {
        if (cancelled) return;
        const exact =
          list.find((a) => a.name.toLowerCase() === fallbackName.toLowerCase()) ??
          list[0];
        if (exact) setAttraction(exact);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error("Couldn't load this place", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackName, language]);

  const startJourney = () => {
    if (starting) return;
    setStarting(true);
    navigate({
      to: "/player",
      search: { name: attraction?.name ?? fallbackName },
    });
  };

  const a = attraction;

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        {/* Hero */}
        <section className="relative h-[420px] w-full overflow-hidden">
          {a?.image_url ? (
            <img
              src={a.image_url}
              alt={a.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-card" />
          )}
          <div className="absolute inset-0 bg-gradient-hero" />

          <header className="relative z-10 flex items-start justify-between px-6 pt-12">
            <Link
              to="/results"
              search={{ q: fallbackName }}
              aria-label="Back"
              className="grid h-10 w-10 place-items-center rounded-full border border-foreground/20 bg-background/30 backdrop-blur-md transition-smooth hover:bg-background/50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <SaveToggle name={a?.name ?? fallbackName} attraction={a} language={language} />
          </header>

          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-7 animate-float-up">
            {a?.category && (
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 backdrop-blur-md">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                  {a.category}
                </span>
              </span>
            )}
            <h1 className="mt-4 font-display text-[2.25rem] font-medium leading-[1.05] text-foreground">
              {a?.name ?? fallbackName}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-foreground/75">
              {a?.duration && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> {a.duration}
                </span>
              )}
              {typeof a?.rating === "number" && (
                <>
                  <span className="h-3 w-px bg-foreground/25" />
                  <span className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                    {a.rating.toFixed(2)}
                  </span>
                </>
              )}
              {typeof a?.lat === "number" && typeof a?.lng === "number" && (
                <>
                  <span className="h-3 w-px bg-foreground/25" />
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {a.lat.toFixed(3)}, {a.lng.toFixed(3)}
                  </span>
                </>
              )}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 -mt-2 relative z-20">
          <button
            onClick={startJourney}
            disabled={starting}
            className="group flex w-full items-center justify-between rounded-2xl bg-gradient-gold px-5 py-4 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-80"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15">
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px] fill-current" />
                )}
              </span>
              <span className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">
                  Begin journey
                </span>
                <span className="block text-[14px] font-semibold">
                  Listen to narrated guide
                </span>
              </span>
            </span>
            <Headphones className="h-4 w-4 opacity-80" />
          </button>
        </section>

        {/* Description */}
        <section className="mt-8 px-6">
          <h2 className="font-display text-[20px] text-foreground">
            About <span className="italic text-primary">this place</span>
          </h2>
          <div className="mt-4">
            {loading && !a?.description ? (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-secondary" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/70" />
                <div className="h-3 w-10/12 animate-pulse rounded bg-secondary/60" />
              </div>
            ) : a?.description ? (
              <p className="text-[13.5px] leading-relaxed text-foreground/80">
                {a.description}
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Tap “Begin journey” to hear the narrated story of this place.
              </p>
            )}
          </div>
        </section>
      </div>
    </MobileFrame>
  );
}

function SaveToggle({
  name,
  attraction,
  language,
}: {
  name: string;
  attraction: Attraction | null;
  language: string;
}) {
  const items = useSavedItems();
  const id = useMemo(() => attractionSlug(name), [name]);
  const saved = items.some((s) => s.id === id) || isSaved(id);

  const toggle = () => {
    if (saved) {
      removeItem(id);
      toast("Removed from Saved");
      return;
    }
    saveItem({
      id,
      name,
      language,
      savedAt: Date.now(),
      attraction: attraction ?? { name },
    });
    toast.success("Saved for offline", {
      description: "Find it in the Saved tab — works without a connection.",
    });
  };

  return (
    <button
      onClick={toggle}
      aria-label={saved ? "Remove from saved" : "Save for offline"}
      aria-pressed={saved}
      className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md transition-smooth ${
        saved
          ? "border-primary/60 bg-primary/20 text-primary"
          : "border-foreground/20 bg-background/30 text-foreground hover:bg-background/50"
      }`}
    >
      {saved ? (
        <BookmarkCheck className="h-4 w-4 fill-current" />
      ) : (
        <Bookmark className="h-4 w-4" />
      )}
    </button>
  );
}
