import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft,
  MapPin,
  Star,
  Clock,
  Play,
  Pause,
  Square,
  Rewind,
  FastForward,
  RotateCcw,
  X,
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingMessages } from "@/components/LoadingMessages";
import { InlineAudioPanel } from "@/components/InlineAudioPanel";
import { MobileFrame } from "@/components/MobileFrame";
import { UnescoBadge } from "@/components/UnescoBadge";
import { isUnescoSite } from "@/lib/unesco";
import {
  attractionSlug,
  detectQueryLanguage,
  fetchAttractions,
  fetchGuideData,
  fetchGuideFresh,
  fetchMuseumHighlights,
  fetchPlacePhoto,
  unslugAttraction,
  type Attraction,
  type GuideData,
  type MuseumHighlight,
} from "@/lib/api";
import { findMuseumByName, type Museum } from "@/lib/topMuseums";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLazyPlacePhoto } from "@/hooks/useLazyPlacePhoto";
import { getCachedGuide, getCachedGuideData, onGuideCacheChange } from "@/lib/guideCache";
import { DEFAULT_INTEREST, INTERESTS } from "@/lib/interests";
import { useT } from "@/hooks/useT";

type Search = { name?: string; city?: string };

export const Route = createFileRoute("/attraction/$id")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    name: typeof search.name === "string" ? search.name : undefined,
    // City context — passed by /results when the user searched for a
    // city (e.g. "Bangkok"). The photo lookup uses this to disambiguate
    // names that resolve to the wrong country without context (Beka
    // caught "Grand Palace" matching a local restaurant in Tbilisi
    // because the Google Places key has Tbilisi region bias and we
    // weren't sending the actual destination city).
    city: typeof search.city === "string" ? search.city : undefined,
  }),
  head: ({ params }) => {
    const title = unslugAttraction(params.id);
    return {
      meta: [
        { title: `${title} — Lokali` },
        { name: "description", content: `A cinematic audio guide to ${title} in Tbilisi.` },
        { property: "og:title", content: `${title} — Lokali` },
        { property: "og:description", content: `A cinematic audio guide to ${title}.` },
      ],
    };
  },
  component: AttractionPage,
});

