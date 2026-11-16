/**
 * Play Store in-app review prompt. Beka 2026-09-18 spec, reworked
 * 2026-11-15 (see "What changed" below).
 *
 * ── The rule this file exists to respect ──────────────────────────
 * Google's In-App Review guidance: no questions about the user's
 * opinion before or while the review card is shown, no showing the
 * store dialog only to the happy ones, and no text of our own next to
 * it or drawing attention to it.
 *
 * We pick a MOMENT from behaviour alone — "listened to a whole audio
 * guide", "came back on a second day", "opened three places", "hit no
 * errors" — and then hand over to Google's dialog with no commentary.
 * We never ask "do you like Lokali?" first, and nothing the user told
 * us about their opinion decides whether they see it.
 *
 * ── What changed 2026-11-15 (Beka: "მიდი დაიწყე გასწორება") ────────
 *  1. The dialog had NEVER shown. The plugin was loaded with
 *     import("@capacitor-community/in-app-review"). The native shells
 *     load the site from lokali.travel, where a bare package name like
 *     that cannot be resolved, so the import threw, the catch logged
 *     "skipped", and that was every attempt since September (checked
 *     in the live bundle: the bare name is there, no registerPlugin).
 *     It now goes through registerPlugin("InAppReview") — the name
 *     the package itself registers, and the same route Apple sign-in
 *     takes in routes/auth.tsx. The native side was always installed.
 *  2. A 4-5★ guide rating is no longer required. It made our own
 *     "how was this guide?" stars the filter for who sees Google's
 *     dialog — exactly the happy-users-only pattern the guidance
 *     warns against. Ratings now only count as a day of activity.
 *  3. The moment moved from "a guide page loaded" (often before the
 *     person had heard a word) to "an audio guide just finished" —
 *     see the `ended` handler in lib/narrationPlayer.ts.
 *
 * Practical consequence: no copy, so nothing to translate into 45
 * languages. Google renders the dialog in the device's language.
 *
 * ── Why Google's API and not a store link ─────────────────────────
 * The native dialog opens in place and the user never leaves the app.
 * A link to the Play listing loses most people on the jump.
 *
 * ── What you cannot know ──────────────────────────────────────────
 * Google quota-limits how often the dialog may appear, and the API
 * reports SUCCESS whether or not it actually showed anything. There
 * is no callback, no "was it displayed", no "did they rate". So we
 * mark `asked` the moment we call it and never try again. Asking a
 * second time is the one behaviour that would actually annoy people.
 */
import { Preferences } from "@capacitor/preferences";

const KEY = "lokali.review.v1";

/** How many distinct attractions before we consider asking. */
const MIN_LOCATIONS = 3;
/** At least one guide listened through — opening a page proves nothing. */
const MIN_AUDIO_COMPLETED = 1;
/** Two separate days filters out one-off curiosity. */
const MIN_DISTINCT_DAYS = 2;
/** A recent failure poisons the moment. 24 h of quiet required. */
const ERROR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type State = {
  /** Distinct attraction keys the user has opened. Capped to keep the blob small. */
  locations: string[];
  audioCompleted: number;
  /** YYYY-MM-DD, deduped, capped at 5 — we only need "≥ 2". */
  days: string[];
  /** Epoch ms of the last user-visible error, or 0. */
  lastErrorAt: number;
  /** True once the Google dialog has been requested. Never reset. */
  asked: boolean;
};
// (Blobs saved before 2026-11-15 also carry `bestRating`. It is read
// back harmlessly with the rest and simply no longer consulted.)

const EMPTY: State = {
  locations: [],
  audioCompleted: 0,
  days: [],
  lastErrorAt: 0,
  asked: false,
};

async function read(): Promise<State> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(value) as Partial<State>) };
  } catch {
    return { ...EMPTY };
  }
}

