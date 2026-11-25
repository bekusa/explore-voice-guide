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
 * Frankfurt relay for region-blocked calls. Beka 2026-11-04: "ეს
 * მოაგვარე."
 *
 * A Cloudflare Worker's outbound fetch leaves from whichever edge
 * served the READER, so someone browsing near an unsupported country
 * pushes our call to Anthropic out of that country and gets:
 *
 *     403 { "type": "forbidden", "message": "Request not allowed" }
 *
 * By edge colo in error_logs: HKG (Hong Kong) 103 events since 5 Oct,
 * DME (Moscow) 17 in a single day, KBP (Kyiv) 21 in one burst. Hong
 * Kong, mainland China and Russia are not on Anthropic's supported
 * list. Smart Placement was tried first and does not fix it — it
 * moves the Worker toward the origin, not the egress country.
 *
 * The Supabase project is eu-central-1 (Frankfurt) and Germany IS
 * supported, so relaying through it always presents a German IP.
 *
 * ── Only on 403, never by default ────────────────────────────────
 * The overwhelming majority of calls succeed on the direct path.
 * Routing everything through Frankfurt would add a hop to every
 * request and make Supabase a hard dependency of the core feature
 * for no benefit. So the relay is a RETRY, taken only when Anthropic
 * has already refused us for region — the one case it fixes.
 */
const ANTHROPIC_PROXY_URL =
  "https://dwyajguhgyjbgkpzjaln.supabase.co/functions/v1/anthropic-proxy";

/** Anthropic's exact wording when the calling IP is in a blocked country. */
function isRegionBlock(status: number, body: string): boolean {
  return status === 403 && /request not allowed/i.test(body);
}

/**
 * Default model. Sonnet-class for the narrated guide and the city
 * lists (and any caller that doesn't override `model:`) because Beka
 * reverted from Haiku — Haiku's terse style was hurting the narrated
 * guide quality.
 *
 * 2026-11-25: "claude-sonnet-4-5" → "claude-sonnet-4-6". Anthropic
 * retires Sonnet 4.5 on 2026-11-30; after that date every 4.5 call
 * fails, which would break each guide / city list that is not
 * already cached. Beka chose Sonnet 4.6 over Anthropic's suggested
 * replacement (Sonnet 5.5): it is the closest to what the app has
 * been writing with — same request shape, same price. It is not
 * retired before 2027-02-17 per Anthropic's deprecations page, so
 * this needs doing again; the 5.x path below is already in place
 * for that day (change this one constant to "claude-sonnet-5-5").
 *
 * Why the July attempts at "claude-sonnet-5" / "claude-opus-4-8"
 * failed (the old note here blamed the account): the 5.x family
 * REJECTS `temperature` with a 400, and this wrapper always sent
 * one. buildRequestBody() below shapes the request per model
 * family, so a 5.x model works as a single call when it is chosen.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Claude 5.x (Sonnet 5.5, Opus 5.5, Haiku 5.5, …) takes a different request shape. */
function isGen5(model: string): boolean {
  return /^claude-[a-z]+-5(-|$)/.test(model);
}

/**
 * One request body per model family.
 *
 * Claude 4.x and older: `temperature` is sent, there is no thinking
 * unless asked for.
 *
 * Claude 5.x (migration guide, platform.claude.com/docs/en/models/
 * sonnet-5-5/migration-guide):
 *  - sampling parameters (`temperature`, `top_p`, `top_k`) are a 400;
 *  - a request without a `thinking` field THINKS, and the thinking is
 *    billed and counted inside `max_tokens`. Our prompts are single
 *    JSON generations on a ~100 s Worker budget, so we ask for the
 *    lowest setting, `between_tools` (with no tools: text only — the
 *    old behaviour), at `medium` effort;
 *  - the same text is ~30 % more tokens than on 4.x, so the callers'
 *    `maxTokens` (tuned on 4.5) is raised by 35 % here, in one place,
 *    instead of at every call site.
 */
const GEN5_EFFORT = "medium";
const GEN5_TOKEN_FACTOR = 1.35;

type RequestBody = Record<string, unknown> & { model: string };

function buildRequestBody(model: string, opts: ClaudeCallOpts): RequestBody {
  const maxTokens = opts.maxTokens ?? 4096;
  const base = {
    model,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };
  if (isGen5(model)) {
    return {
      ...base,
      max_tokens: Math.ceil(maxTokens * GEN5_TOKEN_FACTOR),
      thinking: { type: "between_tools" },
      output_config: { effort: GEN5_EFFORT },
    };
  }
  return { ...base, max_tokens: maxTokens, temperature: opts.temperature ?? 0.7 };
}

/**
 * A 400 that names a parameter we sent means the model family moved
 * on again (the July outage was exactly this, undiagnosed for days).
 * Drop the named parameter and let the caller re-send once, rather
 * than failing every generation until someone reads the logs.
 * Returns true when it changed the body.
 */
function healRequestBody(body: RequestBody, status: number, errText: string): boolean {
  if (status !== 400) return false;
  if (/temperature|top_p|top_k|sampling/i.test(errText) && "temperature" in body) {
    delete body.temperature;
    return true;
  }
  if (/thinking/i.test(errText) && "thinking" in body) {
    delete body.thinking;
    return true;
  }
  if (/output_config|effort/i.test(errText) && "output_config" in body) {
    delete body.output_config;
    return true;
  }
  return false;
}

