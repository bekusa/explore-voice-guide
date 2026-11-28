/**
 * Report a browser-side failure to /api/client-error.
 *
 * Beka 2026-10-15: "დღეს დამიწერა AI temporary busy, მაგრამ ლოგებში
 * ვერ ამოვიკითხე."
 * Beka 2026-10-25: "მჭირდება რომ ყველა ტიპის ერორი ილოგებოდეს და ამას
 * ვხედავდეთ."
 *
 * All of this project's telemetry lived on the server, so a failure
 * that happened in the browser — offline, aborted, DNS, a stale
 * service-worker response, malformed JSON — showed the user a toast
 * and left no record anywhere. This is the other half.
 *
 * Rules, same as the server logger:
 *   1. NEVER throw. A reporter that breaks the page it is reporting
 *      on is worse than no reporter.
 *   2. Never block the UI. Callers do not await it; the toast shows
 *      immediately either way.
 *
 * ── Why the throttle lives HERE and not in the callers ────────────
 * This module is the single choke point every reporter goes through —
 * the explicit `catch` sites AND the global window handlers in
 * clientErrorGuard.ts. Putting dedupe and the session cap here means
 * a render loop that throws sixty times a second cannot flood
 * `error_logs`, no matter which path it came in by, and no caller has
 * to remember to be careful.
 *
 * Beka chose "log everything, no content filter" (2026-10-25), so
 * browser-extension noise and third-party script errors DO get
 * recorded. That makes the volume control the only thing standing
 * between one bad deploy and a few hundred thousand rows, which is
 * why the limits below are deliberately conservative.
 */

/** Coarse bucket, mirrored by ErrorKind on the server. */
export type ClientErrorKind =
  /** Request never completed: offline, DNS, CORS, abort. */
  | "network"
  /** Uncaught exception or unhandled promise rejection. */
  | "js"
  /** React failed to render — the white-screen case. */
  | "crash"
  /** An image / script / stylesheet failed to load. */
  | "resource";

/** What the browser can tell us that the server could not. */
export type ClientErrorReport = {
  /** Where in the app, e.g. "results:fetchAttractions". */
  where: string;
  /** The thrown value. Anything — it is normalised here. */
  error: unknown;
  /** HTTP status, when the failure was a response rather than a throw. */
  status?: number | null;
  /** Defaults to "network" to preserve the original call sites. */
  kind?: ClientErrorKind;
  /** The search the user was doing, for reproducing it. */
  query?: string | null;
  lang?: string | null;
  /** How long the attempt took before giving up. */
  durationMs?: number | null;
  /** Stack trace, when one is available. Clipped server-side. */
  stack?: string | null;
  /** `file.js:120:9` for a global error, or a component stack. */
  source?: string | null;
};

/* ── Volume control ──────────────────────────────────────────────── */

/**
 * Hard ceiling per page session. A crash loop is the realistic threat
 * here, not an attacker: one bad render can throw continuously for as
 * long as the tab is open. 25 is comfortably more than any real
 * session needs and small enough to be harmless if every user hit it.
 */
const MAX_REPORTS_PER_SESSION = 25;

/** Identical failures inside this window collapse into one row. */
const DEDUPE_WINDOW_MS = 60_000;

type Seen = { windowStartedAt: number; suppressed: number };

const seen = new Map<string, Seen>();
let sent = 0;
let limitAnnounced = false;

/* ── Image failures: who is actually seeing them ─────────────────────
 * Beka 2026-11-27: "Failed to load img" was the most frequent row in
 * error_logs — 60-130 a day from mid-November. Matched against
 * usage_events page by page, about three in four came from one crawler:
 * desktop "Windows Chrome", US datacentre networks, a brand-new device
 * on every page, one attraction every 3-10 s, never a tap. Most of the
 * rest came from look-alikes in HK/SG. Such crawlers block image
 * downloads to save bandwidth, so the first <img> on each page (a map
 * tile or the hero photo) "fails" — while the same photo opens fine for
 * everyone else (spot-checked: the photo blobs load). Real people produced
 * roughly 20 of these rows in 12 days.
 *
 * Three filters, image failures only. Scripts and stylesheets are NOT
 * filtered — a stale chunk means a blank page whose owner may never get
 * the chance to tap anything.
 *  1. Map tiles are never reported. A missing tile is a grey square
 *     Leaflet already tolerates and retries on the next pan, and with
 *     real users they almost never fail.
 *  2. Nothing is reported from an automated browser (navigator.webdriver).
 *  3. An image failure is HELD until the page shows a human sign — a
 *     tap, click, key or scroll wheel — and only then sent. Crawlers
 *     that spoof webdriver still never touch the page, so their failures
 *     are simply never sent. Cost: a person who opens a page and leaves
 *     without touching it goes unrecorded. Note the row's created_at is
 *     then the moment of that first touch, not of the failure.
 */
const TILE_HOST = /(^|\.)tile\.openstreetmap\.org$/i;
const HUMAN_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel"] as const;
/** More than enough to show the problem; a page of broken thumbnails stays small. */
const MAX_HELD = 5;

