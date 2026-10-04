import { useEffect, useRef, useState } from "react";
import { FastForward, Loader2, Pause, Play, Rewind, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";
import { useAuth } from "@/hooks/useAuth";
import { useNarration } from "@/hooks/useNarration";
import {
  claimNarrationFetch,
  failNarration,
  onNarrationError,
  pauseNarration,
  restartNarration,
  resumeNarration,
  seekBy,
  seekNarration,
  setNarrationUrl,
  stopNarration,
} from "@/lib/narrationPlayer";
import { supabase } from "@/integrations/supabase/client";
import { resolveAzureVoice } from "@/lib/azureVoices";
import { attractionSlug } from "@/lib/api";
import { audioId, getAudioBlobUrl, saveAudioBlob, saveScript, scriptId } from "@/lib/offlineStore";
import { trackEvent } from "@/lib/analytics";

/**
 * Module-level cache of the resolved Azure voice preference.
 *
 * MobileFrame remounts this panel on every route change now, and each
 * mount used to re-read profiles.preferred_voice from Supabase. The
 * preference cannot change while a narration is playing, so one read
 * per user per session is enough. Keyed by user id so signing in or
 * out invalidates it.
 */
let voiceCache: { userId: string | null; voice: string | null } | null = null;

/**
 * Sticky-bottom inline audio panel — full transport row + scrubber.
 * Originally lived inside src/routes/attraction.$id.tsx; lifted into
 * its own module so the Time Machine simulation page (and any future
 * narrated surface — guide previews, museum highlights, etc.) can
 * reuse the same controls instead of each page re-inventing the
 * Play/Pause/Stop chrome.
 *
 * Mounting model (changed 2026-10-04): MobileFrame renders this panel
 * itself whenever `narrationPlayer` has an active request — pages no
 * longer pass it in. That is what makes the player survive a tab
 * change: the audio element is outside React entirely, and the UI
 * reappears on whatever page the user lands on. The slot is still
 * positioned absolutely just above the TabBar inside the 420px phone
 * frame on desktop and at the screen edge on mobile, so we don't
 * fight viewport-fixed layouts here.
 *
 * Takes no props as a result. Everything it narrates comes from the
 * store, which is also the only place that knows whether a given
 * narration is already playing.
 *
 * Audio flow: POST /api/tts (Cloudflare proxy) → n8n /webhook/tts →
 * Azure Speech → mp3 binary → blob URL → the store's persistent
 * <audio>. The blob URL is kept in the store so subsequent plays of
 * the same script don't re-hit the API (Azure free tier is 500K
 * chars/month — every replay would chew through quota).
 */
export function InlineAudioPanel() {
  const t = useT();
  const { user, loading: authLoading } = useAuth();
  // North Star telemetry: remembers the last audioUrl we already counted
  // as an "audio_played" so resumes/seeks don't inflate the metric — one
  // play event per generated guide, not per press of the play button.
  const playReportedRef = useRef<string | null>(null);

  /* Playback state now lives OUTSIDE React — see lib/narrationPlayer.ts.
   * Beka 2026-10-04: "გადავედი სხვა ტაბზე … აუდიო პლეერი რომ დატოვო
   * ჩართული". The <audio> element used to be JSX in this component, so
   * every navigation unmounted it and killed playback mid-sentence.
   *
   * These five locals keep the ORIGINAL names on purpose: the whole
   * render tree below — header, scrubber, transport row — then needs
   * no changes at all, which keeps this refactor to the part that
   * actually had to move. */
  const narration = useNarration();
  const audioUrl = narration.url;
  const generating = narration.generating;
  const playing = narration.playing;
  const paused = narration.paused;
  const progress = { current: narration.current, total: narration.total };

  /* What used to arrive as props now comes from the store. Same names,
   * so everything downstream — ensureAudio, the offline cache keys,
   * the header — is untouched. */
  const name = narration.request?.name ?? "";
  const script = narration.request?.script ?? "";
  const language = narration.request?.language ?? "";

  /* Identity of the current request, used as the fetch-effect key AND
   * as the duplicate-fetch claim. Name + language is enough: the same
   * place in the same language is the same audio. The script is left
   * out on purpose — it can be thousands of characters and would be
   * re-hashed by React on every render for no gain. */
  const requestKey = narration.request ? `${name}\u0000${language}` : "";
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
    // Already resolved this session for this user — skip the
    // round-trip. Matters because every route change remounts us.
    if (voiceCache && voiceCache.userId === (user?.id ?? null)) {
      setPreferredVoice(voiceCache.voice);
      setVoicePrefLoaded(true);
      return;
    }
    // No user → no profile row to read. Mark "loaded" immediately so
    // the audio fetch can proceed with the language default voice.
    if (!user) {
      voiceCache = { userId: null, voice: null };
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
        const voice =
          data?.preferred_voice && /-[A-Z][A-Za-z]+Neural$/.test(data.preferred_voice)
            ? data.preferred_voice
            : null;
        voiceCache = { userId: user.id, voice };
        if (voice) setPreferredVoice(voice);
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
          // The store owns revoking the previous blob — see
          // stopNarration() — so the 2026-06-11 leak fix still holds,
          // just one layer down.
          setNarrationUrl(cachedUrl);
          return cachedUrl;
        }
      }

      // 30 s AbortController timeout (Beka 2026-06-11 audit). Azure
      // Speech occasionally hangs the connection without returning —
      // without a hard timeout the panel sits in "generating" state
      // forever, blocking the play button. 30 s is generous: the
      // p99 for a 1500-word script is under 8 s, so anything past
      // 30 s is genuinely stuck.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script, language, voice }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
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

        /* Beka 2026-10-03 — never surface the raw status or body.
         *
         * This line used to produce, verbatim on screen:
         *   HTTP 502: {"error":"Azure Speech 401","detail":""}
         *
         * Two problems. It is a stack trace shown to a traveller
         * standing in a museum; and it actively misled US — the 502
         * read as a timeout when the real cause was 401, a rejected
         * key. /api/tts now returns a classified `reason` instead, and
         * we map it to a sentence a person can act on. The precise
         * upstream detail lives in error_logs, which is where it
         * belongs. */
        let reason = "";
        try {
          reason = (JSON.parse(errText) as { reason?: string }).reason ?? "";
        } catch {
          /* non-JSON body — fall through to the generic message */
        }
        throw new Error(
          reason === "auth"
            ? "TTS_AUTH"
            : reason === "quota"
              ? "TTS_QUOTA"
              : reason === "timeout"
                ? "TTS_TIMEOUT"
                : "TTS_FAILED",
        );
      }
      const blob = await res.blob();
      if (blob.size < 500 || !blob.type.toLowerCase().includes("audio")) {
        throw new Error("Invalid audio response");
      }
      const url = URL.createObjectURL(blob);
      // Hand it to the store, which sets .src and starts playback on
      // the persistent element. Blob revocation is the store's job.
      setNarrationUrl(url);

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
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        // Timed out — Azure didn't return inside 30 s. Surface a
        // distinct message so the user knows to retry rather than
        // staring at the generic "couldn't load" toast indefinitely.
        toast.error(t("toast.couldNotLoadGuide"), {
          description: t("toast.tryAgainPlease"),
        });
      } else if (message === "VOICE_UNAVAILABLE") {
        toast.error(t("toast.voiceUnavailableTitle"), {
          description: t("toast.voiceUnavailableHint"),
        });
      } else if (message === "TTS_QUOTA") {
        // Honest and specific: waiting actually helps here, and
        // "try again" alone would send them into a retry loop that
        // cannot succeed until the quota window rolls over.
        toast.error(t("toast.audioUnavailableTitle"), {
          description: t("toast.audioQuotaHint"),
        });
      } else if (message === "TTS_AUTH" || message === "TTS_FAILED") {
        // A rejected key is OUR problem, not theirs — so the copy says
        // "we're on it" rather than "try again", which would be a lie.
        // The real cause is already in error_logs.
        toast.error(t("toast.audioUnavailableTitle"), {
          description: t("toast.audioOurSideHint"),
        });
      } else {
        /* Beka 2026-10-03 — `message` is NEVER shown any more.
         *
         * It used to be passed straight into the toast description,
         * which is how a traveller ended up reading
         *   HTTP 502: {"error":"Azure Speech 401","detail":""}
         * on their phone. Internal strings stay internal; the user
         * gets a sentence, and error_logs gets the detail. */
        toast.error(t("toast.couldNotLoadGuide"), {
          description: t("toast.tryAgainPlease"),
        });
      }
      // Clear the spinner but keep the panel open — the toast above
      // explains what happened, and an empty panel with a dead
      // spinner would be worse than one that says "no audio".
      failNarration();
      return null;
    }
  };

  // Auto-fetch + auto-play once the panel mounts AND the user's
  // voice preference has finished loading from Supabase. The wait is
  // critical: firing /api/tts before preferredVoice resolves means we
  // send `voice = language-default` and Azure renders the wrong voice
  // for the rest of the session (the audio blob is cached in state,
  // so even after preferredVoice arrives we never re-fetch).
  //
  // Keyed on requestKey, not on mount, for two reasons. The panel is
  // now long-lived, so starting a DIFFERENT narration has to re-fire
  // this; and the panel still remounts on every route change, so the
  // claim below is what stops one tap of Listen from billing Azure
  // once per page the user visits while it renders.
  useEffect(() => {
    if (!requestKey || !voicePrefLoaded) return;
    if (!claimNarrationFetch(requestKey)) return;
    // setNarrationUrl() inside ensureAudio hands the URL to the
    // persistent element and starts playback there — nothing to do
    // with the return value on this side.
    void ensureAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, voicePrefLoaded]);

  /* The unmount cleanup that used to live here is GONE, deliberately.
   *
   * It paused the audio and revoked the blob whenever this component
   * unmounted — which is precisely the behaviour Beka asked to end:
   * switching tabs unmounts the panel, and the guide stopped. Teardown
   * now belongs to stopNarration(), which runs when the user closes
   * the player, not when React happens to re-render a route. */

  /* Side effects that used to hang off the <audio> JSX. They have to
   * be subscriptions now, because the element is no longer ours. */
  // Only the failure toast lives here — it needs `t` and `toast`, so
  // it has to be a component. The review-prompt signal moved into the
  // store's own `ended` handler, because it must not depend on this
  // panel happening to be mounted when the guide finishes.
  useEffect(() => {
    return onNarrationError(() => {
      toast.error(t("toast.couldNotLoadGuide"), {
        description: t("toast.tryAgainPlease"),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* North Star telemetry — one "audio_played" per generated guide.
   * Previously fired from the element's onPlay; now keyed off the
   * store's url + playing so resumes and seeks still don't inflate it. */
  useEffect(() => {
    if (!playing || !audioUrl) return;
    if (playReportedRef.current === audioUrl) return;
    playReportedRef.current = audioUrl;
    trackEvent("audio_played", { name, language }, user?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioUrl]);

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  // Belt and braces: MobileFrame only renders us while a request is
  // active, but this keeps the component honest if anything else ever
  // mounts it. It sits AFTER every hook so the hook order is stable.
  if (!narration.request) return null;

  return (
    <div
      role="region"
      aria-label={t("player.nowNarrating")}
      className="border-t border-border bg-background/95 px-5 pb-4 pt-4 shadow-elegant backdrop-blur-xl"
    >
      {/* The <audio> element that used to sit here is gone — it now
          lives in lib/narrationPlayer.ts, outside the React tree, so
          navigating between tabs can no longer unmount it. Its
          loadedmetadata / timeupdate / play / pause / ended / error
          handlers moved there too; the two that need UI (the review
          signal and the failure toast) are subscriptions above. */}

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
          // Closing the player is the ONLY teardown now — it pauses,
          // drops the src and revokes the blob. Navigation no longer
          // does any of that (which was the whole bug).
          onClick={() => stopNarration()}
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
          onClick={() => restartNarration()}
          disabled={!audioUrl}
          aria-label={t("player.restart")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => seekBy(-10)}
          disabled={!audioUrl}
          aria-label={t("player.back10")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <Rewind className="h-3.5 w-3.5 fill-current" />
        </button>
        <button
          onClick={() => resumeNarration()}
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
          onClick={() => pauseNarration()}
          disabled={generating || !audioUrl || !playing || paused}
          aria-label={t("player.pause")}
          className="grid h-12 w-12 place-items-center rounded-full border border-primary/40 bg-card text-foreground transition-smooth hover:border-primary/70 hover:scale-[1.04] disabled:opacity-50"
        >
          <Pause className="h-5 w-5 fill-current" />
        </button>
        <button
          onClick={() => seekBy(10)}
          disabled={!audioUrl}
          aria-label={t("player.forward10")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <FastForward className="h-3.5 w-3.5 fill-current" />
        </button>
        <button
          // Stop ≠ close: it parks the narration at 0:00 and leaves
          // the panel up, so Play starts the same guide over. The X
          // button above is what tears everything down.
          onClick={() => {
            pauseNarration();
            seekNarration(0);
          }}
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
