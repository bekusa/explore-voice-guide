import { useEffect, useRef, useState } from "react";
import { FastForward, Loader2, Pause, Play, Rewind, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";

/**
 * Sticky-bottom inline audio panel — full transport row + scrubber.
 * Originally lived inside src/routes/attraction.$id.tsx; lifted into
 * its own module so the Time Machine simulation page (and any future
 * narrated surface — guide previews, museum highlights, etc.) can
 * reuse the same controls instead of each page re-inventing the
 * Play/Pause/Stop chrome.
 *
 * Mounting model: the parent passes this as MobileFrame's
 * `floatingPanel` slot. That slot is positioned absolutely just above
 * the TabBar inside the 420px phone frame on desktop and at the
 * screen edge on mobile, so we don't fight viewport-fixed layouts
 * here.
 *
 * Audio flow: POST /api/tts (Cloudflare proxy) → n8n /webhook/tts →
 * Azure Speech → mp3 binary → blob URL → HTML5 <audio>. The blob URL
 * is cached in component state so subsequent plays of the same script
 * don't re-hit the API (Azure free tier is 500K chars/month — every
 * replay would chew through quota).
 */
export function InlineAudioPanel({
  name,
  script,
  language,
  onClose,
}: {
  /** Title shown in the "now narrating" header — usually the place
   *  / moment name, never the auto-generated guide title. */
  name: string;
  /** Plain-text script to send to TTS. The caller is responsible for
   *  stripping any markdown / SSML cues; whatever lands here is what
   *  Azure will read. */
  script: string;
  /** ISO-ish language tag forwarded to TTS so the voice matches the
   *  user's chosen language. */
  language: string;
  /** Called when the user dismisses the panel (X button). */
  onClose: () => void;
}) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

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

  // Auto-fetch + auto-play once the panel mounts.
  useEffect(() => {
    let cancelled = false;
    void ensureAudio().then(() => {
      if (cancelled) return;
      // The <audio> element will render on the next tick once audioUrl
      // is set; play() runs from the autoPlay attribute below.
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup blob URL + stop playback on unmount.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const stop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPlaying(false);
    setPaused(false);
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <div
      role="region"
      aria-label={t("player.nowNarrating")}
      className="border-t border-border bg-background/95 px-5 pb-4 pt-4 shadow-elegant backdrop-blur-xl"
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          autoPlay
          onLoadedMetadata={() => {
            const a = audioRef.current;
            if (a) setProgress({ current: 0, total: a.duration || 0 });
          }}
          onTimeUpdate={() => {
            const a = audioRef.current;
            if (a) setProgress({ current: a.currentTime, total: a.duration || 0 });
          }}
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

      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
          <Play className="h-4 w-4 translate-x-[1px] fill-current" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("player.nowNarrating")}
          </p>
          <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("tm.close")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-smooth hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
        <span>{fmt(progress.current)}</span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-gold transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span>{fmt(progress.total)}</span>
      </div>

      {/* Full transport row: [Restart] [-10s] [Play] [Pause] [+10s] [Stop] */}
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          onClick={() => {
            const a = audioRef.current;
            if (!a) return;
            a.currentTime = 0;
            a.play().catch(() => {});
          }}
          disabled={!audioUrl}
          aria-label={t("player.restart")}
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            const a = audioRef.current;
            if (!a) return;
            a.currentTime = Math.max(0, a.currentTime - 10);
          }}
          disabled={!audioUrl}
          aria-label={t("player.back10")}
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <Rewind className="h-3.5 w-3.5 fill-current" />
        </button>
        <button
          onClick={() => {
            const a = audioRef.current;
            if (a && a.paused) a.play().catch(() => {});
          }}
          disabled={generating || !audioUrl || (playing && !paused)}
          aria-label={t("player.resume")}
          className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.04] disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Play className="h-5 w-5 translate-x-[1px] fill-current" />
          )}
        </button>
        <button
          onClick={() => {
            const a = audioRef.current;
            if (a && !a.paused) a.pause();
          }}
          disabled={generating || !audioUrl || !playing || paused}
          aria-label={t("player.pause")}
          className="grid h-12 w-12 place-items-center rounded-full border border-primary/40 bg-card text-foreground transition-smooth hover:border-primary/70 hover:scale-[1.04] disabled:opacity-50"
        >
          <Pause className="h-5 w-5 fill-current" />
        </button>
        <button
          onClick={() => {
            const a = audioRef.current;
            if (!a) return;
            const cap = Number.isFinite(a.duration) ? a.duration : a.currentTime + 10;
            a.currentTime = Math.min(cap, a.currentTime + 10);
          }}
          disabled={!audioUrl}
          aria-label={t("player.forward10")}
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <FastForward className="h-3.5 w-3.5 fill-current" />
        </button>
        <button
          onClick={stop}
          disabled={!audioUrl}
          aria-label={t("player.stop")}
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      </div>
    </div>
  );
}
