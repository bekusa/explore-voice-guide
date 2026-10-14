/**
 * Report a browser-side failure to /api/client-error.
 *
 * Beka 2026-10-15: "დღეს დამიწერა AI temporary busy, მაგრამ ლოგებში
 * ვერ ამოვიკითხე."
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
 */

/** What the browser can tell us that the server could not. */
export type ClientErrorReport = {
  /** Where in the app, e.g. "results:fetchAttractions". */
  where: string;
  /** The thrown value. Anything — it is normalised here. */
  error: unknown;
  /** HTTP status, when the failure was a response rather than a throw. */
  status?: number | null;
  /** The search the user was doing, for reproducing it. */
  query?: string | null;
  lang?: string | null;
  /** How long the attempt took before giving up. */
  durationMs?: number | null;
};

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

export function reportClientError(report: ClientErrorReport): void {
  try {
    if (typeof fetch !== "function") return;

    const body = JSON.stringify({
      where: report.where,
      message: describe(report.error),
      status: report.status ?? null,
      // The single most valuable bit: it separates "the user's
      // network died" from "our backend is broken". Without it every
      // client report is ambiguous.
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      query: report.query ?? null,
      lang: report.lang ?? null,
      durationMs: report.durationMs ?? null,
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