function AttractionPage() {
  const { id } = Route.useParams();
  const { name: searchName, city: searchCity } = Route.useSearch();
  const navigate = useNavigate();
  const preferredLanguage = usePreferredLanguage();
  const t = useT();
  // Reactive online flag — used to suppress "couldn't load place"
  // toasts when the user is offline AND we already have a cached
  // guide rendering. Beka reported the page worked fine offline
  // (cached script visible, hero photo cached) but still threw a
  // red error toast because fetchAttractions threw on the network
  // failure. With the cache hit, that toast is noise.
  const online = useOnlineStatus();

  const fallbackName = searchName ?? unslugAttraction(id);
  // Detect language from the place name itself so the n8n guide comes
  // back in the same language the user was browsing in. Falls back to
  // the user's preferred UI language when the name has no script hint.
  const language = detectQueryLanguage(fallbackName, preferredLanguage);
  // Global per-user interest preference (single-select, persisted in
  // localStorage). Tilts the n8n guide toward a topic — e.g.
  // "photography" gets more on framing, light, materials than dates.
  // Defaults to History when unset (Lokali's heritage-tourist baseline).
  // Beka's spec: every fresh attraction page open should land on
  // Editor's Pick by default, regardless of what the user picked
  // last time. Local state (not global) — chip taps re-fetch a
  // bias-tilted guide for THIS attraction only and don't leak into
  // the next place the user opens.
  const [interest, setInterest] = useState<string>(DEFAULT_INTEREST);
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

  // What the InlineAudioPanel actually speaks. Originally just the
  // narrated `script`; Beka asked for the audio to also cover the
  // Key Facts, What to Look For, and Practical Tips sections so the
  // user can listen straight through without scrolling. We stitch
  // them on with translated section headers and double-newlines so
  // Azure's TTS gives each block a natural pause.
  const fullScript = useMemo(() => {
    if (!guide) return "";
    const parts: string[] = [];
    if (guide.script) parts.push(guide.script);
    const join = (items: string[]) =>
      items
        .map((s) => s.trim())
        .filter(Boolean)
        .join(". ");
    if (guide.key_facts?.length) {
      parts.push("\n\n" + t("attr.keyFactsTitle") + ".\n" + join(guide.key_facts) + ".");
    }
    if (guide.look_for?.length) {
      parts.push("\n\n" + t("attr.whatToLook") + ".\n" + join(guide.look_for) + ".");
    }
    if (guide.tips?.length) {
      parts.push(
        "\n\n" + t("attr.practical") + " " + t("attr.tips") + ".\n" + join(guide.tips) + ".",
      );
    }
    return parts.join("");
  }, [guide, t]);
  // Hero image — n8n's image_url wins; otherwise lazily fetch from
  // Google Places / Wikipedia, same flow as the result cards.
  // Photo lookups MUST use the English name (Google Places + Wikipedia
  // are far more reliable in English, and a localised search like
  // "თავისუფლების ქანდაკება" actually matched Tbilisi's Freedom Square
  // instead of the New York Statue of Liberty). `name_en` is set by
  // translateAttractionsPayload on every translated row; English
  // baseline rows just have `name`.
  // city hint: prefer attraction.city, fall back to the search bar's
  // city so generic-named places like "Grand Palace" land in the
  // user's actual destination (Bangkok), not the API key's regional
  // default (Tbilisi).
  const heroCity =
    (typeof attraction?.city === "string" ? attraction.city : null) || searchCity;
  const heroLookupName = attraction?.name_en ?? attraction?.name ?? fallbackName;
  const heroFetched = useLazyPlacePhoto(heroLookupName, {
    cityHint: heroCity,
    skip: !!attraction?.image_url,
  });
  const heroPhoto = attraction?.image_url ?? heroFetched;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Capture the cached-guide presence at effect-fire time so the
    // catch block below can tell "user is offline but has a working
    // page" from "user is online and the lookup just failed". We
    // capture from `guide` (the live state) rather than re-reading
    // cache because guide may have been hydrated from cache already.
    const hadCachedGuide = !!guide?.script;
    fetchAttractions(fallbackName, language)
      .then((list) => {
        if (cancelled) return;
        // Match the requested attraction against BOTH the localised
        // `name` AND the preserved `name_en`. Beka caught Hyde Park
        // displaying as "Serpentine Lake" — the URL had
        // ?name=Hyde+Park but the translated list came back with
        // every entry's `name` in Georgian. The English-vs-Georgian
        // exact-match failed, so the fallback `list[0]` (whichever
        // attraction Sonnet ranked first) won. name_en is preserved
        // by translateAttractionsPayload exactly for this kind of
        // cross-locale handle matching.
        const target = fallbackName.toLowerCase();
        const exact =
          list.find(
            (a) =>
              a.name.toLowerCase() === target ||
              (typeof a.name_en === "string" && a.name_en.toLowerCase() === target),
          ) ?? list[0];
        if (exact) setAttraction(exact);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Suppress the error toast when the user is offline and we
        // already have a cached guide rendering — the page is usable
        // and the red toast just adds noise. We still toast on
        // genuine online failures (5xx from /api/attractions, rate
        // limit, etc.) so the user knows refresh might help.
        if (!online && hadCachedGuide) return;
        toast.error(t("attr.couldNotLoadPlace"), {
          description: err instanceof Error ? err.message : t("toast.tryAgainPlease"),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Hero photo handled by useLazyPlacePhoto declared above.

  // Museum highlights — only fetched when the attraction matches one
  // of the curated MUSEUMS in src/lib/topMuseums.ts. The match key is
  // the English-baseline name when available (`name_en`) so a
  // localised display name like "ლუვრი" still resolves to the
  // Louvre's id. Cached server-side per (museum, lang); first hit on
  // a fresh tuple takes ~30-60 s, every visitor after that ~50 ms.
  const matchedMuseum = useMemo<Museum | null>(
    () => findMuseumByName(attraction?.name_en ?? attraction?.name ?? fallbackName),
    [attraction?.name, attraction?.name_en, fallbackName],
  );
  const [highlights, setHighlights] = useState<MuseumHighlight[] | null>(null);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  useEffect(() => {
    if (!matchedMuseum) {
      setHighlights(null);
      return;
    }
    let cancelled = false;
    setLoadingHighlights(true);
    setHighlights(null);
    fetchMuseumHighlights(matchedMuseum.id, language)
      .then((data) => {
        if (!cancelled) setHighlights(data);
      })
      .catch(() => {
        if (!cancelled) setHighlights([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHighlights(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchedMuseum, language]);

  // Inline audio player state. Replaces the old /player page — Play
  // now opens a sticky panel at the bottom of this screen so the user
  // can keep reading while listening, instead of teleporting away.
  const [playerOpen, setPlayerOpen] = useState(false);
  const openPlayer = () => {
    if (starting) return;
    if (!script) {
      toast.error(t("attr.tapBegin"));
      return;
    }
    setStarting(true);
    setPlayerOpen(true);
    // Tiny timeout so the gold button gets a brief loader flicker on
    // first press — feels more responsive than instant.
    setTimeout(() => setStarting(false), 250);
  };

  const a = attraction;
  // "~12 min" badge — prefer the n8n-supplied duration estimate
  const estMins = guide?.estimated_duration_seconds
    ? Math.round(guide.estimated_duration_seconds / 60)
    : null;

  return (
    <MobileFrame
      // The audio player is rendered as a sibling of the scrolling
      // content (not inside it) so it floats above the TabBar at
      // every scroll position — Beka's request: "მცურავი და არ
      // სჭირდებოდეს ჩასქროლვა".
      floatingPanel={
        playerOpen ? (
          <InlineAudioPanel
            name={a?.name ?? fallbackName}
            script={fullScript || script}
            language={language}
            onClose={() => setPlayerOpen(false)}
          />
        ) : null
      }
    >
      <div className="relative min-h-full bg-background pb-10 text-foreground">
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

          <header className="relative z-10 flex items-start justify-between px-6 pt-safe">
            {/* Back button: prefer the city context (Bangkok / Tbilisi /
                ...) over the attraction name. Beka caught a chain of
                bugs that traced back to here:
                  1. Back used q={fallbackName} (e.g. "Khlong Lat
                     Mayom"), which sent the user to /results?q=Khlong...
                  2. /results then called /api/attractions with q="Khlong..."
                     as a "city" — Sonnet improvised attractions
                     "around Khlong Lat Mayom" instead of returning to
                     the user's actual Bangkok search.
                  3. ResultCard's Link copies cityContext=q forward as
                     `city` on the next attraction page. So clicking
                     a card on that misled results page produced
                     /attraction/<x>?name=...&city=Khlong+Lat+Mayom
                     — the previous attraction's name leaking into the
                     city slot of the next page. Photo lookups + cache
                     keys then broke everywhere downstream.
                Falling back to fallbackName is acceptable for a
                deep-linked attraction with no preserved city context. */}
            <Link
              to="/results"
              search={{ q: searchCity || fallbackName }}
              aria-label={t("nav.back")}
              className="grid h-10 w-10 place-items-center rounded-full border border-foreground/20 bg-background/30 backdrop-blur-md transition-smooth hover:bg-background/50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            {/* Save / Download / Play live in the ActionRow below the hero
                so the user has one consolidated place to act. */}
          </header>

          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-7 animate-float-up">
            {/* Category chip removed per Beka's feedback — the
                hero already carries the place name + meta row;
                showing "Museum" twice felt redundant. UNESCO badge
                stays because it's a globally recognised credential
                and worth the visual weight. */}
            {isUnescoSite(a?.name_en ?? a?.name ?? fallbackName, {
              city: typeof a?.city === "string" ? a.city : null,
              type: a?.type ?? a?.category ?? null,
              description: a?.outside_desc ?? a?.description ?? null,
            }) && (
              <div className="mb-1">
                <UnescoBadge variant="hero" />
              </div>
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
                  {/* Tap → Google Maps. Uses the search-with-query URL
                      so on mobile this hands off to the Maps app and the
                      user gets directions from their current location
                      automatically. `?api=1` is Google's documented
                      cross-platform deep-link format. */}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 underline-offset-4 hover:text-primary hover:underline"
                    aria-label={t("attr.openInGmapsAria", { name: a?.name ?? fallbackName })}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {a.lat.toFixed(3)}, {a.lng.toFixed(3)}
                  </a>
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
          onPlay={openPlayer}
        />

        {/* Interest picker — Beka's product call: bias the *guide* (not
            the discovery list) by user interest. Tap a chip → re-fetches
            the n8n /webhook/guide with that interest, and the script /
            chips come back tilted toward it. History default. */}
        <InterestPicker current={interest} onPick={setInterest} loading={loadingScript} />

        {/* About — outside-view short description (n8n: outside_desc).
            FIRST: at-a-glance factual summary.
            Wait for BOTH endpoints (attractions metadata + guide
            content) before swapping the skeleton, so About and Stops
            land together — Beka noticed the staggered fade-in and
            asked for them to share timing. */}
        <AboutSection
          loading={loading || loadingScript}
          aboutText={a?.outside_desc ?? a?.description ?? ""}
        />

        {/* The story — what a local would tell you (n8n: insider_desc).
            SECOND: longer, story-shaped intro before the audio guide
            content itself. */}
        <StorySection storyText={a?.insider_desc} />

        {/* The stops — the full narrated audio-guide content (n8n: script).
            THIRD: rendered as flowing prose, with no chapter cards or
            numbering — Beka's request was to keep the content but drop
            the divisions. */}
        <StopsSection script={script} loading={loading || loadingScript} />

        {/* Key facts — emerald chips */}
        <ChipsSection
          title={t("attr.keyFactsTitle")}
          emoji="💡"
          icon={<Lightbulb className="h-3 w-3" />}
          tone="emerald"
          items={guide?.key_facts}
        />

        {/* What to look for — sky chips */}
        <ChipsSection
          title={t("attr.whatToLook")}
          emoji="👀"
          icon={<Eye className="h-3 w-3" />}
          tone="sky"
          items={guide?.look_for}
        />

        {/* Tips — list with rotating icons */}
        <TipsSection items={guide?.tips} />

        {/* Nearby section retired per Beka's request — felt redundant
            next to the Map below it, and the LLM-suggested neighbours
            were often unevenly curated. The data is still in
            guide.nearby_suggestions if we want to bring it back later. */}

        {/* Must-see highlights — only renders when the attraction is
            one of the curated MUSEUMS. Self-paginates 10 per page,
            three pages max. Quiet skeleton while the first fetch is
            in flight; nothing shown when the attraction isn't a
            museum we know about. */}
        {matchedMuseum && (
          <MuseumHighlightsSection
            museum={matchedMuseum}
            highlights={highlights}
            loading={loadingHighlights}
            language={language}
          />
        )}

        {/* Map — kept as the LAST section before the floating audio
            player / TabBar, per Beka's spec ("ჩამოსქროლვისას მხოლოდ
            რუკა გადმოდის footer-ის წინ"). Removing Nearby above made
            this naturally land at the bottom. */}
        <MapSection lat={a?.lat} lng={a?.lng} name={a?.name ?? fallbackName} currentSlug={id} />

        {/* The audio player itself lives in MobileFrame's floatingPanel
            slot — see the prop on the wrapping <MobileFrame> above.
            That keeps it visible at any scroll position instead of
            buried at the end of the page. */}
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
  const t = useT();
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
      toast(t("toast.removedFromSaved"));
      return;
    }
    saveItem({
      id,
      name,
      language,
      savedAt: Date.now(),
      attraction: attraction ?? { name },
    });
    toast.success(t("attr.savedForOffline"), {
      description: t("attr.findInSaved"),
    });
  };

  const downloadOffline = async () => {
    if (cached) {
      toast.info(t("attr.alreadyDownloaded"), {
        description: t("toast.alreadyCachedDesc"),
      });
      return;
    }
    if (!online) {
      toast.error(t("toast.youreOffline"), {
        description: t("toast.youreOfflineDesc"),
      });
      return;
    }
    setDownloading(true);
    try {
      const script = await fetchGuideFresh(name, language, interest);
      if (script) {
        toast.success(t("toast.downloaded"), { description: name });
        setCached(true);
      } else {
        toast.error(t("toast.noGuide"));
      }
    } catch (err) {
      toast.error(t("toast.downloadFailed"), {
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
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
          aria-label={t("attr.beginJourney")}
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
              {t("attr.begin")}
            </span>
            <span className="block text-[13px] font-semibold leading-tight">
              {t("attr.listen")}
            </span>
          </span>
        </button>

        {/* Save — secondary outline. The label is allowed to wrap to
            two lines (whitespace-normal + leading-tight) and the font
            is smaller (10 → 9 px) so longer non-Latin localisations
            like "შენახულია" / "ჩამოტვირთვა" fit inside the 64-px
            fixed-width slot Beka caught overflowing on Georgian. */}
        <button
          onClick={toggleSave}
          aria-label={saved ? t("attr.removeFromSaved") : t("attr.saveForOffline")}
          aria-pressed={saved}
          className={`grid w-[64px] place-items-center rounded-2xl border px-1.5 py-2 transition-smooth ${
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
            <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] whitespace-normal break-words">
              {saved ? t("card.saved") : t("card.save")}
            </span>
          </span>
        </button>

        {/* Download — secondary outline (or filled when already cached).
            Same wrap-friendly text styling as Save above. */}
        <button
          onClick={downloadOffline}
          disabled={downloading}
          aria-label={cached ? t("attr.alreadyDownloaded") : t("card.download")}
          className={`grid w-[64px] place-items-center rounded-2xl border px-1.5 py-2 transition-smooth disabled:opacity-80 ${
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
            <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] whitespace-normal break-words">
              {downloading ? t("card.saving") : cached ? t("card.offline") : t("attr.get")}
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
          {t("attr.tilt")} <span className="italic text-primary">{t("attr.guide")}</span>
        </h2>
        {loading && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("attr.updating")}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        {t("filters.interests")}: {t("attr.pickFocus")}
      </p>
      <div
        className="-mx-6 mt-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="radiogroup"
        aria-label={t("filters.interests")}
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
  const t = useT();
  // Split into readable paragraphs. n8n sometimes returns a single
  // unbroken sentence-pile, sometimes proper paragraphs separated by
  // blank lines. Strategy:
  //   1. If the text already has blank-line breaks, use them.
  //   2. Otherwise, group every ~2 sentences into a paragraph so the
  //      block doesn't read like a wall.
  // Falls back to the original text if nothing splits.
  const paragraphs = useMemo(() => {
    const trimmed = aboutText.trim();
    if (!trimmed) return [];
    const byBlank = trimmed
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (byBlank.length > 1) return byBlank;
    // No blank lines — split on sentence boundaries (handles . ! ?
    // followed by a space + capital/Georgian letter, plus the
    // Armenian/CJK full stops just in case).
    const sentences = trimmed
      .split(/(?<=[.!?。！？])\s+(?=[A-ZА-ЯႠ-ჿ\u10D0-\u10FF])/u)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 2) return [trimmed];
    const out: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      out.push(sentences.slice(i, i + 2).join(" "));
    }
    return out;
  }, [aboutText]);

  // Keep the skeleton up while *either* endpoint is still in flight,
  // even if `aboutText` has already arrived from fetchAttractions.
  // Without this, About would pop in seconds before Stops because
  // the metadata call is faster than the guide call — Beka asked
  // for them to appear together.
  if (loading) {
    return (
      <section className="mt-8 px-6">
        <h2 className="font-display text-[20px] text-foreground">
          {t("attr.aboutWord")} <span className="italic text-primary">{t("attr.thisPlace")}</span>
        </h2>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/70" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
        </div>
      </section>
    );
  }
  if (paragraphs.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        {t("attr.aboutWord")} <span className="italic text-primary">{t("attr.thisPlace")}</span>
      </h2>
      <div className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-foreground/80">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

/**
 * The story — the local's-view longer narrative (n8n: insider_desc).
 * Renders as readable prose with a Sparkles glyph so it reads warmer
 * than the factual "About" block above. Hidden when n8n didn't ship one.
 */
function StorySection({ storyText }: { storyText?: string }) {
  const t = useT();
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
          {t("attr.theWord")} <span className="italic text-primary">{t("attr.story")}</span>
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
  const t = useT();
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

  // Tall skeleton while we wait for either endpoint — synchronizes
  // with AboutSection so they swap from skeleton to content together
  // (Beka's request — see the analogous comment in AboutSection).
  if (loading) {
    return (
      <section className="mt-8 px-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-display text-[20px] text-foreground">
            {t("attr.theWord")} <span className="italic text-primary">{t("attr.stopsWord")}</span>
          </h2>
        </div>
        {/* Rotating progress copy — gives the user something thoughtful
            to read while the LLM is generating the narrated guide
            (5-10s on a fresh fetch). Skipped on cache hits because
            this branch only runs while loading is true. */}
        <LoadingMessages className="mt-4" />
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
          {t("attr.theWord")} <span className="italic text-primary">{t("attr.stopsWord")}</span>
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

// Chip tone classes. The `text-*-200` colours read fine against the
// dark background, but on light theme they disappear into the
// matching tint background (Beka caught the Key Facts and What-to-
// look-for chips going invisible). `[.light_&]:text-*-800` swaps in
// a high-contrast deep variant whenever the `.light` class is on
// <html>; on dark theme the bracket selector simply doesn't apply.
const TONE_CLASSES: Record<string, string> = {
  emerald:
    "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 [.light_&]:text-emerald-800 [.light_&]:border-emerald-500/40",
  sky: "border-sky-400/30 bg-sky-500/10 text-sky-200 [.light_&]:text-sky-800 [.light_&]:border-sky-500/40",
  amber:
    "border-amber-400/30 bg-amber-500/10 text-amber-200 [.light_&]:text-amber-800 [.light_&]:border-amber-500/40",
};

function ChipsSection({
  title,
  emoji,
  icon,
  tone,
  items,
}: {
  title: string;
  // Section-header emoji prefix. Beka asked for warmth on the
  // facts/look-for/tips/nearby titles — emoji reads friendlier than
  // a stripped lucide glyph in the heading position.
  emoji?: string;
  icon: React.ReactNode;
  tone: "emerald" | "sky" | "amber";
  items?: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        {emoji && (
          <span className="mr-2" aria-hidden>
            {emoji}
          </span>
        )}
        {title}
      </h2>
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
  const t = useT();
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[20px] text-foreground">
          <span className="mr-2" aria-hidden>
            📍
          </span>
          <span className="italic text-primary">{t("attr.nearbyWord")}</span> {t("attr.places")}
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

/**
 * Map — pinned at the bottom of the page. Uses Leaflet with the same
 * dark CARTO basemap as the dedicated /map page so the visual sits in
 * the same family as the user's "Saved" map. The current attraction
 * is the primary gold pin; any saved place within ~5 km drops as a
 * secondary outlined pin (tap → navigate to that attraction). The
 * "Open in Google Maps" handoff below the canvas deep-links to the
 * Maps app for turn-by-turn directions from the user's location —
 * we deliberately don't ask for geolocation permission ourselves.
 *
 * Hidden when n8n didn't ship coords (older attractions or LLM dropout).
 */
function MapSection({
  lat,
  lng,
  name,
  currentSlug,
}: {
  lat?: number;
  lng?: number;
  name: string;
  currentSlug: string;
}) {
  const navigate = useNavigate();
  const saved = useSavedItems();
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const [ready, setReady] = useState(false);

  // Saved places within ~5 km of the current attraction (excluding
  // the place itself). 5 km matches "next-stop walking radius" for a
  // city wander — close enough that surfacing them as pins is useful,
  // far enough that we don't hide a saved place a metro stop away.
  const nearby = useMemo(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return [];
    return saved
      .filter((s) => s.id !== currentSlug)
      .filter((s) => typeof s.attraction.lat === "number" && typeof s.attraction.lng === "number")
      .map((s) => ({
        item: s,
        distanceKm: haversineKm(lat, lng, s.attraction.lat as number, s.attraction.lng as number),
      }))
      .filter((p) => p.distanceKm <= 5)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [saved, lat, lng, currentSlug]);

  // Initialise the Leaflet map once we have coords. Re-mounts if the
  // attraction's coords change (e.g. user navigates between places).
  useEffect(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
        // Embedded inside a scrolling page — disable wheel zoom so the
        // user doesn't accidentally zoom the map while scrolling past.
        scrollWheelZoom: false,
      });
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap · © CARTO",
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      const map = mapRef.current as { remove?: () => void } | null;
      map?.remove?.();
      mapRef.current = null;
      markersRef.current = [];
      setReady(false);
    };
  }, [lat, lng]);

  // Render markers (primary attraction + nearby saved places). Re-runs
  // when the saved-list mutates so freshly-saved places show up live.
  useEffect(() => {
    if (!ready) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      const map = mapRef.current as L.Map | null;
      if (!map) return;

      // Wipe any previous markers before re-rendering.
      markersRef.current.forEach((m) => (m as L.Marker).remove());
      markersRef.current = [];

      // Primary marker — bigger gold pin with a strong ping so the
      // user can spot "I'm here" at a glance.
      const primaryIcon = L.divIcon({
        className: "tg-pin-primary",
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute h-10 w-10 rounded-full bg-primary/40 animate-ping"></span>
            <span class="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow border-2 border-primary-foreground/40">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            </span>
          </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 36],
      });
      const primary = L.marker([lat, lng], {
        icon: primaryIcon,
        zIndexOffset: 500,
      }).addTo(map);
      primary.bindTooltip(name, {
        direction: "top",
        offset: [0, -30],
        className: "tg-tooltip",
      });
      markersRef.current.push(primary);

      // Secondary markers for nearby saved places — smaller, outlined,
      // tappable to dive straight into that attraction's guide. We
      // bind a popup (not a tooltip) so the first tap on mobile shows
      // the place's name + an explicit "Open guide" affordance — a
      // bound tooltip on touch can swallow the first tap, requiring
      // a second tap to fire the click handler.
      nearby.forEach(({ item, distanceKm }) => {
        const sLat = item.attraction.lat as number;
        const sLng = item.attraction.lng as number;
        const icon = L.divIcon({
          className: "tg-pin-saved",
          html: `
            <div class="relative flex items-center justify-center" style="cursor: pointer;">
              <span class="relative grid h-6 w-6 place-items-center rounded-full bg-card text-primary border border-primary/60 shadow-soft">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3a2 2 0 0 0-2 2v16l8-5 8 5V5a2 2 0 0 0-2-2H6z"/></svg>
              </span>
            </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 22],
        });
        const marker = L.marker([sLat, sLng], { icon, riseOnHover: true }).addTo(map);

        // Click anywhere on the pin → navigate immediately. This
        // covers desktop clicks and the mobile case where a tap
        // doesn't go through the popup's "Open" button.
        marker.on("click", () => {
          navigate({
            to: "/attraction/$id",
            params: { id: attractionSlug(item.name) },
            search: { name: item.name },
          });
        });

        // Popup gives a clearer "you're about to leave this page"
        // confirmation, especially for users who tap a pin to peek
        // at the name before committing.
        const safeName = item.name.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const distLabel =
          distanceKm < 1
            ? t("attr.metersAway", { n: Math.round(distanceKm * 1000) })
            : t("attr.kmAway", { n: distanceKm.toFixed(1) });
        marker.bindPopup(
          `<div style="font-family: inherit; min-width: 140px;">
            <div style="font-weight: 600; font-size: 13px; line-height: 1.3;">${safeName}</div>
            <div style="font-size: 10.5px; opacity: 0.65; margin-top: 2px;">${distLabel}</div>
            <a href="#" class="tg-popup-open" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 11px; font-weight: 700; text-decoration: none; color: inherit;">
              ${t("attr.openGuide")} <span style="font-size: 13px; line-height: 1;">→</span>
            </a>
          </div>`,
          { closeButton: false, offset: [0, -10] },
        );
        marker.on("popupopen", (e) => {
          const link = (e.popup.getElement() as HTMLElement | null)?.querySelector(
            ".tg-popup-open",
          );
          link?.addEventListener("click", (ev) => {
            ev.preventDefault();
            navigate({
              to: "/attraction/$id",
              params: { id: attractionSlug(item.name) },
              search: { name: item.name },
            });
          });
        });
        markersRef.current.push(marker);
      });

      // Frame the view: if there are nearby pins, fit them all; else
      // just centre on the primary at a comfortable street zoom.
      if (nearby.length > 0) {
        const bounds = L.latLngBounds([
          [lat, lng] as [number, number],
          ...nearby.map(
            (n) =>
              [n.item.attraction.lat as number, n.item.attraction.lng as number] as [
                number,
                number,
              ],
          ),
        ]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else {
        map.setView([lat, lng], 15, { animate: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, lat, lng, name, nearby, navigate, t]);

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const gmapsHref = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const nearbyHint =
    nearby.length > 0
      ? nearby.length === 1
        ? t("attr.savedNearbyOne", { n: nearby.length })
        : t("attr.savedNearbyMany", { n: nearby.length })
      : t("attr.tapDirections");

  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        <span className="mr-2" aria-hidden>
          🗺️
        </span>
        {t("attr.onTheMap")} <span className="italic text-primary">{t("attr.mapWord")}</span>
      </h2>
      {/* `isolate` traps Leaflet's high internal z-indexes (panes
          200-700, controls 800) inside this wrapper's stacking
          context. Without it the marker / control layers can paint
          over the TabBar (z-40) when the user scrolls the map close
          to the bottom of the viewport — exactly what Beka caught. */}
      <div className="mt-4 isolate overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div
          ref={containerRef}
          aria-label={t("attr.mapOf", { name })}
          className="h-[260px] w-full bg-secondary"
        />
        <a
          href={gmapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-foreground transition-smooth hover:bg-secondary"
        >
          <span className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
              <Compass className="h-3.5 w-3.5" />
            </span>
            <span className="text-[12.5px] font-semibold leading-tight">
              {t("attr.openInGmaps")}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{nearbyHint}</p>
    </section>
  );
}

/**
 * Great-circle distance between two lat/lng points in kilometres.
 * Plain Haversine — accurate enough for "is this saved place nearby?"
 * radius checks; we never need sub-metre precision here.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const TIP_ICONS = [Clock, Camera, Coffee, Shirt, Timer];

function TipsSection({ items }: { items?: string[] }) {
  const t = useT();
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        <span className="mr-2" aria-hidden>
          🎒
        </span>
        {t("attr.practical")} <span className="italic text-primary">{t("attr.tips")}</span>
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

/**
 * MuseumHighlightsSection — paginated "must-see" list for one museum.
 *
 * Beka's spec: top 30 highlights paginated 10 per page (1-2-3),
 * matching the /results page pagination UX. Each item shows the
 * artwork's name, era, brief summary, vivid story, and gallery hint.
 * Cache hits land in 50-100 ms; first-fetch on a fresh (museum,
 * lang) tuple takes 30-60 s — gated by the loading skeleton.
 */
function MuseumHighlightsSection({
  museum,
  highlights,
  loading,
  language,
}: {
  /** The matched museum — used to scope the per-highlight photo lookup
   *  so "Mona Lisa" doesn't resolve to a hair salon and "Liberty
   *  Leading the People" doesn't resolve to a Tbilisi bank. */
  museum: Museum;
  highlights: MuseumHighlight[] | null;
  loading: boolean;
  /** User's language — passed down to the per-card mini player so its
   *  TTS request lands in the right voice. */
  language: string;
}) {
  const t = useT();
  const [page, setPage] = useState(1);
  // Ref on the section header so changePage() can scroll the
  // highlights heading back into view when the user taps 1-2-3.
  // Without this the user lands on the bottom of page N+1's last
  // card and has to thumb back up to see the new top of the list.
  const sectionRef = useRef<HTMLElement | null>(null);
  const PAGE_SIZE = 10;
  const MAX_PAGES = 3;
  const total = Math.min(highlights?.length ?? 0, PAGE_SIZE * MAX_PAGES);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const slice = useMemo(() => {
    if (!highlights) return [];
    const start = (safePage - 1) * PAGE_SIZE;
    return highlights.slice(0, total).slice(start, start + PAGE_SIZE);
  }, [highlights, safePage, total]);

  const changePage = (p: number) => {
    setPage(p);
    // Defer one frame so the new slice has time to render before
    // we scroll — otherwise the browser scrolls to the position
    // computed against the OLD content and lands slightly off.
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Loading skeleton — three placeholder rows so the section's
  // footprint is roughly correct when content lands and the rest of
  // the page doesn't jump.
  if (loading) {
    return (
      <section className="mt-8 px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-[20px] text-foreground">{t("highlights.title")}</h2>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">{t("highlights.subtitle")}</p>
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[120px] animate-pulse rounded-2xl border border-border/60 bg-card"
            />
          ))}
        </div>
        <LoadingMessages className="mt-4" />
      </section>
    );
  }

  if (!highlights || highlights.length === 0) {
    return (
      <section className="mt-8 px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-[20px] text-foreground">{t("highlights.title")}</h2>
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">{t("highlights.empty")}</p>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="mt-8 px-6 scroll-mt-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-[20px] text-foreground">{t("highlights.title")}</h2>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{t("highlights.subtitle")}</p>

      <ol className="mt-4 flex flex-col gap-3" start={(safePage - 1) * PAGE_SIZE + 1}>
        {slice.map((h, i) => {
          const rank = (safePage - 1) * PAGE_SIZE + i + 1;
          return (
            <HighlightCard
              key={`${h.name_en ?? h.name}-${rank}`}
              h={h}
              rank={rank}
              museum={museum}
              language={language}
            />
          );
        })}
      </ol>

      {pageCount > 1 && (
        <nav
          aria-label="Highlights pagination"
          className="mt-5 flex items-center justify-center gap-2"
        >
          <button
            type="button"
            onClick={() => changePage(safePage - 1)}
            disabled={safePage <= 1}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
            const active = p === safePage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => changePage(p)}
                className={`h-9 min-w-[36px] rounded-full border px-3 text-[12px] font-bold transition-smooth ${
                  active
                    ? "border-primary/60 bg-gradient-gold text-primary-foreground shadow-glow"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => changePage(safePage + 1)}
            disabled={safePage >= pageCount}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </section>
  );
}

/**
 * HighlightCard — single museum-highlight row with a Wikipedia-sourced
 * thumbnail. The photo is fetched lazily per card so the section
 * renders text-first; the image fades in once Wikipedia returns.
 *
 * fetchPlacePhoto already memoizes per (name, lang, city) in an
 * in-memory map, so re-renders within the same session don't re-hit
 * the network. Cross-session caching happens at the route level
 * (the highlights payload itself caches in Supabase).
 */
function HighlightCard({
  h,
  rank,
  museum,
  language,
}: {
  h: MuseumHighlight;
  rank: number;
  museum: Museum;
  language: string;
}) {
  const t = useT();
  const [photo, setPhoto] = useState<string | null>(null);

  // Per-card audio state — Beka asked for individual narrate buttons
  // on each highlight card, separate from the page-level Begin/Listen
  // button. TTS narrates `brief + story` (~50-100 words) so each clip
  // is a tight 15-30 s read. Audio blob is generated on first Play
  // press and held in component state for replay.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const ttsText = [h.brief, h.story].filter((s) => s && s.trim().length > 0).join(" ");

  const ensureAudio = async (): Promise<string | null> => {
    if (audioUrl) return audioUrl;
    if (!ttsText) return null;
    setGenerating(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: ttsText, language }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob.size < 200 || !blob.type.toLowerCase().includes("audio")) {
        throw new Error("Invalid audio response");
      }
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      return url;
    } catch {
      return null;
    } finally {
      setGenerating(false);
    }
  };
  const handlePlay = async () => {
    if (!audioUrl) {
      // Fetch + autoPlay via the <audio> mount below.
      await ensureAudio();
      return;
    }
    const a = audioRef.current;
    if (a && a.paused) a.play().catch(() => {});
  };
  const handlePause = () => {
    const a = audioRef.current;
    if (a && !a.paused) a.pause();
  };
  const handleStop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPlaying(false);
    setPaused(false);
  };
  // Cleanup blob URL on unmount.
  useEffect(() => {
    const a = audioRef.current;
    return () => {
      if (a) {
        a.pause();
        a.src = "";
      }
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);
  const queryName = h.name_en ?? h.name;
  useEffect(() => {
    if (!queryName) return;
    let cancelled = false;
    // Search candidate order matters. wikipediaPhoto on the server
    // tries (1) direct page summary by exact title (2) intitle:
    // phrase search (3) full-text search — in that order. Stage 1
    // and 2 only hit a clean artwork page when the query IS the
    // artwork name.
    //
    // Strip any parenthetical disambiguator the curator added —
    // "The Cloisters (entire building and collection)" → "The Cloisters"
    // — so the direct page lookup gets a clean shot.
    //
    // Then try a sequence that forces artwork-style disambiguation:
    //   1. bare base name                     — direct page hit
    //   2. base + "painting" / "sculpture"    — disambiguates from
    //      films, songs, books with the same title (Beka's Lacemaker
    //      came back as Isabelle Huppert's 1977 movie because the
    //      bare title page redirects to the film)
    //   3. base + museum                      — for ambiguous items
    //   4. base + museum + city               — last resort
    const baseName = queryName.replace(/\s*\([^)]*\)\s*$/g, "").trim() || queryName;
    // Crude but effective bucket guess. If we knew the medium for
    // each highlight we'd use it; we don't, so include the most
    // common artwork media as separate candidates.
    (async () => {
      // Museum-qualified queries FIRST — Beka kept catching
      // ambiguous artwork names landing on the wrong subject
      // (Lacemaker → Isabelle Huppert film, Wedding Feast at
      // Cana → some other building). Wikipedia's full-text search
      // ranks the Met / Louvre canonical article above the
      // disambiguator when the museum name is in the query.
      const candidates = [
        `${baseName} ${museum.name}`,
        `${baseName} ${museum.name} ${museum.city}`,
        `${baseName} painting`,
        `${baseName} sculpture`,
        `${baseName} artwork`,
        baseName,
      ];
      for (const q of candidates) {
        if (cancelled) return;
        // scope="artwork" tells /api/photo to skip Google Places
        // entirely and go straight to Wikipedia. Google Places kept
        // returning Tbilisi-area matches (Liberty Bank, a residential
        // street called "The Lacemaker") because the project's API
        // key carries a Tbilisi regional bias that overrides the
        // city= param we send. Artworks aren't places — Wikipedia
        // is the right source.
        // Pass the museum name through so /api/photo can try the
        // museum's own collection API first (currently the Met) and
        // only fall back to Wikipedia / Google when the museum
        // doesn't have a usable public API.
        const url = await fetchPlacePhoto(q, "en", museum.city, "artwork", museum.name);
        if (cancelled) return;
        if (url) {
          setPhoto(url);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryName, museum.name, museum.city]);

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/40">
      {photo && (
        <div className="relative h-[160px] w-full overflow-hidden bg-secondary">
          <img
            src={photo}
            alt={h.name}
            loading="lazy"
            onError={() => setPhoto(null)}
            className="h-full w-full object-cover"
          />
          {/* Rank pill on top of image */}
          <div className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/60 bg-background/70 text-[11px] font-bold text-primary backdrop-blur-md">
            {rank}
          </div>
        </div>
      )}
      <div className="p-4">
        {/* When there's no photo yet, show the rank inline next to title */}
        {!photo && (
          <div className="mb-3 flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-bold text-primary">
              {rank}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[16px] font-medium leading-tight text-foreground">
                {h.name}
              </h3>
              {h.era && (
                <p className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-primary/80">
                  {h.era}
                </p>
              )}
            </div>
          </div>
        )}
        {photo && (
          <div className="mb-2">
            <h3 className="font-display text-[16px] font-medium leading-tight text-foreground">
              {h.name}
            </h3>
            {h.era && (
              <p className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-primary/80">
                {h.era}
              </p>
            )}
          </div>
        )}
        {h.brief && <p className="mt-2 text-[13px] leading-[1.55] text-foreground/85">{h.brief}</p>}
        {h.story && (
          <p className="mt-2 text-[12.5px] leading-[1.65] text-muted-foreground">{h.story}</p>
        )}
        {h.location_hint && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/30 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5" /> {h.location_hint}
          </p>
        )}

        {/* Per-card mini player — narrate just this highlight's
            brief + story. Beka's spec: tight Play / Pause / Stop
            buttons inside the card, separate from the page-level
            Begin/Listen which narrates the full guide. */}
        {ttsText && (
          <div className="mt-3 flex items-center gap-1.5">
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"
                autoPlay
                onPlay={() => {
                  setPlaying(true);
                  setPaused(false);
                }}
                onPause={() => {
                  const a = audioRef.current;
                  if (a && a.currentTime >= a.duration - 0.05) return;
                  setPaused(true);
                }}
                onEnded={() => {
                  setPlaying(false);
                  setPaused(false);
                }}
                style={{ display: "none" }}
              />
            )}
            <button
              type="button"
              onClick={handlePlay}
              disabled={generating || (playing && !paused)}
              aria-label={t("player.resume")}
              className="grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-soft transition-smooth hover:scale-[1.04] disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3 translate-x-[0.5px] fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={handlePause}
              disabled={!playing || paused}
              aria-label={t("player.pause")}
              className="grid h-7 w-7 place-items-center rounded-full border border-primary/40 bg-card text-foreground transition-smooth hover:border-primary/70 disabled:opacity-50"
            >
              <Pause className="h-3 w-3 fill-current" />
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={!audioUrl}
              aria-label={t("player.stop")}
              className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