let humanSeen = false;
let humanWatch = false;
const held: ClientErrorReport[] = [];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, typeof location !== "undefined" ? location.href : undefined).hostname;
  } catch {
    return null;
  }
}

function isAutomated(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.webdriver === true;
  } catch {
    return false;
  }
}

function watchForHuman(): void {
  if (humanWatch || typeof window === "undefined") return;
  humanWatch = true;
  const onHuman = () => {
    humanSeen = true;
    for (const ev of HUMAN_EVENTS) window.removeEventListener(ev, onHuman, true);
    for (const r of held.splice(0, held.length)) reportClientError(r);
  };
  for (const ev of HUMAN_EVENTS) {
    window.addEventListener(ev, onHuman, { capture: true, passive: true });
  }
}

/** True when this report should not be sent (now, or — if held — yet). */
function holdOrDropImage(report: ClientErrorReport, message: string): boolean {
  if (!/^Failed to load img\b/.test(message)) return false;
  const host = hostOf(report.source);
  if (host && TILE_HOST.test(host)) return true;
  if (isAutomated()) return true;
  if (humanSeen) return false;
  watchForHuman();
  if (held.length < MAX_HELD) held.push(report);
  return true;
}

/** Turn any thrown value into one short, useful line. */
function describe(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  if (error instanceof Error) {
    // TypeError: "Failed to fetch" is what a dropped connection, a
    // DNS failure and a CORS rejection all look like from here, so
    // the `online` flag below is what actually tells them apart.
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, 300);
  } catch {
    return String(error);
  }
}

/** Best-effort deploy fingerprint, so a spike can be tied to a build. */
function buildId(): string | null {
  try {
    const fromEnv = import.meta.env?.VITE_BUILD_ID as string | undefined;
    if (fromEnv) return String(fromEnv).slice(0, 40);
    /* No build-time define is configured (vite.config.ts is generated
     * by Lovable and we would rather not fight it), so fall back to
     * Vite's content hash in the entry bundle's filename. It changes
     * on every deploy, which is the only property we need.
     *
     * Read from the PERFORMANCE timeline, not the DOM. Beka
     * 2026-10-29: `build` came back null on every single row for four
     * days because the previous version queried
     * `script[type="module"][src]`, and on the deployed site that
     * selector matches nothing — TanStack Start injects the entry
     * differently. I confirmed it returns null against production.
     * The resource timeline always contains the entry chunk, so this
     * works wherever the markup puts it. */
    if (typeof performance?.getEntriesByType !== "function") return null;
    const entry = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .find((n) => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(n));
    const m = entry?.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    return m ? m[1].slice(0, 12) : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether to send, and how many suppressed repeats to attach.
 * Returns null when this report should be dropped.
 */
function admit(signature: string): { repeats: number; limitReached: boolean } | null {
  const now = Date.now();
  const prev = seen.get(signature);

  if (prev && now - prev.windowStartedAt < DEDUPE_WINDOW_MS) {
    prev.suppressed += 1;
    return null;
  }

  const repeats = prev?.suppressed ?? 0;
  seen.set(signature, { windowStartedAt: now, suppressed: 0 });

  if (sent >= MAX_REPORTS_PER_SESSION) {
    // Say so exactly once, so a truncated picture never looks like a
    // complete one when we read the logs later.
    if (limitAnnounced) return null;
    limitAnnounced = true;
    return { repeats, limitReached: true };
  }

  sent += 1;
  return { repeats, limitReached: false };
}

export function reportClientError(report: ClientErrorReport): void {
  try {
    if (typeof fetch !== "function") return;

    const message = describe(report.error);
    const status = report.status ?? null;
    const kind = report.kind ?? "network";

    if (kind === "resource" && holdOrDropImage(report, message)) return;

    // The host is part of a resource signature so that one broken photo
    // source cannot hide another inside the 60 s dedupe window.
    const host = kind === "resource" ? (hostOf(report.source) ?? "") : "";
    const verdict = admit(`${kind}|${report.where}|${message}|${status}|${host}`);
    if (!verdict) return;

    const body = JSON.stringify({
      where: report.where,
      message: verdict.limitReached
        ? `${message} [session report limit reached — further errors not sent]`
        : message,
      status,
      kind,
      // The single most valuable bit: it separates "the user's
      // network died" from "our backend is broken". Without it every
      // client report is ambiguous.
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      query: report.query ?? null,
      lang: report.lang ?? null,
      durationMs: report.durationMs ?? null,
      stack: report.stack ?? null,
      source: report.source ?? null,
      /* How many identical failures we swallowed before this one. 0 is
       * the normal case; a big number is itself the finding. */
      repeats: verdict.repeats,
      build: buildId(),
      /* Which page it happened on. For a global handler this is often
       * the only clue about what the user was doing. */
      url: typeof location !== "undefined" ? location.pathname + location.search : null,
    });

    // keepalive so the report still goes out if this fires while the
    // user is navigating away or closing the tab — exactly when the
    // interesting failures happen.
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* Reporting failed. Nothing sensible left to do — and trying
         again would risk a loop on a dead network. */
    });
  } catch {
    /* Rule 1. */
  }
}
