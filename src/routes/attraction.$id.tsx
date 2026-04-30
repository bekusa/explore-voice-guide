import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  MapPin,
  Star,
  Clock,
  Play,
  Loader2,
  Bookmark,
  BookmarkCheck,
  Download,
  Lightbulb,
  Eye,
  Compass,
  Camera,
  Coffee,
  Shirt,
  Timer,
  BookOpen,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import {
  attractionSlug,
  detectQueryLanguage,
  fetchAttractions,
  fetchGuideData,
  fetchGuideFresh,
  fetchPlacePhoto,
  unslugAttraction,
  type Attraction,
  type GuideData,
} from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getCachedGuide, getCachedGuideData, onGuideCacheChange } from "@/lib/guideCache";
import { setInterest, useInterest } from "@/lib/interestPreference";
import { INTERESTS } from "@/lib/interests";
import { useT } from "@/hooks/useT";

type Search = { name?: string };

export const Route = createFileRoute("/attraction/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    name: typeof search.name === "string" ? search.name : undefined,
  }),
  head: ({ params }) => {
    const title = unslugAttraction(params.id);
    return {
      meta: [
        { title: `${title} — Voices of Old Tbilisi` },
        { name: "description", content: `A cinematic audio guide to ${title} in Tbilisi.` },
        { property: "og:title", content: `${title} — Voices of Old Tbilisi` },
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
  const preferredLanguage = usePreferredLanguage();

  const fallbackName = searchName ?? unslugAttraction(id);
  // Detect language from the place name itself so the n8n guide comes
  // back in the same language the user was browsing in. Falls back to
  // the user's preferred UI language when the name has no script hint.
  const language = detectQueryLanguage(fallbackName, preferredLanguage);
  // Global per-user interest preference (single-select, persisted in
  // localStorage). Tilts the n8n guide toward a topic — e.g.
  // "photography" gets more on framing, light, materials than dates.
  // Defaults to History when unset (Lokali's heritage-tourist baseline).
  const interest = useInterest();
  const [attraction, setAttraction] = useState<Attraction | null>(
    searchName ? { name: searchName } : null,
  );
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // Full guide payload (script + key_facts/tips/look_for/nearby).
  // Initialized from cache for instant first paint when revisiting a place.
  const [guide, setGuide] = useState<GuideData | null>(() => {
    const cached = getCachedGuideData(fallbackName, language, interest);
    return cached && cached.script ? cached : null;
  });
  const [loadingScript, setLoadingScript] = useState(false);
  const script = guide?.script ?? "";
  // Hero image — n8n's image_url wins; otherwise lazily fetch from
  // Google Places / Wikipedia, same flow as the result cards.
  const [heroPhoto, setHeroPhoto] = useState<string | null>(null);

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
  // Re-runs when `interest` flips: each interest namespace caches
  // separately, so swapping pulls a different (or fetches a fresh)
  // bias-tilted guide.
  useEffect(() => {
    const name = attraction?.name ?? fallbackName;
    const cached = getCachedGuideData(name, language, interest);
    if (cached && cached.script) {
      setGuide(cached);
      return;
    }
    // Clear stale guide so the previous interest's content doesn't
    // linger on screen while the new one is in flight.
    setGuide(null);
    let cancelled = false;
    setLoadingScript(true);
    fetchGuideData(name, language, interest)
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
  }, [attraction?.name, fallbackName, language, interest]);

  // Hero photo: prefer n8n's image_url, otherwise lazy-fetch from
  // Google Places / Wikipedia. Reset when the place changes.
  useEffect(() => {
    const name = attraction?.name ?? fallbackName;
    if (attraction?.image_url) {
      setHeroPhoto(attraction.image_url);
      return;
    }
    setHeroPhoto(null);
    let cancelled = false;
    fetchPlacePhoto(name, language).then((url) => {
      if (!cancelled && url) setHeroPhoto(url);
    });
    return () => {
      cancelled = true;
    };
  }, [attraction?.name, attraction?.image_url, fallbackName, language]);

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
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt={a?.name ?? fallbackName}
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
            {/* Save / Download / Play live in the ActionRow below the hero
                so the user has one consolidated place to act. */}
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

        {/* Action row — Save / Download / Play, all in one place
            so the user always knows where to find them. */}
        <ActionRow
          name={a?.name ?? fallbackName}
          attraction={a}
          language={language}
          interest={interest}
          starting={starting}
          onPlay={startJourney}
        />

        {/* Interest picker — Beka's product call: bias the *guide* (not
            the discovery list) by user interest. Tap a chip → re-fetches
            the n8n /webhook/guide with that interest, and the script /
            chips come back tilted toward it. History default. */}
        <InterestPicker current={interest} onPick={setInterest} loading={loadingScript} />

        {/* About — outside-view short description (n8n: outside_desc).
            FIRST: at-a-glance factual summary. */}
        <AboutSection loading={loading} aboutText={a?.outside_desc ?? a?.description ?? ""} />

        {/* The story — what a local would tell you (n8n: insider_desc).
            SECOND: longer, story-shaped intro before the audio guide
            content itself. */}
        <StorySection storyText={a?.insider_desc} />

        {/* The stops — the full narrated audio-guide content (n8n: script).
            THIRD: rendered as flowing prose, with no chapter cards or
            numbering — Beka's request was to keep the content but drop
            the divisions. */}
        <StopsSection script={script} loading={loadingScript} />

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

        {/* Nearby — clickable links to nearby attractions. Tapping
            navigates to /attraction/$id for that place, which kicks off
            the same n8n fetch flow and gives the user a continuous
            wandering-from-place-to-place experience. */}
        <NearbyLinks items={guide?.nearby_suggestions} />
      </div>
    </MobileFrame>
  );
}

/**
 * One consolidated row of actions — Save, Download, Play — so the
 * user always knows where to find them. Play is the primary gold
 * button (the headline action); Save and Download are secondary
 * outline buttons. Mirrors the pattern in NearYouCard so users see
 * the same controls everywhere they meet a guide.
 */
function ActionRow({
  name,
  attraction,
  language,
  interest,
  starting,
  onPlay,
}: {
  name: string;
  attraction: Attraction | null;
  language: string;
  // Current interest bias — drives both the cache lookup (so the
  // "Offline" pill reflects whether THIS interest's guide is cached,
  // not just any version) and the download fetch.
  interest: string;
  starting: boolean;
  onPlay: () => void;
}) {
  const online = useOnlineStatus();
  const items = useSavedItems();
  const id = useMemo(() => attractionSlug(name), [name]);
  const saved = items.some((s) => s.id === id) || isSaved(id);

  // Live cache state — re-renders when a download finishes / cache clears.
  // Re-runs on interest swap so a freshly-picked bias starts as
  // "Get" again until that bias is downloaded.
  const [cached, setCached] = useState(false);
  useEffect(() => {
    const refresh = () => setCached(!!getCachedGuide(name, language, interest));
    refresh();
    return onGuideCacheChange(refresh);
  }, [name, language, interest]);

  const [downloading, setDownloading] = useState(false);

  const toggleSave = () => {
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

  const downloadOffline = async () => {
    if (cached) {
      toast.info("Already downloaded", {
        description: "This guide plays offline.",
      });
      return;
    }
    if (!online) {
      toast.error("You're offline", {
        description: "Connect once to download the guide.",
      });
      return;
    }
    setDownloading(true);
    try {
      const script = await fetchGuideFresh(name, language, interest);
      if (script) {
        toast.success("Downloaded for offline", { description: name });
        setCached(true);
      } else {
        toast.error("No guide returned");
      }
    } catch (err) {
      toast.error("Download failed", {
        description: err instanceof Error ? err.message : "Try again later.",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="px-6 -mt-2 relative z-20">
      <div className="flex items-stretch gap-2.5">
        {/* Play — primary, large, gold. The headline action. */}
        <button
          onClick={onPlay}
          disabled={starting}
          aria-label="Begin journey"
          className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-gold px-5 py-3.5 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-80"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15">
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
            )}
          </span>
          <span className="text-left">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] opacity-70">
              Begin
            </span>
            <span className="block text-[13px] font-semibold leading-tight">Listen</span>
          </span>
        </button>

        {/* Save — secondary outline */}
        <button
          onClick={toggleSave}
          aria-label={saved ? "Remove from saved" : "Save for offline"}
          aria-pressed={saved}
          className={`grid w-[64px] place-items-center rounded-2xl border px-2 transition-smooth ${
            saved
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border/70 bg-card text-foreground hover:border-primary/40"
          }`}
        >
          <span className="flex flex-col items-center gap-1">
            {saved ? (
              <BookmarkCheck className="h-4 w-4 fill-current" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
              {saved ? "Saved" : "Save"}
            </span>
          </span>
        </button>

        {/* Download — secondary outline (or filled when already cached) */}
        <button
          onClick={downloadOffline}
          disabled={downloading}
          aria-label={cached ? "Already downloaded" : "Download for offline"}
          className={`grid w-[64px] place-items-center rounded-2xl border px-2 transition-smooth disabled:opacity-80 ${
            cached
              ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
              : "border-border/70 bg-card text-foreground hover:border-primary/40"
          }`}
        >
          <span className="flex flex-col items-center gap-1">
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
              {downloading ? "Saving" : cached ? "Offline" : "Get"}
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

/**
 * Remove TTS direction markers from a narrated script before display.
 * The narration backend embeds tags like `[PAUSE]`, `[BREAK]`, `[BEAT]`,
 * `(pause)`, and SSML-style `<break time="500ms"/>` to guide the voice
 * synthesiser. They're meaningless when the user is reading, so strip
 * them out and tidy the leftover whitespace.
 */
function stripTtsMarkers(script: string): string {
  if (!script) return "";
  return (
    script
      // `[PAUSE]`, `[BREAK]`, `[BEAT]`, `[silence]` etc. — bracketed cues
      .replace(/\[\s*(?:pause|break|beat|silence|wait|tone|sfx)[^\]]*\]/gi, "")
      // `(pause)`, `(beat)` parenthesised cues
      .replace(/\(\s*(?:pause|break|beat|silence|wait)\s*\)/gi, "")
      // SSML-ish `<break time="500ms"/>` / `<pause/>`
      .replace(/<\s*(?:break|pause)[^>]*\/?>/gi, "")
      // Collapse the double-spaces left behind, but keep paragraph breaks.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
  );
}

/* ---------- Lokali rich sections ---------- */

/**
 * Interest picker — single-select chip row. Tapping a chip writes to
 * the global interest preference (lib/interestPreference.ts), which in
 * turn re-fetches the n8n guide with that bias in the payload.
 *
 * Why it lives here (and not on /results): the interest tilts content
 * generation — the per-place narrated guide — not the discovery list.
 * Beka: "მაგის მიხედვით დამიგენერიროს კონტენქტი, … თუ ფოტოგრაფია
 * მაინტერესებს მეტი ინფორმაცია მომცეს ფოტოგრაფიაზე ვიდრე ისტორიაზე."
 *
 * `loading` flips the row's appearance subtly so the user sees the
 * picker is still responsive while the new bias is in flight.
 */
function InterestPicker({
  current,
  onPick,
  loading,
}: {
  current: string;
  onPick: (id: string) => void;
  loading: boolean;
}) {
  const t = useT();
  return (
    <section className="mt-6 px-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[16px] text-foreground">
          Tilt the <span className="italic text-primary">guide</span>
        </h2>
        {loading && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        {t("filters.interests")}: pick what to focus on.
      </p>
      <div
        className="-mx-6 mt-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="radiogroup"
        aria-label="Interest"
      >
        <div className="flex items-center gap-2">
          {INTERESTS.map((it) => {
            const active = current === it.id;
            return (
              <button
                key={it.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  if (!active) onPick(it.id);
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-smooth ${
                  active
                    ? "border-primary/60 bg-primary/15 text-primary shadow-soft"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span aria-hidden>{it.emoji}</span>
                {t(it.key)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * About — short outside-view description (n8n: outside_desc).
 * FIRST in the body. Hidden when there is nothing useful to show.
 */
function AboutSection({ loading, aboutText }: { loading: boolean; aboutText: string }) {
  if (loading && !aboutText) {
    return (
      <section className="mt-8 px-6">
        <h2 className="font-display text-[20px] text-foreground">
          About <span className="italic text-primary">this place</span>
        </h2>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/70" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
        </div>
      </section>
    );
  }
  if (!aboutText) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        About <span className="italic text-primary">this place</span>
      </h2>
      <p className="mt-4 text-[13.5px] leading-relaxed text-foreground/80">{aboutText}</p>
    </section>
  );
}

/**
 * The story — the local's-view longer narrative (n8n: insider_desc).
 * Renders as readable prose with a Sparkles glyph so it reads warmer
 * than the factual "About" block above. Hidden when n8n didn't ship one.
 */
function StorySection({ storyText }: { storyText?: string }) {
  if (!storyText || !storyText.trim()) return null;
  // insider_desc may arrive as one long line or as paragraphs — split
  // on blank lines so multi-paragraph stories stay readable.
  const paragraphs = storyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <section className="mt-8 px-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-[20px] text-foreground">
          The <span className="italic text-primary">story</span>
        </h2>
      </div>
      <div className="mt-4 space-y-4 text-[15.5px] leading-[1.75] text-foreground/90">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

/**
 * The stops — the full narrated audio-guide content (n8n: script).
 * Rendered as continuous flowing paragraphs with NO chapter cards
 * or stop numbers — Beka's request was to keep all the content but
 * drop the divisions/chapters. TTS markers like [PAUSE] are stripped
 * via stripTtsMarkers so the on-screen text stays clean.
 */
function StopsSection({ script, loading }: { script: string; loading: boolean }) {
  const paragraphs = useMemo(
    () =>
      stripTtsMarkers(script)
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        // Drop short stand-alone lines that look like stop headings
        // (e.g. "Stop 1", "1.", "## Welcome") so we end up with prose
        // only, no leftover chapter scaffolding.
        .filter(
          (p) =>
            p.length > 0 &&
            !/^#{1,3}\s+/.test(p) &&
            !/^\s*(?:stop\s*\d+|\d+\s*[.)])\s*[:\-—]?\s*[^\n]{0,40}$/i.test(p),
        ),
    [script],
  );

  // Tall skeleton while we wait for the script — keeps the page from
  // jumping when the text lands.
  if (loading && paragraphs.length === 0) {
    return (
      <section className="mt-8 px-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-display text-[20px] text-foreground">
            The <span className="italic text-primary">stops</span>
          </h2>
        </div>
        <div className="mt-4 space-y-2.5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-secondary"
              style={{ width: `${86 + ((i * 11) % 14)}%` }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (paragraphs.length === 0) return null;

  return (
    <section className="mt-8 px-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="font-display text-[20px] text-foreground">
          The <span className="italic text-primary">stops</span>
        </h2>
      </div>
      <div className="mt-4 space-y-3.5 text-[14px] leading-[1.7] text-foreground/85">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

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

/**
 * Nearby — renders nearby_suggestions as clickable links to each
 * place's own attraction page. Each tap routes to /attraction/$id with
 * the raw place name in search params, so the destination page can
 * skip slug-guessing and fetch the n8n guide directly. Visually keeps
 * the amber tone of the old chips so the section still reads as
 * "places around you", but the chevron + hover state communicates
 * that they're tappable.
 */
function NearbyLinks({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-primary" />
        <h2 className="font-display text-[20px] text-foreground">
          <span className="italic text-primary">Nearby</span> places
        </h2>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {items.map((name, i) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          return (
            <Link
              key={`${trimmed}-${i}`}
              to="/attraction/$id"
              params={{ id: attractionSlug(trimmed) }}
              search={{ name: trimmed }}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-100 transition-smooth hover:border-amber-300/60 hover:bg-amber-500/15"
            >
              <span className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/20 text-amber-200">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13px] font-medium leading-tight">{trimmed}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-200/70 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
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
