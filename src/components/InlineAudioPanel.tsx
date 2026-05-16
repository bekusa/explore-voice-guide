import { useEffect, useRef, useState } from "react";
import { FastForward, Loader2, Pause, Play, Rewind, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { resolveAzureVoice } from "@/lib/azureVoices";
import { attractionSlug } from "@/lib/api";
import { audioId, getAudioBlobUrl, saveAudioBlob, saveScript, scriptId } from "@/lib/offlineStore";

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
  const { user, loading: authLoading } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  // The user's chosen Azure voice (e.g. "ka-GE-EkaNeural"). Loaded
  // from profiles.preferred_voice on mount so we can send it along
  // with the script to /api/tts → n8n → Azure. Without this, every
  // listener heard Azure's default voice for the language regardless
  // of what they picked in Settings — Beka's bug report.
  const [preferredVoice, setPreferredVoice] = useState<string | null>(null);
  // Race-condition guard. The audio-fetch effect below MUST wait for
  // the profile load to finish before firing — otherwise the request
  // hits /api/tts with `voice = language default` and Azure renders
  // the wrong voice, even though Settings stored the right one. Beka
  // caught this exact issue on round 2: picker worked, playback
  // ignored it. We flip this true once we know which voice (if any)
  // belongs to the current user.
  const [voicePrefLoaded, setVoicePrefLoaded] = useState(false);

  useEffect(() => {
    // While auth is resolving (initial getSession is still in flight),
    // keep voicePrefLoaded false. Otherwise a hard refresh on an
    // attraction page would let the audio fetch fire with user=null
    // before the real session arrives a beat later, and we'd lose the
    // user's voice pick on every cold load.
    if (authLoading) return;
    // No user → no profile row to read. Mark "loaded" immediately so
    // the audio fetch can proceed with the language default voice.
    if (!user) {
      setVoicePrefLoaded(true);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("preferred_voice")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Only honour Azure-shaped values; ignore legacy browser URIs.
        if (
          data?.preferred_voice &&
          /-[A-Z][A-Za-z]+Neural$/.test(data.preferred_voice)
        ) {
          setPreferredVoice(data.preferred_voice);
        }
        // Flip the gate AFTER the state setter so the audio-fetch
        // effect below sees the resolved preferredVoice on its first
        // valid run — not null then the right value on a second run
        // (which would waste an Azure call rendering the default).
        setVoicePrefLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const ensureAudio = async (): Promise<string | null> => {
    if (audioUrl) return audioUrl;
    if (!script) return null;
    setGenerating(true);
    try {
      // Resolve the voice to send. If the user's preference is for a
      // different language than the current attraction (e.g. they
      // picked "Eka" while in Georgian, now tapped a guide in
      // English), resolveAzureVoice falls back to the language
      // default rather than asking Azure to render English with a
      // Georgian voice — which would fail.
      const voice = resolveAzureVoice(language, preferredVoice) ?? "";

      // Offline-first: if we've stored audio for this (place, lang,
      // voice) before, use it directly. No /api/tts call, no Azure
      // quota burn, no network dependency — Lokali works fully on
      // an aeroplane / underground. Falls through to network fetch
      // when nothing's cached locally.
      if (voice) {
        const slug = attractionSlug(name);
        const cachedUrl = await getAudioBlobUrl(audioId(slug, language, voice));
        if (cachedUrl) {
          setAudioUrl(cachedUrl);
          return cachedUrl;
        }
      }

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, language, voice }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        // Detect "voice not available for this language" upstream
        // responses so we can surface a clear toast instead of the
        // generic "couldn't load guide" message. Beka caught this on
        // Georgian: Azure doesn't have every language available in
        // every region of n8n's config, and the user just saw a
        // generic failure with no clue why. The check is heuristic
        // — n8n returns the Azure error string verbatim, and
        // Azure's "not supported" copy uses these phrases.
        const looksLikeUnsupported =
          /unsupported|not supported|invalid voice|no voice|language not/i.test(errText);
        if (looksLikeUnsupported) {
          throw new Error("VOICE_UNAVAILABLE");
        }
        throw new Error(`HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`);
      }
      const blob = await res.blob();
      if (blob.size < 500 || !blob.type.toLowerCase().includes("audio")) {
        throw new Error("Invalid audio response");
      }
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Persist for next-time offline playback. Fire-and-forget so
      // playback isn't blocked on disk write; if it fails (quota,
      // permissions) we just refetch next session — no harm done.
      // Only persist when we have a real voice id (anonymous web
      // visitors without a profile fall through with empty voice).
      if (voice) {
        const slug = attractionSlug(name);
        void saveAudioBlob(audioId(slug, language, voice), blob).catch(() => {
          /* storage full or permissions denied — silent */
        });
        // Mirror the script too so the saved view can show
        // transcripts offline. Independent of voice so we don't
        // duplicate the text per voice.
        void saveScript(scriptId(slug, language), script).catch(() => {});
      }

      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "VOICE_UNAVAILABLE") {
        toast.error(t("toast.voiceUnavailableTitle"), {
          description: t("toast.voiceUnavailableHint"),
        });
      } else {
        toast.error(t("toast.couldNotLoadGuide"), {
          description: message || t("toast.tryAgainPlease"),
        });
      }
      return null;
    } finally {
      setGenerating(false);
    }
  };

  // Auto-fetch + auto-play once the panel mounts AND the user's
  // voice preference has finished loading from Supabase. The wait is
  // critical: firing /api/tts before preferredVoice resolves means we
  // send `voice = language-default` and Azure renders the wrong voice
  // for the rest of the session (the audio blob is cached in state,
  // so even after preferredVoice arrives we never re-fetch).
  useEffect(() => {
    if (!voicePrefLoaded) return;
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
  }, [voicePrefLoaded]);

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
          // Toast on decode / network failures so the panel doesn't
          // hang at 0:00 / 0:00 forever when Azure returns a broken
          // blob (truncated bytes, wrong Content-Type, expired URL).
          // Beka caught this on a flaky mobile connection — the
          // panel was visible but no transport interaction worked.
          onError={() => {
            setPlaying(false);
            setPaused(false);
            toast.error(t("toast.couldNotLoadGuide"), {
              description: t("toast.tryAgainPlease"),
            });
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
          // h-11 = 44px = Apple HIG minimum tap target. Previously
          // h-8 (32px) which fails iOS / Android accessibility audits
          // and makes the close gesture frustrating with thumbs.
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-smooth hover:text-foreground"
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
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
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
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
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
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <FastForward className="h-3.5 w-3.5 fill-current" />
        </button>
        <button
          onClick={stop}
          disabled={!audioUrl}
          aria-label={t("player.stop")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      </div>
    </div>
  );
}
