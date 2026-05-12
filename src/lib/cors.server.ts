/**
 * CORS helpers for /api/* TanStack Start handlers.
 *
 * Why this exists: when we wrap the web app with Capacitor for the App
 * Store / Play Store, the WebView's effective origin changes:
 *   - iOS Capacitor:     capacitor://localhost
 *   - Android Capacitor:  https://localhost
 *   - Web preview:       lokali-app.lovable.app
 *   - Dev:               localhost:3000
 *
 * Without explicit CORS headers, the browser blocks every cross-origin
 * fetch from a capacitor:// origin to our Cloudflare Workers domain.
 * That means attractions, guide, photo, TTS, translate — every API
 * call — silently fails in the packaged app. Verified during the
 * pre-Capacitor security review.
 *
 * We use Access-Control-Allow-Origin: * because:
 *   - These endpoints are public (no cookie auth — Supabase auth uses
 *     Bearer tokens in JS, not cookies). The wildcard is therefore
 *     safe; we're not exposing user-scoped state via the browser's
 *     credential-bearing cross-origin path.
 *   - It covers all four origins above with no per-platform
 *     allowlist to maintain.
 *   - If we ever need to tighten this (e.g. block hotlinking by other
 *     mobile apps) we can replace the literal here with an origin
 *     allowlist; nothing in the call sites changes.
 *
 * Usage in a route:
 *
 *   import { corsJson, corsPreflight } from "@/lib/cors.server";
 *
 *   export const Route = createFileRoute("/api/foo")({
 *     server: {
 *       handlers: {
 *         OPTIONS: async () => corsPreflight(),
 *         GET: async ({ request }) => corsJson({ ok: true }),
 *       },
 *     },
 *   });
 */

/**
 * The minimum set of headers every /api/* response needs. Kept in one
 * place so a future tightening (Origin allowlist, narrower methods,
 * Vary header for caches) lands once.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  // 24h preflight cache — the Capacitor WebView reuses the OPTIONS
  // response so we don't pay the roundtrip on every fetch.
  "Access-Control-Max-Age": "86400",
};

/**
 * 204 No Content response for OPTIONS preflight. Every route that
 * handles GET / POST also needs to handle OPTIONS or the browser
 * blocks the actual request.
 */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * JSON response with CORS + Content-Type set. Drop-in replacement for
 * `new Response(JSON.stringify(payload), { headers: { "Content-Type":
 * "application/json" } })` in the api routes.
 *
 * Extra headers (Cache-Control, etc.) from `init.headers` are merged
 * on top of the CORS defaults so callers can still set their own.
 */
export function corsJson(payload: unknown, init?: ResponseInit): Response {
  const headers = new Headers({
    ...CORS_HEADERS,
    "Content-Type": "application/json",
  });
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((v, k) => headers.set(k, v));
  }
  return new Response(JSON.stringify(payload), {
    status: init?.status,
    statusText: init?.statusText,
    headers,
  });
}

/**
 * Plain Response with CORS headers — useful when the body isn't JSON
 * (audio blobs from /api/tts, redirects, etc.). Same header-merge
 * semantics as corsJson.
 */
export function corsResponse(body: BodyInit | null, init?: ResponseInit): Response {
  const headers = new Headers(CORS_HEADERS);
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((v, k) => headers.set(k, v));
  }
  return new Response(body, {
    status: init?.status,
    statusText: init?.statusText,
    headers,
  });
}
