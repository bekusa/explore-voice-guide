import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Clock,
  Loader2,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Star,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingMessages } from "@/components/LoadingMessages";
import { MobileFrame } from "@/components/MobileFrame";
import { ATTRACTIONS_BY_ID, TIME_MACHINE_ROLES } from "@/lib/timeMachineData";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useT, useTranslated } from "@/hooks/useT";

/**
 * /time-machine/$id/$role — the rich result page for one Time Machine
 * simulation. Mirrors the visual structure of /attraction/$id (hero
 * image + title + meta chips + action row + stacked content sections)
 * so the user gets a consistent reading experience whether they're
 * browsing a real present-day attraction or stepping into a historical
 * moment.
 *
 * Beka's spec: "Time machine -ის მიერ გამოტანილი ფეიჯი უნდა იყოს იგივე
 * ფორმატის რაც Attraction შედეგად გამოდის" — same format as the
 * attraction result page.
 *
 * Replaces the previous in-page overlay (a plain `whitespace-pre-wrap`
 * block) with a proper page that has a URL, browser back, and shares
 * the cinematic chrome of the rest of the app.
 */
type SimulationPayload = {
  title?: string;
  intro?: string;
  body?: string;
  epilogue?: string;
  estimated_duration_seconds?: number;
};

const ROLE_LABELS: Record<string, string> = {
  merchant: "Merchant",
  soldier: "Soldier",
  servant: "Servant",
  foreigner: "Foreigner",
  child: "Child",
  healer: "Healer",
  spy: "Spy",
  survivor: "Survivor",
};

export const Route = createFileRoute("/time-machine_/$id/$role")({
  head: ({ params }) => {
    const moment = ATTRACTIONS_BY_ID.get(params.id);
    const title = moment ? `${moment.name} — Time Machine` : "Time Machine";
    return {
      meta: [
        { title: `${title} — Lokali` },
        {
          name: "description",
          content: moment
            ? `Step into ${moment.name} (${moment.year}) as a ${ROLE_LABELS[params.role] ?? params.role}.`
            : "Time Machine simulation.",
        },
      ],
    };
  },
  component: TimeMachineSimulationPage,
});

