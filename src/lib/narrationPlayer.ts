/**
 * Narration player — a SINGLE audio element that lives outside React.
 * Beka 2026-10-04.
 *
 * ── The problem ───────────────────────────────────────────────────
 * "როდესაც აუდიოს ვუსმენ, და გადავედი სხვა ტაბზე ან ძიებაზე,
 *  შეგიძლია თუ არა აუდიო პლეერი რომ დატოვო ჩართული?"
 *
 * The `<audio>` element used to be JSX inside `InlineAudioPanel`,
 * which each page mounted through `MobileFrame`'s `floatingPanel`
 * slot. Navigating anywhere unmounted the panel, React removed the
 * element, and playback died mid-sentence.
 *
 * ── Why not "just lift the panel to the root" ─────────────────────
 * That was the obvious fix and it is wrong here. The panel is
 * positioned ABSOLUTELY inside MobileFrame's inner container — the
 * 420 px phone frame that the desktop preview draws. Rendering it at
 * the router root would position it against the viewport instead, and
 * the player would float somewhere beside the phone on desktop.
 *
 * So the UI stays exactly where it is and is free to unmount; what
 * moves out of React is the thing that must not be torn down. A
 * module-level HTMLAudioElement is not part of any component tree, so
 * no navigation can unmount it. The panel becomes a view that
 * re-attaches to whatever is already playing.
 *
 * ── What this does NOT do ─────────────────────────────────────────
 * Audio still stops when the app is BACKGROUNDED on Android. That
 * needs MediaSession + a foreground service + a Play Console
 * declaration, and is deliberately deferred (see lokali-backlog.md,
 * "აუდიო ფონში, ვარიანტი ბ"). Keeping that out of here is the reason
 * this file stays small enough to trust.
 */

import { noteAudioCompleted } from "@/lib/reviewPrompt";

export type NarrationRequest = {
  /** Title shown in the panel header — the place or moment name. */
  name: string;
  /** Plain text handed to TTS. */
  script: string;
  /** Language tag forwarded to /api/tts. */
  language: string;
};

export type NarrationState = {
  /** What the user asked to hear, or null when nothing is active. */
  request: NarrationRequest | null;
  /** Blob/remote URL once TTS has produced audio. */
  url: string | null;
  /** TTS is still rendering — panel shows a spinner. */
  generating: boolean;
  playing: boolean;
  paused: boolean;
  current: number;
  total: number;
};

const EMPTY: NarrationState = {
  request: null,
  url: null,
  generating: false,
  playing: false,
  paused: false,
  current: 0,
  total: 0,
};

let state: NarrationState = { ...EMPTY };
const listeners = new Set<(s: NarrationState) => void>();

/**
 * The one audio element. Created lazily on first use so server-side
 * rendering never touches `document`, and never destroyed — the whole
 * point is that it outlives every component.
 */
let el: HTMLAudioElement | null = null;

function emit() {
  // Fresh object each time so React's `useSyncExternalStore` /
  // setState sees a changed reference.
  state = { ...state };
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* one bad subscriber must not stop the others */
    }
  });
}

function audio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (el) return el;
  el = new Audio();
  el.preload = "auto";

  el.addEventListener("play", () => {
    state.playing = true;
    state.paused = false;
    emit();
  });
  el.addEventListener("pause", () => {
    // stopNarration() pauses the element on its way out, and that
    // event lands a task later — after the state was already cleared.
    // Without this the flag would stick to the next narration.
    if (!state.url) return;
    // Reaching the end fires `pause` too; don't show it as "paused".
    if (el && el.currentTime >= el.duration - 0.05) return;
    state.paused = true;
    emit();
  });
  el.addEventListener("ended", () => {
    state.playing = false;
    state.paused = false;
    emit();
    /* Recorded HERE rather than in the panel's `ended` subscription on
     * purpose. The panel unmounts and remounts on every route change,
     * and a guide that finishes inside that window would otherwise
     * lose the strongest "this person got value" signal we have —
     * which is exactly what the Play Store review prompt counts. */
    void noteAudioCompleted();
    endedHandlers.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  });
  el.addEventListener("timeupdate", () => {
    if (!el) return;
    state.current = el.currentTime;
    state.total = Number.isFinite(el.duration) ? el.duration : 0;
    emit();
  });
  el.addEventListener("loadedmetadata", () => {
    if (!el) return;
    state.current = 0;
    state.total = Number.isFinite(el.duration) ? el.duration : 0;
    emit();
  });
  el.addEventListener("error", () => {
    // Same reasoning as `pause`, and here it matters visibly: the
    // error subscribers raise a "couldn't load the guide" toast, and
    // firing that when the user simply pressed X would be a bug.
    if (!state.url) return;
    state.playing = false;
    state.paused = false;
    emit();
    errorHandlers.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  });

  return el;
}

