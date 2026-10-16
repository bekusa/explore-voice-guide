import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { logError } from "@/lib/errorLog.server";

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

/** Longest body we will even look at. A client report is ~200 bytes. */
const MAX_BODY_BYTES = 4_000;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

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
        const status =
          typeof body.status === "number" && Number.isFinite(body.status) ? body.status : null;

        await logError({
          service: "client",
          route: where,
          status,
          // A browser-side failure is almost always transport, and
          // classifyStatus() would read a null status as "unknown".
          // `offline: true` in the context is the discriminator that
          // separates "their wifi died" from "our Worker broke".
          kind: "network",
          message,
          context: {
            where,
            online: typeof body.online === "boolean" ? body.online : null,
            lang: clip(body.lang, 16),
            query: clip(body.query, 120),
            durationMs:
              typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
                ? body.durationMs
                : null,
            // Which build the browser was running. A spike confined to
            // one build is the fastest way to spot a bad deploy.
            build: clip(body.build, 40),
            hint: "Reported BY THE BROWSER. The request may never have reached the Worker — check whether a matching server-side row exists at the same minute.",
          },
        });

        return ok();
      },
    },
  },
});