async function write(state: State): Promise<void> {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(state) });
  } catch {
    /* Preferences unavailable (web) — the prompt simply never fires. */
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Record a day of activity. Called by every note* function. */
function withToday(state: State): State {
  const d = today();
  if (state.days.includes(d)) return state;
  return { ...state, days: [...state.days, d].slice(-5) };
}

/* ─── Signals ─────────────────────────────────────────────────────
 * Each is fire-and-forget: callers must never await these in a path
 * the user is waiting on.
 */

/** The user opened an attraction guide. */
export async function noteLocationViewed(key: string): Promise<void> {
  if (!key) return;
  const s = await read();
  if (s.asked) return;
  const locations = s.locations.includes(key)
    ? s.locations
    : [...s.locations, key].slice(-20);
  await write(withToday({ ...s, locations }));
}

/** An audio guide played essentially to the end (see the caller's threshold). */
export async function noteAudioCompleted(): Promise<void> {
  const s = await read();
  if (s.asked) return;
  await write(withToday({ ...s, audioCompleted: s.audioCompleted + 1 }));
}

/**
 * The user rated a guide. Counts as a day of activity and nothing more:
 * since 2026-11-15 the stars themselves no longer decide anything (see
 * "What changed" at the top). The parameter stays so GuideRating's call
 * site is untouched.
 */
export async function noteGuideRated(_stars: number): Promise<void> {
  const s = await read();
  if (s.asked) return;
  await write(withToday(s));
}

/**
 * Something failed in the user's face ("AI is temporarily busy",
 * a failed generation, an offline stall). Resets the cooldown.
 */
export async function noteUserFacingError(): Promise<void> {
  const s = await read();
  if (s.asked) return;
  await write({ ...s, lastErrorAt: Date.now() });
}

/* ─── The prompt ──────────────────────────────────────────────── */

/**
 * Ask Google to show the review dialog, if this is a good moment.
 *
 * Safe to call often — it is cheap, idempotent, and does nothing
 * unless every condition holds. Returns true only when the request
 * was actually handed to Google (which, again, does NOT mean the
 * user saw anything).
 */
export async function maybeAskForReview(opts: {
  /** Is the content the user just consumed in their chosen language? */
  inPreferredLanguage: boolean;
  online: boolean;
}): Promise<boolean> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    // Web has no Play dialog. Bail before touching Preferences.
    if (!Capacitor.isNativePlatform()) return false;
    if (!opts.online || !opts.inPreferredLanguage) return false;

    const s = await read();
    if (s.asked) return false;
    if (s.locations.length < MIN_LOCATIONS) return false;
    if (s.audioCompleted < MIN_AUDIO_COMPLETED) return false;
    if (s.days.length < MIN_DISTINCT_DAYS) return false;
    if (s.lastErrorAt && Date.now() - s.lastErrorAt < ERROR_COOLDOWN_MS) return false;

    /* Reach the native plugin by the name it registers, through
     * @capacitor/core — NOT by importing the npm package.
     *
     * The previous code did `import(pluginId)` with the package name
     * held in a variable (to keep tsc quiet on machines without the
     * package). That compiled, and then failed at runtime on every
     * device: the shells load the web app from lokali.travel, and a
     * browser cannot resolve a bare package name there. The npm
     * package's own JS is nothing but registerPlugin("InAppReview"),
     * so calling it directly gives the identical proxy with no import
     * to resolve — same pattern as SignInWithApple in routes/auth.tsx.
     * Type-checks without the package installed, too.
     *
     * isPluginAvailable first: an older store build without the native
     * half would otherwise reject the call AFTER `asked` is saved, and
     * that user would lose their one prompt for good. Not available →
     * stay quiet and try again after they update the app. */
    if (!Capacitor.isPluginAvailable("InAppReview")) return false;
    const InAppReview = registerPlugin<{ requestReview: () => Promise<void> }>("InAppReview");

    // Mark BEFORE the call, not after. If requestReview throws midway
    // we still must not try again — and Google gives us no way to
    // tell a thrown call from a quota-suppressed one.
    await write({ ...s, asked: true });
    await InAppReview.requestReview();
    return true;
  } catch (err) {
    console.warn("[reviewPrompt] skipped", err);
    return false;
  }
}
