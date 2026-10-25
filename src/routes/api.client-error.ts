import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { logError, type ErrorKind } from "@/lib/errorLog.server";

/**
 * POST /api/client-error — record a failure that happened in the
 * BROWSER, where our server-side telemetry cannot see it.
 *
 * Beka 2026-10-15: "დღეს დამიწერა AI temporary busy, მაგრამ ლოგებში
 * ვერ ამოვიკითხე." He was right, and the reason was structural.
 *
 * Every piece of telemetry this project had ran on the server. That
 * covers a Worker that fails — but NOT a request that never reached
 * the Worker, or a response the browser could not use:
 *
 *   - the device was offline or the network dropped mid-request
 *   - the 120 s client AbortController fired
 *   - DNS / TLS / CORS failed before the Worker ran
 *   - the service worker served something stale or broken
 *   - the JSON came back malformed
 *
 * In every one of those the user saw "AI is temporarily busy" and we
 * recorded nothing at all. This endpoint closes that gap: the client
 * reports what it actually observed, and it lands in the same
 * `error_logs` table as everything else under `service = 'client'`,
 * so one query covers both halves of the system.
 *
 * ── Public endpoint, so it is deliberately boring ─────────────────
 * No auth (the users who hit these failures are often signed out).
 * Therefore: only a fixed set of fields is read, every string is
 * clipped, oversized bodies are dropped, and the response is always
 * `{ ok: true }` — it never reports whether the write succeeded, so
 * it is useless as a probe. `logError` redacts secrets before the
 * insert, which matters here because a client message could contain
 * a URL with a query string.
 *
 * Fire-and-forget from the caller's side, but awaited here: on
 * Cloudflare Workers a floating promise dies with the Response.
 */

/** Longest body we will even look at. A report with a stack is ~2 KB. */
const MAX_BODY_BYTES = 8_000;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Kinds the browser is allowed to assert.
 *
 * Whitelisted rather than passed through: this endpoint is public, and
 * an unbounded `kind` would let anyone invent buckets and make the
 * dashboard's group-by useless. Anything unrecognised becomes
 * "network", which is what every pre-2026-10-25 client sent and so
 * keeps old builds reporting correctly after this deploy.
 */
const ALLOWED_KINDS = new Set(["network", "js", "crash", "resource"]);

export const Route = createFileRoute("/api/client-error")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        // Always 200. A reporting endpoint that argues with the
        // client just produces a second error nobody can see.
        const ok = () => corsJson({ ok: true }, { status: 200 });

        let raw = "";
        try {
          raw = await request.text();
        } catch {
          return ok();
        }
        if (!raw || raw.length > MAX_BODY_BYTES) return ok();

        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return ok();
        }

        const where = clip(body.where, 80) ?? "unknown";
        const message = clip(body.message, 500) ?? "(no message)";
        const status = num(body.status);
        const durationMs = num(body.durationMs);

        const rawKind = clip(body.kind, 16);
        // Default "network" rather than "unknown": that is what every
        // build before 2026-10-25 meant by saying nothing at all.
        const kind = rawKind && ALLOWED_KINDS.has(rawKind) ? rawKind : "network";

        await logError({
          service: "client",
          route: where,
          status,
          // A transport failure has no status, and classifyStatus()
          // would read a null status as "unknown". The client tells us
          // the bucket instead; `online` in the context is what
          // separates "their wifi died" from "our Worker broke".
          kind: kind as ErrorKind,
          message,
          /* Fill the COLUMN, not just the context. Beka 2026-10-25 —
           * the dashboard groups by service/kind and averages
           * duration_ms, and because client rows only ever carried the
           * duration inside `context`, that column read blank for
           * exactly the rows whose timing mattered most. */
          ...(durationMs != null ? { durationMs } : {}),
          context: {
            where,
            online: typeof body.online === "boolean" ? body.online : null,
            lang: clip(body.lang, 16),
            query: clip(body.query, 120),
            durationMs,
            // Which build the browser was running. A spike confined to
            // one build is the fastest way to spot a bad deploy.
            build: clip(body.build, 40),
            // Page the failure happened on. For a global handler this
            // is often the only clue about what the user was doing.
            url: clip(body.url, 200),
            // `file.js:120:9`, or a React component stack.
            source: clip(body.source, 300),
            // Clipped hard: a stack is the most useful field here and
            // also the only one that can run to kilobytes.
            stack: clip(body.stack, 1_500),
            /* Identical failures inside the client's 60 s window
             * collapse into one row; this is how many were swallowed.
             * A large number is itself the finding — it means a loop,
             * not a one-off. */
            repeats: num(body.repeats) ?? 0,
            hint: "Reported BY THE BROWSER. The request may never have reached the Worker — check whether a matching server-side row exists at the same minute.",
          },
        });

        return ok();
      },
    },
  },
});
