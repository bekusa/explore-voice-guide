import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Play, Pause, BookmarkPlus, BookmarkCheck, Gauge } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getAttraction, type Attraction } from "@/lib/mockApi";
import { isTTSAvailable, speak, type SpeakHandle } from "@/lib/tts";
import { isSaved, saveGuide, removeGuide } from "@/lib/library";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.25, 1.5];

export const Route = createFileRoute("/player/$id")({
  loader: async ({ params }) => {
    const attr = await getAttraction(params.id);
    if (!attr) throw notFound();
    return attr;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `Now playing: ${loaderData.name}` }] : [],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 rounded-full bg-primary px-6 py-2 text-sm text-primary-foreground">Retry</button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  ),
  component: PlayerPage,
});

function PlayerPage() {
  const attr = Route.useLoaderData() as Attraction;
  const { t, meta } = useT();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activePara, setActivePara] = useState(0);
  const [saved, setSaved] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);
  const ttsAvailable = isTTSAvailable();

  useEffect(() => {
    setSaved(isSaved(attr.id));
    return () => handleRef.current?.stop();
  }, [attr.id]);

  const playFrom = (idx: number) => {
    const para = attr.scriptParagraphs[idx];
    if (!para) {
      setPlaying(false);
      return;
    }
    setActivePara(idx);
    handleRef.current = speak(para, {
      lang: meta.bcp47,
      rate: speed,
      onEnd: () => playFrom(idx + 1),
    });
  };

  const togglePlay = () => {
    if (!ttsAvailable) return;
    if (playing) {
      handleRef.current?.stop();
      setPlaying(false);
    } else {
      setPlaying(true);
      playFrom(activePara);
    }
  };

  const toggleSave = () => {
    if (saved) {
      removeGuide(attr.id);
      setSaved(false);
    } else {
      saveGuide({ id: attr.id, name: attr.name, city: attr.city, image: attr.image, durationMin: attr.durationMin });
      setSaved(true);
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      {/* Hero image */}
      <div className="relative h-72 overflow-hidden">
        <img src={attr.image} alt={attr.name} width={1024} height={1024} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative z-10 flex items-center justify-between px-5 pt-safe">
          <Link
            to="/attraction/$id"
            params={{ id: attr.id }}
            className="mt-3 grid h-10 w-10 place-items-center rounded-full bg-card/90 text-foreground shadow-soft backdrop-blur"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <button
            onClick={toggleSave}
            className="mt-3 grid h-10 w-10 place-items-center rounded-full bg-card/90 text-foreground shadow-soft backdrop-blur"
            aria-label={saved ? t("removeOffline") : t("saveOffline")}
          >
            {saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <BookmarkPlus className="h-4 w-4" />}
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 text-card">
          <p className="text-xs uppercase tracking-wider text-card/80">{t("playing")} · {meta.flag}</p>
          <h1 className="mt-1 font-display text-3xl leading-tight">{attr.name}</h1>
        </div>
      </div>

      {/* Script */}
      <article className="space-y-5 px-5 pb-44 pt-6">
        {!ttsAvailable && (
          <div className="rounded-2xl bg-secondary p-3 text-xs text-secondary-foreground">{t("errorTTS")}</div>
        )}
        {attr.scriptParagraphs.map((p, i) => (
          <p
            key={i}
            onClick={() => playFrom(i)}
            className={cn(
              "cursor-pointer text-[15px] leading-relaxed transition-colors",
              i === activePara && playing
                ? "rounded-2xl bg-secondary p-3 text-foreground"
                : i < activePara
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {p}
          </p>
        ))}
      </article>

      {/* Player controls */}
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur pb-safe">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <div className="flex rounded-full bg-muted p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    speed === s ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={toggleSave}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              saved ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
            {saved ? t("saved") : t("saveOffline")}
          </button>
        </div>

        {/* Progress */}
        <div className="mb-3 flex items-center gap-1">
          {attr.scriptParagraphs.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < activePara ? "bg-primary" : i === activePara && playing ? "bg-primary/60" : "bg-muted",
              )}
            />
          ))}
        </div>

        <button
          onClick={togglePlay}
          disabled={!ttsAvailable}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
          {playing ? t("pause") : t("play")}
        </button>
      </div>
    </div>
  );
}
