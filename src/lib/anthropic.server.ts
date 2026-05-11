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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Default model. Sonnet for both attractions and guide because Beka
 * reverted from Haiku — Haiku's terse style was hurting the narrated
 * guide quality. If we need to dial cost down later, override per-
 * caller via `model:` in callClaude().
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
};

/**
 * Issue a single Messages API call and return Claude's text content.
 * Throws on missing env var, network failure, non-200 response, or
 * an empty/non-text response. Caller is responsible for parsing the
 * returned text as JSON (most prompts ask Claude to emit JSON).
 */
export async function callClaude(opts: ClaudeCallOpts): Promise<string> {
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

    throw new Error(
      `[anthropic] ${res.status} ${res.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ""}`,
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