/* Side-channel callbacks. The panel owns the user-facing reactions to
 * these (toasts, review-prompt signal), but the events fire on an
 * element the panel no longer owns — so it subscribes instead. */
const endedHandlers = new Set<() => void>();
const errorHandlers = new Set<() => void>();

export function onNarrationEnded(fn: () => void): () => void {
  endedHandlers.add(fn);
  return () => endedHandlers.delete(fn);
}
export function onNarrationError(fn: () => void): () => void {
  errorHandlers.add(fn);
  return () => errorHandlers.delete(fn);
}

/* ── Duplicate-fetch guard ────────────────────────────────────────
 *
 * The panel is no longer mounted once per narration: MobileFrame
 * renders it, so EVERY route change remounts it while the same
 * narration may still be generating. Without a claim, each remount
 * would fire another /api/tts call for audio already on its way —
 * Azure characters billed twice (or five times) for one tap of
 * Listen. Beka's $1500 Google bill is why this guard exists at all.
 *
 * A failed fetch deliberately KEEPS its claim. Releasing it would
 * turn "TTS failed" into a retry on every subsequent navigation; the
 * user retries by closing the player and tapping Listen again, which
 * goes through stopNarration() and clears the claim.
 */
let fetchClaim: string | null = null;

/** True exactly once per key — the caller that gets `true` fetches. */
export function claimNarrationFetch(key: string): boolean {
  if (fetchClaim === key) return false;
  fetchClaim = key;
  return true;
}

export function getNarrationState(): NarrationState {
  return state;
}

export function subscribeNarration(fn: (s: NarrationState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Begin a narration. Called by a page's Listen button.
 *
 * Starting the SAME request again is a no-op: re-tapping Listen on a
 * page you are already hearing should not restart it from zero, and
 * (more importantly) navigating back to that page must not either —
 * the page cannot tell the difference, so the store decides.
 */
export function startNarration(req: NarrationRequest): void {
  const same =
    state.request &&
    state.request.name === req.name &&
    state.request.language === req.language &&
    state.request.script === req.script;
  if (same) return;

  stopNarration();
  state.request = req;
  state.generating = true;
  emit();
}

/** TTS finished; hand the player a URL and start playback. */
export function setNarrationUrl(url: string): void {
  const a = audio();
  state.url = url;
  state.generating = false;
  emit();
  if (!a) return;
  a.src = url;
  void a.play().catch(() => {
    /* autoplay blocked — the transport buttons still work */
  });
}

/** TTS failed; clear the spinner but keep the panel open to explain. */
export function failNarration(): void {
  state.generating = false;
  emit();
}

export function pauseNarration(): void {
  audio()?.pause();
}

export function resumeNarration(): void {
  const a = audio();
  if (!a) return;
  void a.play().catch(() => {});
}

export function seekNarration(seconds: number): void {
  const a = audio();
  if (!a) return;
  const cap = Number.isFinite(a.duration) ? a.duration : a.currentTime + seconds;
  a.currentTime = Math.min(Math.max(0, seconds), cap);
}

export function seekBy(delta: number): void {
  const a = audio();
  if (!a) return;
  seekNarration(a.currentTime + delta);
}

export function restartNarration(): void {
  const a = audio();
  if (!a) return;
  a.currentTime = 0;
  void a.play().catch(() => {});
}

/**
 * Stop and clear everything — the panel's X button.
 *
 * Revokes the previous blob URL. Without this every narration leaks a
 * blob for the lifetime of the tab, and a long session of a dozen
 * guides holds a dozen MP3s in memory on a phone.
 */
export function stopNarration(): void {
  const a = audio();
  if (a) {
    a.pause();
    a.removeAttribute("src");
    a.load();
  }
  if (state.url && state.url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(state.url);
    } catch {
      /* already revoked */
    }
  }
  fetchClaim = null;
  state = { ...EMPTY };
  emit();
}
