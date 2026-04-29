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
  Lightbulb,
  Eye,
  Compass,
  Camera,
  Coffee,
  Shirt,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import {
  attractionSlug,
  fetchAttractions,
  fetchGuideData,
  unslugAttraction,
  type Attraction,
  type GuideData,
} from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";
import { getCachedGuideData } from "@/lib/guideCache";

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
  // Full guide payload (script + key_facts/tips/look_for/nearby).
  // Initialized from cache for instant first paint when revisiting a place.
  const [guide, setGuide] = useState<GuideData | null>(() => {
    const cached = getCachedGuideData(fallbackName, language);
    return cached && cached.script ? cached : null;
  });
  const [loadingScript, setLoadingScript] = useState(false);
  const script = guide?.script ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAttractions(fallbackName, language)
      .then((list) => {
        if (cancelled) return;
        const exact =
          list.find((a) => a.name.toLowerCase() === fallbackName.toLowerCase()) ?? list[0];
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

  // Fetch the rich guide (cache-first) so we can show stops + chips.
  useEffect(() => {
    const name = attraction?.name ?? fallbackName;
    const cached = getCachedGuideData(name, language);
    if (cached && cached.script) {
      setGuide(cached);
      return;
    }
    let cancelled = false;
    setLoadingScript(true);
    fetchGuideData(name, language)
      .then((data) => {
        if (!cancelled) setGuide(data);
      })
      .catch(() => {
        /* silent — chips/stops are optional, "Begin journey" still works */
      })
      .finally(() => {
        if (!cancelled) setLoadingScript(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attraction?.name, fallbackName, language]);

  const stops = useMemo(() => parseStops(script), [script]);

  const startJourney = () => {
    if (starting) return;
    setStarting(true);
    navigate({
      to: "/player",
      search: { name: attraction?.name ?? fallbackName },
    });
  };

  const a = attraction;
  // "~12 min" badge — prefer the n8n-supplied duration estimate
  const estMins = guide?.estimated_duration_seconds
    ? Math.round(guide.estimated_duration_seconds / 60)
    : null;

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
              {(estMins || a?.duration) && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {estMins ? `~${estMins} min` : a?.duration}
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
                <span className="block text-[14px] font-semibold">Listen to narrated guide</span>
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
              <p className="text-[13.5px] leading-relaxed text-foreground/80">{a.description}</p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Tap “Begin journey” to hear the narrated story of this place.
              </p>
            )}
          </div>
        </section>

        {/* Key facts — emerald chips */}
        <ChipsSection
          title="Key facts"
          icon={<Lightbulb className="h-3 w-3" />}
          tone="emerald"
          items={guide?.key_facts}
        />

        {/* What to look for — sky chips */}
        <ChipsSection
          title="What to look for"
          icon={<Eye className="h-3 w-3" />}
          tone="sky"
          items={guide?.look_for}
        />

        {/* Tips — list with rotating icons */}
        <TipsSection items={guide?.tips} />

        {/* Nearby suggestions — amber chips */}
        <ChipsSection
          title="Nearby"
          icon={<Compass className="h-3 w-3" />}
          tone="amber"
          items={guide?.nearby_suggestions}
        />

        {/* Stops */}
        <section className="mt-8 px-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[20px] text-foreground">
              The <span className="italic text-primary">stops</span>
            </h2>
            {stops.length > 0 && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {stops.length} chapters
              </span>
            )}
          </div>

          <ol className="mt-4 space-y-3">
            {loadingScript && stops.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-2xl border border-border/40 bg-card/40 p-4"
                >
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-secondary" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
                    <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/70" />
                  </div>
                </li>
              ))
            ) : stops.length > 0 ? (
              stops.map((stop, i) => (
                <li
                  key={i}
                  className="group flex gap-3 rounded-2xl border border-border/40 bg-card/40 p-4 transition-smooth hover:border-primary/40"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-[13px] font-semibold text-foreground">{stop.title}</h3>
                    {stop.preview && (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                        {stop.preview}
                      </p>
                    )}
                  </div>
                </li>
              ))
            ) : (
              <li className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-4 text-[12px] text-muted-foreground">
                Stops appear once the narrated guide is generated.
              </li>
            )}
          </ol>
        </section>
      </div>
    </MobileFrame>
  );
}

/**
 * Derive a list of "stops" from a narrated guide script.
 * Tries numbered headings, then markdown headings, then paragraph chunks.
 */
function parseStops(script: string): { title: string; preview: string }[] {
  if (!script || !script.trim()) return [];
  const text = script.trim();

  const numbered = text
    .split(/\n(?=\s*(?:Stop\s+\d+|\d+[.)])\s)/i)
    .map((b) => b.trim())
    .filter(Boolean);
  if (numbered.length >= 2) {
    return numbered.slice(0, 12).map((block) => {
      const [first, ...rest] = block.split("\n");
      const title = first.replace(/^\s*(?:Stop\s+\d+\s*[—:.\-]?\s*|\d+[.)]\s*)/i, "").trim();
      return {
        title: title || first.trim(),
        preview: rest.join(" ").trim(),
      };
    });
  }

  const mdHeadings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)];
  if (mdHeadings.length >= 2) {
    return mdHeadings.slice(0, 12).map((m, i) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = mdHeadings[i + 1]?.index ?? text.length;
      return {
        title: m[1].trim(),
        preview: text.slice(start, end).trim().replace(/\s+/g, " "),
      };
    });
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  return paragraphs.slice(0, 8).map((p, i) => {
    const sentences = p.split(/(?<=[.!?])\s+/);
    const title =
      sentences[0].length > 80 ? `Chapter ${i + 1}` : sentences[0].replace(/[.!?]+$/, "");
    const preview = sentences.slice(1).join(" ") || sentences[0];
    return { title, preview };
  });
}

/* ---------- Lokali rich sections ---------- */

const TONE_CLASSES: Record<string, string> = {
  emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  sky: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
};

function ChipsSection({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "emerald" | "sky" | "amber";
  items?: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] leading-tight ${TONE_CLASSES[tone]}`}
          >
            {icon}
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

const TIP_ICONS = [Clock, Camera, Coffee, Shirt, Timer];

function TipsSection({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        Practical <span className="italic text-primary">tips</span>
      </h2>
      <ul className="mt-4 flex flex-col gap-2.5">
        {items.map((tip, i) => {
          const Icon = TIP_ICONS[i % TIP_ICONS.length];
          return (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[12.5px] leading-relaxed text-foreground/85">{tip}</span>
            </li>
          );
        })}
      </ul>
    </section>
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
