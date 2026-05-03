import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Pause,
  Play,
  Square,
  Loader2,
  Headphones,
  WifiOff,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { fetchGuide } from "@/lib/api";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useSpeechVoices, voicesForLanguage } from "@/hooks/useSpeechVoices";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES } from "@/lib/languages";
import { getCachedGuide } from "@/lib/guideCache";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useT } from "@/hooks/useT";

type Search = { name: string };

export const Route = createFileRoute("/player")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    name: typeof search.name === "string" ? search.name : "",
  }),
  head: () => ({
    meta: [
      { title: "Audio guide — Voices of Old Tbilisi" },
      { name: "description", content: "Listen to a cinematic narrated audio guide." },
    ],
  }),
  component: PlayerPage,
});

function PlayerPage() {
  const { name } = Route.useSearch();
  const language = usePreferredLanguage();
  const voices = useSpeechVoices();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const t = useT();

  const [script, setScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preferredVoiceURI, setPreferredVoiceURI] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const langTag = useMemo(() => {
    const match = LANGUAGES.find((l) => l.code.split("-")[0].toLowerCase() === language);
    return match?.code ?? language;
  }, [language]);

  // Load user's preferred voice URI
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("preferred_voice")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.preferred_voice) setPreferredVoiceURI(data.preferred_voice);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fetch the narrated script — cache first, then network. If offline AND no
  // cache, surface a clear "go online" hint instead of a generic error.
  useEffect(() => {
    if (!name) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setScript(null);
    setFromCache(false);

    const cached = getCachedGuide(name, language);
    if (cached) {
      setScript(cached);
      setFromCache(true);
      setLoading(false);
      // If we're online, refresh in background so cache stays fresh
      if (online) {
        fetchGuide(name, language).catch(() => {});
      }
      return;
    }

    if (!online) {
      setScript("");
      setLoading(false);
      toast.error(t("toast.youreOffline"), {
        description: t("toast.guideOfflineDesc"),
      });
      return;
    }

    fetchGuide(name, language)
      .then((text) => {
        if (cancelled) return;
        setScript(text);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(t("toast.couldNotLoadGuide"), {
          description: err instanceof Error ? err.message : t("toast.tryAgainPlease"),
        });
        setScript("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, language, online]);

  // Stop speech on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = () => {
    if (!script || typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error(t("toast.speechUnsupported"));
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(script);
    u.lang = langTag;
    const langVoices = voicesForLanguage(voices, langTag);
    const chosen =
      (preferredVoiceURI && voices.find((v) => v.voiceURI === preferredVoiceURI)) ||
      langVoices[0] ||
      voices[0];
    if (chosen) u.voice = chosen;
    u.onend = () => {
      setPlaying(false);
      setPaused(false);
    };
    u.onerror = () => {
      setPlaying(false);
      setPaused(false);
    };
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
    setPlaying(true);
    setPaused(false);
  };

  const togglePause = () => {
    if (typeof window === "undefined") return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const stop = () => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
  };

  return (
    <MobileFrame hideTabBar>
      <div className="relative min-h-full bg-background text-foreground">
        {/* Backdrop glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-gradient-card opacity-80" />

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between px-6 pt-12">
          <Link
            to="/attraction/$id"
            params={{ id: encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-")) }}
            search={{ name }}
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {t("player.nowNarrating")}
          </span>
          <span className="h-10 w-10" />
        </header>

        {/* Album art / title */}
        <section className="relative z-10 px-6 pt-8">
          <div className="mx-auto grid h-44 w-44 place-items-center rounded-3xl bg-gradient-gold shadow-glow">
            <Headphones className="h-12 w-12 text-primary-foreground" />
          </div>
          <h1 className="mt-7 text-center font-display text-[26px] font-medium leading-tight text-foreground">
            {name || t("player.audioGuide")}
          </h1>
          <p className="mt-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {LANGUAGES.find((l) => l.code === langTag)?.name ?? langTag}
          </p>
          {(fromCache || !online) && (
            <div className="mt-3 flex justify-center">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-md ${
                  online
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-accent/40 bg-accent/15 text-accent"
                }`}
              >
                {online ? (
                  <>
                    <Download className="h-2.5 w-2.5" /> {t("player.cachedOffline")}
                  </>
                ) : (
                  <>
                    <WifiOff className="h-2.5 w-2.5" /> {t("player.offlineMode")}
                  </>
                )}
              </span>
            </div>
          )}
        </section>

        {/* Wave indicator */}
        {playing && !paused && (
          <div className="mt-6 flex justify-center gap-[3px]">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span
                key={i}
                className="h-6 w-[3px] origin-center rounded-full bg-primary animate-wave"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        <section className="relative z-10 mt-8 flex items-center justify-center gap-4 px-6">
          {!playing ? (
            <button
              onClick={speak}
              disabled={loading || !script}
              className="grid h-16 w-16 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.04] disabled:opacity-50"
              aria-label={t("card.play")}
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Play className="h-6 w-6 translate-x-[2px] fill-current" />
              )}
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="grid h-14 w-14 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary"
                aria-label={paused ? t("player.resume") : t("player.pause")}
              >
                {paused ? (
                  <Play className="h-5 w-5 translate-x-[1px] fill-current" />
                ) : (
                  <Pause className="h-5 w-5 fill-current" />
                )}
              </button>
              <button
                onClick={stop}
                className="grid h-14 w-14 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary"
                aria-label={t("player.stop")}
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
            </>
          )}
        </section>

        {/* Transcript */}
        <section className="relative z-10 mt-10 px-6 pb-16">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t("player.transcript")}
          </h2>
          <div className="mt-4 rounded-2xl border border-border bg-card p-5">
            {loading ? (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-secondary" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-10/12 animate-pulse rounded bg-secondary/70" />
                <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/50" />
              </div>
            ) : script ? (
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/85">
                {script}
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("player.noNarration")}</p>
            )}
          </div>
        </section>
      </div>
    </MobileFrame>
  );
}
