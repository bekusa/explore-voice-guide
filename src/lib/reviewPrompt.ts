/**
 * Play Store in-app review prompt. Beka 2026-09-18 spec.
 *
 * ── The rule this file exists to respect ──────────────────────────
 * Google's In-App Review policy forbids GATING: you may not ask the
 * user how they feel and then show the store dialog only to the happy
 * ones, and you may not put your own text next to the dialog or draw
 * attention to it.
 *
 * So the high rating is NOT a gate. It is one of several signals that
 * this person has had a good run with the app — alongside "listened
 * to a whole audio guide", "came back on a second day", "read three
 * places", "hit no errors". We use that bundle to pick a MOMENT, and
 * then hand over to Google's dialog with no commentary of our own.
 * We never ask "do you like Lokali?" first, and we never branch on
 * the answer.
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
/** Only a 4-5★ guide rating counts as a positive signal. */
const GOOD_RATING = 4;

type State = {
  /** Distinct attraction keys the user has opened. Capped to keep the blob small. */
  locations: string[];
  audioCompleted: number;
  /** YYYY-MM-DD, deduped, capped at 5 — we only need "≥ 2". */
  days: string[];
  /** Epoch ms of the last user-visible error, or 0. */
  lastErrorAt: number;
  /** Highest guide rating the user has given, 0 if none. */
  bestRating: number;
  /** True once the Google dialog has been requested. Never reset. */
  asked: boolean;
};

const EMPTY: State = {
  locations: [],
  audioCompleted: 0,
  days: [],
  lastErrorAt: 0,
  bestRating: 0,
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

/** The user rated a guide. Only 4-5★ moves the needle. */
export async function noteGuideRated(stars: number): Promise<void> {
  const s = await read();
  if (s.asked) return;
  await write(withToday({ ...s, bestRating: Math.max(s.bestRating, stars) }));
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
    const { Capacitor } = await import("@capacitor/core");
    // Web has no Play dialog. Bail before touching Preferences.
    if (!Capacitor.isNativePlatform()) return false;
    if (!opts.online || !opts.inPreferredLanguage) return false;

    const s = await read();
    if (s.asked) return false;
    if (s.locations.length < MIN_LOCATIONS) return false;
    if (s.audioCompleted < MIN_AUDIO_COMPLETED) return false;
    if (s.days.length < MIN_DISTINCT_DAYS) return false;
    if (s.bestRating < GOOD_RATING) return false;
    if (s.lastErrorAt && Date.now() - s.lastErrorAt < ERROR_COOLDOWN_MS) return false;

    // Dynamic import so the plugin is not pulled into the web bundle,
    // where it does not exist.
    const mod = await import("@capacitor-community/in-app-review");
    const InAppReview = (mod as { InAppReview?: { requestReview: () => Promise<void> } })
      .InAppReview;
    if (!InAppReview) return false;

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
