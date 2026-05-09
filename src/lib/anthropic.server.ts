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

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `[anthropic] ${res.status} ${res.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ""}`,
    );
  }

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

/**
 * Tolerant JSON parser for Claude responses. Handles:
 *   1. Pure JSON — happy path.
 *   2. Markdown-fenced JSON ( ```json ... ``` ) — Claude breaks this
 *      rule occasionally, especially under load or with terse prompts.
 *   3. Leading prose / commentary before the JSON object — strips
 *      everything up to the first `{` or `[`.
 * Returns undefined on anything unparseable so callers can decide
 * whether to surface an empty result or retry.
 */
export function parseClaudeJson(text: string): unknown {
  const trimmed = text.trim();

  // Pure JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // Strip markdown fence (```json ... ``` or ``` ... ```)
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }

  // Locate first `{` or `[` and try to parse from there
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace > 0) {
    const tail = trimmed.slice(firstBrace);
    try {
      return JSON.parse(tail);
    } catch {
      /* fall through */
    }
  }

  return undefined;
}
