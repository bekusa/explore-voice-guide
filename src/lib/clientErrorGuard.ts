/**
 * Catch the errors nobody wrote a `catch` for.
 *
 * Beka 2026-10-25: "მჭირდება რომ ყველა ტიპის ერორი ილოგებოდეს და ამას
 * ვხედავდეთ."
 *
 * ── What was missing ─────────────────────────────────────────────
 * Before this file, `reportClientError` was called from exactly ONE
 * place in the app (results.tsx). Everything else in the browser
 * failed silently:
 *
 *   - an uncaught TypeError anywhere in a component or handler
 *   - a rejected promise nobody awaited — the single most common
 *     shape of bug in this codebase, since most fetches are fired
 *     with `void` and a `.catch()` that swallows
 *   - an <img> or chunk that 404s after a deploy (a stale
 *     service-worker cache pointing at a bundle that no longer
 *     exists looks exactly like this)
 *
 * The worst of these is the white screen: React throws while
 * rendering, the user sees nothing at all, and we recorded nothing at
 * all either. That one is handled by the root route's errorComponent;
 * this file covers the other three.
 *
 * ── Design constraints ───────────────────────────────────────────
 * 1. Never throw. A reporter that crashes the page it is watching is
 *    strictly worse than no reporter. Every branch is wrapped.
 * 2. Never re-enter. If reporting itself threw and that throw reached
 *    window.onerror, we would loop until the tab died. `installed`
 *    plus the dedupe inside reportClientError both guard this.
 * 3. Install once, client-side only. On the server `window` does not
 *    exist and SSR must not touch it.
 *
 * Volume control (dedupe + a per-session cap) lives in
 * reportClientError, deliberately — see the note in that file.
 */
import { reportClientError } from "@/lib/reportClientError";

let installed = false;

/** Shape pushed by the inline boot script in __root.tsx. */
type EarlyError = {
  /** "js" | "resource" */
  k?: string;
  /** message */
  m?: string;
  /** source / url */
  s?: string | null;
  /** stack */
  st?: string | null;
};

/**
 * Drain the pre-hydration buffer.
 *
 * The inline boot script starts listening before any other script can
 * run, so it sees the failures this module cannot: a chunk that 404s,
 * a throw during hydration. It only collects; sending is here, where
 * the dedupe and session cap live.
 */
function drainEarlyErrors(): void {
  try {
    const w = window as typeof window & { __lokaliEarlyErrors?: EarlyError[] };
    const buffered = w.__lokaliEarlyErrors;
    if (!Array.isArray(buffered) || buffered.length === 0) return;
    // Empty it before reporting, so a throw inside the loop cannot
    // leave the same entries to be sent again on a remount.
    const items = buffered.splice(0, buffered.length);
    for (const it of items) {
      reportClientError({
        where: it.k === "resource" ? "boot:resource" : "boot:error",
        kind: it.k === "resource" ? "resource" : "js",
        error: it.m ?? "unknown error",
        source: it.s ?? null,
        stack: it.st ?? null,
      });
    }
  } catch {
    /* Rule 1. */
  }
}

/** `app.js:120:9`, when the browser gives us that much. */
function position(e: ErrorEvent): string | null {
  if (!e.filename) return null;
  const line = typeof e.lineno === "number" ? e.lineno : "?";
  const col = typeof e.colno === "number" ? e.colno : "?";
  return `${e.filename}:${line}:${col}`;
}

/**
 * A failed <img>/<script>/<link> fires an `error` event that BUBBLES
 * to window but has no `error` property — the tell is that the target
 * is an element rather than the window. These are worth recording:
 * after a deploy they mean the service worker is handing out a stale
 * index pointing at bundles that no longer exist, which presents to
 * the user as a blank or half-broken page.
 */
function resourceUrl(target: EventTarget | null): string | null {
  if (!target || typeof (target as Element).tagName !== "string") return null;
  const el = target as HTMLImageElement & HTMLScriptElement & HTMLLinkElement;
  return el.src || el.href || null;
}

export function installClientErrorGuard(): void {
  try {
    if (installed) return;
    if (typeof window === "undefined") return;
    installed = true;

    // Anything the boot script caught before the bundle was ready.
    drainEarlyErrors();

    window.addEventListener(
      "error",
      (event: Event) => {
        try {
          const e = event as ErrorEvent;

          // Resource load failure — different event shape, different
          // meaning, so it gets its own kind rather than being filed
          // as a JS exception with an empty message.
          const url = resourceUrl(event.target);
          if (url && event.target !== window) {
            reportClientError({
              where: "window:resource",
              kind: "resource",
              error: `Failed to load ${(event.target as Element).tagName.toLowerCase()}`,
              source: url.slice(0, 300),
            });
            return;
          }

          reportClientError({
            where: "window:error",
            kind: "js",
            // `e.error` carries the real Error (with a stack) when the
            // browser has it; `e.message` is the fallback for
            // cross-origin scripts, which are reported as the useless
            // but still countable "Script error."
            error: e.error ?? e.message ?? "unknown error",
            source: position(e),
            stack: e.error instanceof Error ? (e.error.stack ?? null) : null,
          });
        } catch {
          /* Rule 1. */
        }
      },
      // Capture phase: resource errors do not bubble in all engines,
      // and this is the only way to see them reliably.
      true,
    );

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      try {
        const reason: unknown = event?.reason;
        reportClientError({
          where: "window:unhandledrejection",
          kind: "js",
          error: reason ?? "unhandled rejection (no reason)",
          stack: reason instanceof Error ? (reason.stack ?? null) : null,
        });
      } catch {
        /* Rule 1. */
      }
    });
  } catch {
    /* Rule 1 — if even installing failed, the app still runs. */
  }
}
