/**
 * Direct Anthropic Messages API wrapper, server-side only.
 *
 * Replaces the n8n /webhook/{attractions,guide} workflows we used to
 * hit. Net wins: ~300-800ms latency removed per call (no EU webhook
 * hop), no n8n cloud quota, and the prompt now lives in version-
 * controlled TypeScript instead of n8n's UI.
 *
 * Required env var (set in Lovable Project Secrets):
 *   ANTHROPIC_API_KEY → an Anthropic console key with Messages
 *                       permission. Same key Beka used to keep in
 *                       n8n credentials, just moved.
 *
 * If the key is missing we throw — there is no graceful fallback,
 * because the upstream cache is the only other source of attractions
 * data and we want the route handler to surface the misconfiguration
 * clearly instead of silently returning empty results.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The Lovable-generated Database type doesn't know the api_logs table
// (same situation as trips/trip_items in tripsStore.ts — the generated
// types only cover profiles/saved_tours). Widen ONCE for the telemetry
// insert; ApiLogRow keeps the write shape honest. Delete this cast when
// the generated types learn the table.
const telemetryDb = supabaseAdmin as unknown as SupabaseClient;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Default model. Sonnet-class for the narrated guide (and any caller
 * that doesn't override `model:`) because Beka reverted from Haiku —
 * Haiku's terse style was hurting the narrated guide quality.
 *
 * 2026-07-25: tried "claude-sonnet-5" as default. 2026-07-30 REVERTED
 * to "claude-sonnet-4-5" — the Anthropic Console logs show ZERO
 * sonnet-5 requests ever reached the account (it isn't enabled here
 * yet), so every call wasted a failed sonnet-5 attempt (+ its retry
 * backoff) BEFORE falling back to sonnet-4-5, and the two-call total
 * pushed /api/attractions past the Cloudflare Worker's ~100 s limit →
 * intermittent 502 "AI temporarily busy". sonnet-4-5 direct is the
 * proven single-call path. Flip back to sonnet-5 only once the
 * Console shows sonnet-5 requests succeeding on this account.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-5";

export type ClaudeCallOpts = {
  /** Optional model override; defaults to DEFAULT_MODEL. */
  model?: string;
  /** System prompt — tone, schema, hard rules. Stays static across requests. */
  system: string;
  /** Per-request user message — query, language, count, etc. */
  user: string;
  /** Cap on Claude's output length. Defaults to 4096; bump for the long guide narrative. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.7 — we want some warmth, not boilerplate. */
  temperature?: number;
  /** Optional call label (e.g. "attractions", "guide") recorded in api_logs telemetry. */
  label?: string;
};

/**
 * Issue a single Messages API call and return Claude's text content.
 * Throws on missing env var, network failure, non-200 response, or
 * an empty/non-text response. Caller is responsible for parsing the
 * returned text as JSON (most prompts ask Claude to emit JSON).
 */
/**
 * Known-good fallback. Live incident 2026-07-25: with this account's
 * API key, claude-haiku-4-5 and claude-sonnet-4-5 work, but BOTH
 * claude-opus-4-8 and claude-sonnet-5 fail terminally (every
 * /api/attractions and /api/guide generation 502'd while photo /
 * classify routes were healthy). Until the account-side cause is
 * confirmed in the Anthropic Console, callClaude retries a failed
 * call ONCE on this proven model so users never see "AI is
 * temporarily busy" because of a model-availability problem. The
 * console.warn below records the primary model's real error for
 * diagnosis.
 */
const FALLBACK_MODEL = "claude-sonnet-4-5";

export async function callClaude(opts: ClaudeCallOpts): Promise<string> {
  // Telemetry wrapper (2026-07-17): time every Anthropic call end-to-end
  // (including retries + the model fallback below) and record the
  // outcome to public.api_logs. Powers the "API health" panel on the
  // Lokali analytics dashboard — error rate + avg/p95 latency — data the
  // Anthropic Console shows but does NOT expose over any API. The insert
  // is awaited (a few ms next to a multi-second generation) so a
  // Cloudflare Worker doesn't drop it as unfinished background work, and
  // it never throws: a logging failure must not break a real call.
  const started = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;
  try {
    const text = await callClaudeWithFallback(opts);
    await logApiCall({
      label: opts.label ?? null,
      model,
      duration_ms: Date.now() - started,
      ok: true,
      status: 200,
      error: null,
    });
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logApiCall({
      label: opts.label ?? null,
      model,
      duration_ms: Date.now() - started,
      ok: false,
      status: extractStatus(message),
      error: message.slice(0, 500),
    });
    throw err;
  }
}

type ApiLogRow = {
  label: string | null;
  model: string;
  duration_ms: number;
  ok: boolean;
  status: number | null;
  error: string | null;
};

// Best-effort telemetry insert. Any Supabase/env problem is swallowed —
// logging must never surface to callers or break a generation.
async function logApiCall(row: ApiLogRow): Promise<void> {
  try {
    await telemetryDb.from("api_logs").insert(row);
  } catch (e) {
    console.warn("[anthropic] api_logs insert failed", e);
  }
}