function TimeMachineSimulationPage() {
  const { id, role } = Route.useParams();
  const lang = usePreferredLanguage();
  const t = useT();

  const moment = ATTRACTIONS_BY_ID.get(id);
  const validRole = (TIME_MACHINE_ROLES as readonly string[]).includes(role);

  const [data, setData] = useState<SimulationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Save state — keyed locally per (id, role) so the user can star
  // their favourite simulations without coupling to the existing
  // savedStore (which is shaped around real attractions and would
  // need its own schema variant for moments).
  const SAVED_KEY = "tm_saved";
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      setSaved(list.includes(`${id}::${role}`));
    } catch {
      /* noop */
    }
  }, [id, role]);
  const toggleSave = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const key = `${id}::${role}`;
      const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next.includes(key));
    } catch {
      /* noop */
    }
  };

  // Fetch the simulation. POSTs to /api/time-machine which will hit
  // cache first; cold path falls through to Anthropic + cache write.
  useEffect(() => {
    if (!moment || !validRole) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/time-machine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attractionId: id, role, language: lang }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as
          | (SimulationPayload & { error?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !json || !json.body || json.error) {
          setError(json?.error ?? `Request failed (${res.status})`);
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, role, lang, moment, validRole, reloadTick]);

  // Translate the moment's static fields (year, era, country) so the
  // hero meta row stays in the user's chosen language. The simulation
  // itself is already translated server-side by translateTimeMachinePayload.
  const [tName, tYear, tEra, tCountry] = useTranslated(
    moment ? [moment.name, moment.year, moment.era, moment.country] : ["", "", "", ""],
  );

  if (!moment) {
    return (
      <MobileFrame>
        <NotFoundState message={`Unknown moment: ${id}`} />
      </MobileFrame>
    );
  }
  if (!validRole) {
    return (
      <MobileFrame>
        <NotFoundState message={`Unknown role: ${role}`} />
      </MobileFrame>
    );
  }

  const heroTitle = data?.title?.trim() || tName || moment.name;

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-10 text-foreground">
        {/* ─── Hero ─── */}
        <section className="relative h-[420px] w-full overflow-hidden">
          <img
            src={moment.image}
            alt={heroTitle}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-hero" />

          <header className="relative z-10 flex items-start justify-between px-6 pt-12">
            <Link
              to="/time-machine"
              search={{ id }}
              aria-label={t("nav.back")}
              className="grid h-10 w-10 place-items-center rounded-full border border-foreground/20 bg-background/30 backdrop-blur-md transition-smooth hover:bg-background/50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </header>

          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-7 animate-float-up">
            {/* Tier eyebrow — same visual idiom as the UNESCO badge on
                the attraction page, lets the hero feel "credentialled". */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
              <Sparkles className="h-3 w-3" /> {t("tm.brand")} · {moment.tier}
            </span>
            <h1 className="mt-4 font-display text-[2.25rem] font-medium leading-[1.05] text-foreground">
              {heroTitle}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-foreground/75">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> {tYear || moment.year}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> {tCountry || moment.country}
              </span>
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Star className="h-3 w-3 fill-primary" /> {(moment.score / 10).toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background/30 px-2 py-0.5 backdrop-blur-md">
                <User className="h-3 w-3" /> {ROLE_LABELS[role] ?? role}
              </span>
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-foreground/55">
              {tEra || moment.era}
            </p>
          </div>
        </section>

        {/* ─── Action Row ─── */}
        <ActionRow
          script={data?.body ?? ""}
          name={heroTitle}
          language={lang}
          loading={loading}
          saved={saved}
          onSave={toggleSave}
          onRegenerate={() => setReloadTick((n) => n + 1)}
        />

        {/* ─── Body ─── */}
        {error && (
          <section className="mt-8 px-6">
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-[13px] text-destructive">
              {error}
            </div>
            <button
              onClick={() => setReloadTick((n) => n + 1)}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground transition-smooth hover:border-primary/50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </section>
        )}

        {/* About — the third-person scene-setter (intro). */}
        <AboutSection text={data?.intro} loading={loading} />

        {/* Story — the long first-person body. Mirrors the
            insider-voice "Story" section on the attraction page so the
            two surfaces feel like siblings. */}
        <StorySection text={data?.body} loading={loading} />

        {/* Epilogue — short reflective tie-back to the present. */}
        <EpilogueSection text={data?.epilogue} loading={loading} />

        {/* Source-of-truth panel — Beka's hand-written `situation`
            seed. Useful context for the reader: the simulation is
            built outward from this fact. Always shown (no LLM call
            needed). */}
        <SituationSection situation={moment.situation} desc={moment.desc} />
      </div>
    </MobileFrame>
  );
}

/* ─── Action row — Play (TTS) + Save + Regenerate ─── */

function ActionRow({
  script,
  name,
  language,
  loading,
  saved,
  onSave,
  onRegenerate,
}: {
  script: string;
  name: string;
  language: string;
  loading: boolean;
  saved: boolean;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  // Cleanup blob URL on unmount.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Drop the cached audio whenever the script changes (regenerate).
  useEffect(() => {
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPlaying(false);
    setPaused(false);
  }, [script]);

  const ensureAudio = async (): Promise<string | null> => {
    if (audioUrl) return audioUrl;
    if (!script) return null;
    setGenerating(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, language }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`);
      }
      const blob = await res.blob();
      if (blob.size < 500 || !blob.type.toLowerCase().includes("audio")) {
        throw new Error("Invalid audio response");
      }
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      return url;
    } catch (err) {
      toast.error(t("toast.couldNotLoadGuide"), {
        description: err instanceof Error ? err.message : t("toast.tryAgainPlease"),
      });
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const onPlay = async () => {
    const a = audioRef.current;
    // Resume from pause first — no need to refetch the blob.
    if (paused && a) {
      void a.play().catch(() => {
        /* noop */
      });
      setPaused(false);
      setPlaying(true);
      return;
    }
    const url = await ensureAudio();
    if (!url) return;
    // Wait a tick for the <audio> element to mount with the new src.
    requestAnimationFrame(() => {
      const el = audioRef.current;
      if (!el) return;
      void el.play().then(
        () => {
          setPlaying(true);
          setPaused(false);
        },
        () => {
          /* autoplay blocked; user can press play on the controls */
        },
      );
    });
  };

  const onPause = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setPaused(true);
    setPlaying(false);
  };

  const onStop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPaused(false);
    setPlaying(false);
  };

  const disabled = loading || !script;

  return (
    <section className="px-6 -mt-2 relative z-20">
      <div className="flex items-stretch gap-2.5">
        {/* Play / Pause primary toggle */}
        {playing ? (
          <button
            onClick={onPause}
            aria-label={t("attr.beginJourney")}
            className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-gold px-5 py-3.5 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15">
              <Pause className="h-4 w-4 fill-current" />
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
        ) : (
          <button
            onClick={onPlay}
            disabled={disabled || generating}
            aria-label={t("attr.beginJourney")}
            className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-gold px-5 py-3.5 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-70"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15">
              {generating ? (
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
        )}

        {/* Stop — visible only when audio active */}
        {(playing || paused) && (
          <button
            onClick={onStop}
            aria-label="Stop"
            className="grid w-[64px] place-items-center rounded-2xl border border-border/70 bg-card text-foreground transition-smooth hover:border-primary/40"
          >
            <span className="flex flex-col items-center gap-1">
              <Square className="h-4 w-4 fill-current" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Stop</span>
            </span>
          </button>
        )}

        {/* Save */}
        <button
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? t("attr.removeFromSaved") : t("attr.saveForOffline")}
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
              {saved ? t("card.saved") : t("card.save")}
            </span>
          </span>
        </button>

        {/* Regenerate — re-runs the LLM (same cache key, so it's
            actually a re-fetch; only useful if the cache row was
            cleared or when development cycling). Beka asked for the
            user to have an explicit way to refresh. */}
        <button
          onClick={onRegenerate}
          disabled={loading}
          aria-label="Regenerate"
          className="grid w-[64px] place-items-center rounded-2xl border border-border/70 bg-card text-foreground transition-smooth hover:border-primary/40 disabled:opacity-60"
        >
          <span className="flex flex-col items-center gap-1">
            <RotateCcw className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Refresh</span>
          </span>
        </button>
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => {
            setPlaying(false);
            setPaused(false);
          }}
          className="hidden"
        />
      )}
    </section>
  );
}

/* ─── Content sections (mirror /attraction/$id idioms) ─── */

function AboutSection({ text, loading }: { text?: string; loading: boolean }) {
  const t = useT();
  if (loading) {
    return (
      <section className="mt-8 px-6">
        <h2 className="font-display text-[20px] text-foreground">
          {t("attr.aboutWord")} <span className="italic text-primary">{t("attr.thisPlace")}</span>
        </h2>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
        </div>
      </section>
    );
  }
  if (!text || !text.trim()) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        {t("attr.aboutWord")} <span className="italic text-primary">{t("attr.thisPlace")}</span>
      </h2>
      <p className="mt-4 text-[13.5px] leading-relaxed text-foreground/80">{text.trim()}</p>
    </section>
  );
}

function StorySection({ text, loading }: { text?: string; loading: boolean }) {
  const t = useT();
  const paragraphs = useMemo(
    () =>
      (text ?? "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    [text],
  );

  if (loading) {
    return (
      <section className="mt-8 px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-[20px] text-foreground">
            {t("attr.theWord")} <span className="italic text-primary">{t("attr.story")}</span>
          </h2>
        </div>
        {/* Tall skeleton so the loading state has the same vertical
            weight as the rendered narrative (avoids the layout jump
            that Beka caught on the attraction page). */}
        <LoadingMessages />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/70" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-secondary/60" />
        </div>
      </section>
    );
  }
  if (paragraphs.length === 0) return null;
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

function EpilogueSection({ text, loading }: { text?: string; loading: boolean }) {
  if (loading) return null;
  if (!text || !text.trim()) return null;
  return (
    <section className="mt-8 px-6">
      <div className="rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-[13px] italic leading-relaxed text-foreground/80">
        {text.trim()}
      </div>
    </section>
  );
}

function SituationSection({ situation, desc }: { situation: string; desc: string }) {
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[16px] text-foreground/70">
        Scene <span className="italic text-primary">setup</span>
      </h2>
      <p className="mt-3 text-[12.5px] italic leading-[1.55] text-foreground/65">{situation}</p>
      <p className="mt-2 text-[11.5px] leading-[1.55] text-muted-foreground">{desc}</p>
    </section>
  );
}

function NotFoundState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[14px] text-muted-foreground">{message}</p>
      <Link
        to="/time-machine"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground transition-smooth hover:border-primary/50"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Time Machine
      </Link>
    </div>
  );
}
