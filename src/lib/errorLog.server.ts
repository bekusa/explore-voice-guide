/**
 * Server-side error logging. Beka 2026-10-03.
 *
 * ── Why this file exists ──────────────────────────────────────────
 * Azure Speech returned 401 on every TTS call for five days and there
 * was no way to know. The app's only telemetry was `api_logs`, which
 * records Anthropic calls and nothing else; everything else failed
 * into a `console.warn` that nobody can read in a Cloudflare Worker.
 * The user got a raw "HTTP 502: {"error":"Azure Speech 401"}" toast
 * and we got silence.
 *
 * Beka: "ილოგებოდეს ესეთი ერორები და ნებისმიერი ერორი საერთოდ."
 *
 * ── The two rules ─────────────────────────────────────────────────
 * 1. LOGGING MUST NEVER BREAK THE REQUEST. Every function here
 *    swallows its own failures. A telemetry outage must not become a
 *    user-visible outage — that would be a strictly worse bug than
 *    the one we are trying to see.
 *
 * 2. MUST BE AWAITED. On Cloudflare Workers a floating promise is
 *    killed the moment the Response is returned, so `void logError()`
 *    writes nothing. That exact mistake already cost this project a
 *    silently-empty classification cache and, later, a photo cache
 *    that never recorded misses. Callers await.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Same widening cast the other telemetry writers use — the
// Lovable-generated Database type only knows profiles/saved_tours.
const db = supabaseAdmin as unknown as SupabaseClient;

/** Coarse bucket for grouping failures in queries. */
export type ErrorKind =
  /** Credentials rejected — 401/403. The key is wrong, expired or revoked. */
  | "auth"
  /** Rate limited or out of credit — 429, or an explicit quota message. */
  | "quota"
  /** We gave up waiting, or the upstream did. */
  | "timeout"
  /** Answered, but with something unusable (empty body, unparseable JSON). */
  | "bad-response"
  /** Never reached them: DNS, TLS, connection reset. */
  | "network"
  /** Our own bug or an unclassified upstream status. */
  | "unknown";

export type LogErrorInput = {
  /** 'azure-speech' | 'anthropic' | 'google-places' | 'gemini' | … */
  service: string;
  /** Our route, e.g. "/api/tts". */
  route?: string;
  status?: number | null;
  kind?: ErrorKind;
  message: string;
  context?: Record<string, unknown>;
  durationMs?: number;
};

/**
 * Strip anything that looks like a credential before it reaches the
 * database.
 *
 * Upstream error bodies quote back what you sent them more often than
 * you would like, and this table is meant to be browsed casually in
 * the Supabase UI. A log that leaks the key it was reporting on would
 * turn a diagnostic into an incident.
 */
function redact(s: string): string {
  return (
    s
      // Google API keys.
      .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza…REDACTED")
      // Anthropic keys.
      .replace(/sk-ant-[0-9A-Za-z_-]{10,}/g, "sk-ant-…REDACTED")
      // Azure Speech keys and other 32-char hex secrets.
      .replace(/\b[0-9a-f]{32,}\b/gi, "…REDACTED")
      // Supabase / JWT-shaped tokens.
      .replace(/eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+/g, "jwt…REDACTED")
      // Anything after a key-ish query parameter.
      .replace(/([?&](?:key|api[-_]?key|token|secret)=)[^&\s"']+/gi, "$1REDACTED")
  );
}

/**
 * Classify an upstream HTTP status into a kind.
 *
 * The distinction that matters most here is 401/403 vs 429 vs 5xx:
 * "your key is wrong" needs a human in a portal, "you're over quota"
 * needs waiting or money, and "their server broke" needs a retry.
 * Lumping them all into "502 Bad Gateway" — which is what this app
 * did — makes all three look like the same transient blip.
 */
export function classifyStatus(status: number | null | undefined): ErrorKind {
  if (status == null) return "network";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "unknown";
  if (status >= 400) return "bad-response";
  return "unknown";
}

/**
 * Record a failure. Safe to call from anywhere on the server.
 *
 * MUST be awaited — see the header. Returns nothing and throws
 * nothing, so a caller can `await logError(...)` on an error path
 * without a try/catch of its own.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  const kind = input.kind ?? classifyStatus(input.status);
  // Mirror to the Worker console as well. Cloudflare's live tail is
  // the only thing available when the database itself is the problem.
  try {
    console.warn(
      `[${input.service}] ${input.route ?? ""} ${input.status ?? ""} ${kind}: ${input.message}`.trim(),
    );
  } catch {
    /* console unavailable */
  }

  try {
    await db.from("error_logs").insert({
      service: input.service,
      route: input.route ?? null,
      status: input.status ?? null,
      kind,
      message: redact(String(input.message)).slice(0, 2000),
      context: input.context ? JSON.parse(redact(JSON.stringify(input.context))) : null,
      duration_ms: input.durationMs ?? null,
    });
  } catch (e) {
    // Deliberately terminal. If telemetry can't write, the request
    // still has to succeed — see rule 1 in the header.
    try {
      console.warn("[errorLog] insert failed", e);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wrap an unknown thrown value into a message + kind.
 *
 * `catch (err)` gives `unknown`, and the difference between an
 * AbortError (we timed out) and a TypeError (DNS/TLS died) is exactly
 * the thing worth preserving — it is the difference between "Azure is
 * slow" and "Azure is unreachable", which is the question Beka asked
 * about in the first place.
 */
export function describeThrown(err: unknown): { message: string; kind: ErrorKind } {
  if (err instanceof Error) {
    const name = err.name ?? "";
    if (name === "AbortError" || /timed? ?out/i.test(err.message)) {
      return { message: `${name}: ${err.message}`, kind: "timeout" };
    }
    return { message: `${name}: ${err.message}`, kind: "network" };
  }
  return { message: String(err), kind: "unknown" };
}