// Pull an HTTP-ish status out of a callClaude error message. Those are
// formatted like "[anthropic] 429 Too Many Requests …", so the first
// 4xx/5xx token is the upstream status. null when none is present.
function extractStatus(message: string): number | null {
  const m = message.match(/\b([45]\d\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}

async function callClaudeWithFallback(opts: ClaudeCallOpts): Promise<string> {
  try {
    return await callClaudeOnce(opts);
  } catch (err) {
    const model = opts.model ?? DEFAULT_MODEL;
    if (model === FALLBACK_MODEL) throw err;
    console.warn(
      `[anthropic] model ${model} failed — falling back to ${FALLBACK_MODEL}. Primary error: ${
        err instanceof Error ? err.message.slice(0, 300) : String(err)
      }`,
    );
    return callClaudeOnce({ ...opts, model: FALLBACK_MODEL });
  }
}

async function callClaudeOnce(opts: ClaudeCallOpts): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("[anthropic] ANTHROPIC_API_KEY missing — set it in Lovable Project Secrets");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 4096;
  const temperature = opts.temperature ?? 0.7;

  // Up to 3 attempts: initial + 2 retries on 429 (rate limit) or 5xx
  // (transient upstream). Beka hit the 10K-tok/min budget once when
  // a fresh-cache Time Machine generation overlapped with a chunked
  // translation pass; surfacing the bare 429 to the UI looked broken
  // when in reality we just needed to wait ~30 s. Anthropic returns
  // `retry-after` in seconds on 429; honour that when present, else
  // back off exponentially with a small ceiling.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const block = (data.content ?? []).find((b) => b?.type === "text");
      const text = block?.text ?? "";
      if (!text.trim()) {
        throw new Error("[anthropic] empty text content in response");
      }
      return text;
    }

    const errText = await res.text().catch(() => "");
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (retryable && attempt < MAX_ATTEMPTS) {
      // Anthropic spec: 429 + 5xx may include `retry-after` in
      // seconds. Cap at 45 s so we don't blow the worker's 100 s
      // budget on a single sleep; if the cap isn't enough we'll
      // bubble up the error on the final attempt.
      const ra = parseInt(res.headers.get("retry-after") ?? "", 10);
      const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(45, ra) * 1000 : 2000 * attempt;
      console.warn(
        `[anthropic] ${res.status} on attempt ${attempt}/${MAX_ATTEMPTS} — retrying in ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    // Beka 2026-09-05 diagnostic: record WHICH Cloudflare edge the
    // call went out from.
    //
    // Why: he hit an instant `403 forbidden / "Request not allowed"`
    // on both Sonnet and Haiku (8 ms and 33 ms — rejected before any
    // model ran). That is not a credit problem (low balance is a 400
    // with "Your credit balance is too low") and not a model problem
    // (an unknown/retired model is a 404 not_found_error). It is the
    // signature Anthropic returns when the CALLING IP sits in an
    // unsupported country.
    //
    // Our Worker's egress is whatever Cloudflare edge served the user,
    // so a visitor near a non-supported region can push the outbound
    // call into that region even though Beka and the account are in
    // Georgia (which IS supported; Russia is not).
    //
    // api.anthropic.com is itself behind Cloudflare, so its response
    // carries a `cf-ray` whose suffix is the colo code — DME/SVO =
    // Moscow, IST = Istanbul, FRA = Frankfurt, TBS = Tbilisi. Appending
    // it to the error message means the NEXT failure identifies the
    // edge with no extra call, no cost, and no schema migration (it
    // rides along in api_logs.error).
    const cfRay = res.headers.get("cf-ray");
    const colo = cfRay?.split("-")[1];
    throw new Error(
      `[anthropic] ${res.status} ${res.statusText}` +
        (colo ? ` [edge:${colo}]` : "") +
        (errText ? ` — ${errText.slice(0, 300)}` : ""),
    );
  }

  // Unreachable — the loop either returns or throws. TS needs the
  // explicit throw here because it can't prove the loop always exits.
  throw new Error("[anthropic] exhausted retries");
}

/**
 * Tolerant JSON parser for Claude responses. Handles:
 *   1. Pure JSON — happy path.
 *   2. Markdown-fenced JSON ( ```json ... ``` ) — Claude breaks this
 *      rule occasionally, especially under load or with terse prompts.
 *   3. Leading prose / commentary before the JSON object — strips
 *      everything up to the first `{` or `[`.
 *   4. Unescaped control characters (real \n \r \t) inside string
 *      values — Sonnet emits these constantly when narrating long
 *      multi-paragraph stories, and strict JSON.parse rejects them.
 *      We re-escape on the second pass.
 * Returns undefined on anything unparseable so callers can decide
 * whether to surface an empty result or retry.
 */
export function parseClaudeJson(text: string): unknown {
  const trimmed = text.trim();

  // 1. Pure JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // 2. Same again, but with control-char repair inside strings —
  // catches "story": "First paragraph.\n\nSecond paragraph." where
  // the \n is a real newline in the wire bytes (Sonnet does this on
  // every long-form payload).
  try {
    return JSON.parse(repairJsonStrings(trimmed));
  } catch {
    /* fall through */
  }

  // 3. Strip markdown fence (```json ... ``` or ``` ... ```)
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    const inner = fence[1].trim();
    try {
      return JSON.parse(inner);
    } catch {
      /* fall through */
    }
    try {
      return JSON.parse(repairJsonStrings(inner));
    } catch {
      /* fall through */
    }
  }

  // 4. Locate first `{` or `[` and try to parse from there
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace > 0) {
    const tail = trimmed.slice(firstBrace);
    try {
      return JSON.parse(tail);
    } catch {
      /* fall through */
    }
    try {
      return JSON.parse(repairJsonStrings(tail));
    } catch {
      /* fall through */
    }
  }

  return undefined;
}

/**
 * Walk the text, and inside JSON string literals re-escape unescaped
 * control characters (real \n, \r, \t, plus stray backslashes that
 * aren't part of a valid escape). Untouched outside strings so the
 * JSON structure itself isn't disturbed. Mirror of the same helper
 * in src/lib/api.ts client-side.
 */
function repairJsonStrings(text: string): string {
  let inStr = false;
  let escape = false;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        out += c;
        escape = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inStr = false;
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        continue;
      }
      if (c === "\r") {
        out += "\\r";
        continue;
      }
      if (c === "\t") {
        out += "\\t";
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  return out;
}