/** All text blocks of a Messages response, in order (5.x may put thinking blocks first). */
function textOf(data: { content?: Array<{ type?: string; text?: string }> }): string {
  return (data.content ?? [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

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
 * Fallback for callers that name ANOTHER model: when that model's
 * call fails for good, callClaude retries once on this one, so users
 * don't see "AI is temporarily busy" because of a model-side problem
 * (born in the 2026-07-25 incident). A call already on this model
 * has no further fallback.
 *
 * 2026-11-25: was "claude-sonnet-4-5", retired on 2026-11-30. Kept
 * equal to DEFAULT_MODEL (Beka: Sonnet 4.6 only), so the guide and
 * the city lists are never written by a second, different model.
 */
const FALLBACK_MODEL = "claude-sonnet-4-6";

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
    const out = await callClaudeWithFallback(opts);
    // `model` is the one that actually ANSWERED. When the fallback
    // had to step in, `error` says so on an ok row, so the dashboard
    // (and whoever migrates models next) can see it happening.
    await logApiCall({
      label: opts.label ?? null,
      model: out.model,
      duration_ms: Date.now() - started,
      ok: true,
      status: 200,
      error: out.note,
    });
    return out.text;
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

type ClaudeResult = { text: string; model: string; note: string | null };

async function callClaudeWithFallback(opts: ClaudeCallOpts): Promise<ClaudeResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  try {
    return { text: await callClaudeOnce(opts), model, note: null };
  } catch (err) {
    if (model === FALLBACK_MODEL) throw err;
    const why = err instanceof Error ? err.message.slice(0, 300) : String(err);
    console.warn(
      `[anthropic] model ${model} failed — falling back to ${FALLBACK_MODEL}. Primary error: ${why}`,
    );
    const text = await callClaudeOnce({ ...opts, model: FALLBACK_MODEL });
    return { text, model: FALLBACK_MODEL, note: `fallback from ${model}: ${why}`.slice(0, 500) };
  }
}

async function callClaudeOnce(opts: ClaudeCallOpts): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("[anthropic] ANTHROPIC_API_KEY missing — set it in Lovable Project Secrets");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const body = buildRequestBody(model, opts);
  let heals = 0;

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
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const text = textOf(
        (await res.json()) as { content?: Array<{ type?: string; text?: string }> },
      );
      if (!text.trim()) {
        throw new Error("[anthropic] empty text content in response");
      }
      return text;
    }

    const errText = await res.text().catch(() => "");

    // A parameter this model no longer accepts: drop it and re-send
    // at once (at most twice; does not use up a retry attempt).
    if (heals < 2 && healRequestBody(body, res.status, errText)) {
      heals++;
      attempt--;
      console.warn(
        `[anthropic] ${model} rejected a request parameter — re-sending without it: ${errText.slice(0, 200)}`,
      );
      continue;
    }
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

    /* Region block → retry once through Frankfurt. Beka 2026-11-04.
     *
     * Placed AFTER the retryable (429 / 5xx) branch on purpose: a
     * region refusal is not transient and re-sending it to the same
     * edge would fail identically every time. The only thing that
     * changes the outcome is changing where the call leaves from.
     *
     * Done inline rather than by recursing into callClaudeOnce so
     * this can never loop: one direct attempt, one relayed attempt,
     * then the error surfaces.
     *
     * Auth: the service-role key the server already holds. The Edge
     * Function has verify_jwt on, so without it Supabase's gateway
     * rejects the call before our code runs — the relay is not an
     * open door to Beka's Anthropic credit. */
    if (isRegionBlock(res.status, errText)) {
      const serviceKey =
        process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY ??
        "";
      if (serviceKey) {
        console.warn(
          `[anthropic] region-blocked at the edge — retrying via Frankfurt relay`,
        );
        try {
          const relayed = await fetch(ANTHROPIC_PROXY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              // Used only until ANTHROPIC_API_KEY is set as a secret
              // on the Edge Function; the function prefers its own.
              "x-anthropic-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(body),
          });

          if (relayed.ok) {
            const text = textOf(
              (await relayed.json()) as { content?: Array<{ type?: string; text?: string }> },
            );
            if (text.trim()) return text;
            throw new Error("[anthropic] empty text content via relay");
          }

          // The relay ran but Anthropic still refused. Worth saying
          // plainly, because it means the problem is NOT the region
          // and the diagnosis needs revisiting.
          const relayErr = await relayed.text().catch(() => "");
          throw new Error(
            `[anthropic] ${res.status} region-blocked; Frankfurt relay also failed ` +
              `(${relayed.status})` +
              (relayErr ? ` — ${relayErr.slice(0, 200)}` : ""),
          );
        } catch (relayFailure) {
          // A thrown relay error is already shaped above; anything
          // else (network, DNS) gets wrapped so the original region
          // block is still visible in the message.
          const msg =
            relayFailure instanceof Error ? relayFailure.message : String(relayFailure);
          if (msg.startsWith("[anthropic]")) throw relayFailure;
          throw new Error(
            `[anthropic] ${res.status} region-blocked; relay unreachable — ${msg.slice(0, 200)}`,
          );
        }
      }
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
