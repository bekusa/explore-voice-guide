import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, corsPreflight } from "@/lib/cors.server";
import { getCachedGuide, putCachedGuide } from "@/lib/sharedCache.server";
import { translateGuidePayload } from "@/lib/translatePayload.server";
import { callClaude, parseClaudeJson } from "@/lib/anthropic.server";
import { buildGuideSystem, buildGuideUser } from "@/lib/prompts";
import { normalizeToCanonicalEnglish } from "@/lib/normalizeAttractionName.server";

/**
 * /api/guide — Cloudflare Worker route that calls Anthropic Claude
 * directly (no more n8n hop) to generate the rich, narrated audio
 * guide for one attraction.
 *
 * Smart cache strategy (mirror of /api/attractions):
 *   1. Try direct cache hit on (name, lang, interest).
 *   2. Miss + lang != en → look up the English baseline, translate
 *      to userLang via the Lovable AI Gateway, cache, return.
 *   3. Miss everywhere → call Claude with the English prompt, cache
 *      the English version, translate if needed.
 *
 * One Claude generation per (name, interest) regardless of locale.
 *
 * `X-Cache: HIT|TRANSLATED|MISS|MISS-TRANSLATED|MISS-NO-TRANS` for
 * monitoring.
 */
export const Route = createFileRoute("/api/guide")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const rawKey = extractGuideKey(rawBody);
        const userLang = rawKey?.language ?? "en";
        const wantsTranslation = rawKey !== null && !isEnglish(userLang);

        // Canonical-English-name normalisation. The cache key for
        // "პაკ ხლონგ ტალატი" + ka MUST collide with the cache key for
        // "Khlong Lat Mayom Floating Market" + en; otherwise every
        // language pays the Sonnet generation cost independently and
        // we end up with parallel cache rows for the same attraction
        // (Beka spotted this in cached_guides). normalizeToCanonical-
        // English short-circuits for English inputs and uses an
        // in-memory cache, so the typical added cost is one cheap
        // Haiku call per cold-cache non-English request.
        const key = rawKey
          ? {
              ...rawKey,
              name: await normalizeToCanonicalEnglish(rawKey.name, userLang),
            }
          : null;

        // 1. Direct cache hit. Skip dud rows — empty {script: ""}
        // shouldn't short-circuit future requests.
        if (key) {
          const cached = await getCachedGuide(key);
          if (cached !== null && hasGuideScript(cached)) {
            return jsonResponse(cached, 200, "HIT");
          }
        }

        // 2. Miss; if non-English, try the English baseline + translate
        if (key && wantsTranslation) {
          const enKey = { ...key, language: "en" };
          const cachedEn = await getCachedGuide(enKey);
          if (cachedEn !== null && hasGuideScript(cachedEn)) {
            const { payload: translated, translated: ok } = await translateGuidePayload(
              cachedEn,
              userLang,
            );
            if (ok) await putCachedGuide(key, translated);
            return jsonResponse(translated, 200, ok ? "TRANSLATED" : "TRANSLATE-FAILED");
          }
        }

        // 3. Cache miss — call Claude directly. Always English baseline
        // so the cached row is reusable across every locale we serve.
        if (!key) {
          return jsonResponse({ script: "" }, 200, "MISS", "no-name");
        }
        try {
          const system = buildGuideSystem();
          const user = buildGuideUser({
            name: key.name,
            city: key.city,
            language: "en",
            interest: key.interest,
          });
          // Sonnet stays here even though it's slower — Beka's call:
          // "Attraction Guide დააბრუნე ისევ Sonnet-ზე, რადგან მანდ
          // ხარისხი მნიშვნელოვანია". The narrated guide is the
          // headline content the user actually listens to, and the
          // prose quality difference between Sonnet and Haiku is
          // audible on a 1500-3000 word script. The attractions list
          // stays on Haiku where the structured-list output reads the
          // same either way and the latency win is worth keeping.
          const text = await callClaude({ system, user, maxTokens: 8192, label: "guide" });
          // Post-process BEFORE caching so every downstream consumer
          // (cache rows, translations, the response) gets the cleaned
          // payload — see normalizeGuidePayload for what it fixes.
          const parsed = normalizeGuidePayload(parseClaudeJson(text));

          // Cache the English baseline only when there's actual
          // narration content — empty {script: ""} would pin a dud
          // row and short-circuit every future request forever.
          if (parsed !== undefined && hasGuideScript(parsed)) {
            const enKey = { ...key, language: "en" };
            await putCachedGuide(enKey, parsed);
          }

          // Empty / scriptless Claude output → friendly empty guide (NOT cached).
          if (parsed === undefined || !hasGuideScript(parsed)) {
            return jsonResponse({ script: "" }, 200, "MISS", "upstream-empty");
          }

          if (wantsTranslation) {
            const { payload: translated, translated: ok } = await translateGuidePayload(
              parsed,
              userLang,
            );
            if (ok) await putCachedGuide(key, translated);
            return jsonResponse(translated, 200, ok ? "MISS-TRANSLATED" : "MISS-NO-TRANS");
          }

          return jsonResponse(parsed, 200, "MISS");
        } catch (err) {
          // Anthropic call failed (key missing, rate limit, network)
          // — return an empty guide with a generic error string so the
          // client renders gracefully. Full error stays server-side.
          console.warn("[api.guide] upstream error", err);
          return new Response(
            JSON.stringify({
              script: "",
              error: "Service temporarily unavailable",
            }),
            {
              status: 502,
              headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});

/**
 * Pull a stable {name, language, interest} key out of the request
 * body. Returns null if name or language is missing.
 */
function extractGuideKey(rawBody: string): {
  name: string;
  city?: string;
  language: string;
  interest: string;
} | null {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    const name =
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.attraction === "string" && obj.attraction) ||
      (typeof obj.place_name === "string" && obj.place_name) ||
      "";
    const city =
      (typeof obj.city === "string" && obj.city.trim()) ||
      (typeof obj.host_city === "string" && obj.host_city.trim()) ||
      "";
    const language =
      (typeof obj.language === "string" && obj.language) ||
      (typeof obj.lang === "string" && obj.lang) ||
      "";
    const interest = (typeof obj.interest === "string" && obj.interest) || "editors";
    if (!name.trim() || !language.trim()) return null;
    return {
      name: name.trim(),
      city: city || undefined,
      language: language.trim(),
      interest: interest.trim(),
    };
  } catch {
    return null;
  }
}

function isEnglish(lang: string): boolean {
  return !lang || lang.toLowerCase().startsWith("en");
}

/* ───────── Post-generation normalisation (bug report 2026-08-08) ─────────
 * Two model-behaviour bugs are cheaper to fix deterministically here
 * than to keep re-prompting for:
 *
 *  BUG 4 — estimated_duration_seconds is written by the model and is
 *    routinely wrong (Sumela: 920 words → real TTS ~370 s, model said
 *    540 s, +45%). The UI shows that number, so it misleads users.
 *    We ignore the model's value and compute from the word count at
 *    the TTS rate the guide prompt itself targets (~150 wpm).
 *
 *  BUG 5 — spelled-out years ("nineteen twenty-three") slip through
 *    despite the prompt banning them. Gemini then translates them
 *    literally and the result is broken in Georgian and other
 *    locales. We rewrite them to digits BEFORE the translation step.
 */

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
/** Century leads that start a spoken year: "nineteen ..." = 19xx. */
const CENTURY: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/** "twenty-three" | "thirty" | "five" | "oh five" → 23 | 30 | 5 | 5 */
function spokenTail(tail: string): number | null {
  const t = tail.toLowerCase().replace(/-/g, " ").trim();
  if (!t) return null;
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    const w = parts[0];
    if (w in TENS) return TENS[w];
    if (w in ONES) return ONES[w];
    return null;
  }
  if (parts.length === 2) {
    const [a, b] = parts;
    // "oh five" → 5
    if ((a === "oh" || a === "o") && b in ONES && ONES[b] <= 9) return ONES[b];
    if (a in TENS && b in ONES && ONES[b] <= 9) return TENS[a] + ONES[b];
    return null;
  }
  return null;
}

/**
 * Replace spoken years with digits. Handles "nineteen twenty-three",
 * "eighteen ninety", "nineteen oh five", "twenty ten". Leaves prose
 * that merely starts with a century word ("nineteenth century",
 * "nineteen people") untouched — the tail must parse as a valid
 * year remainder for the rewrite to fire.
 */
export function digitizeSpokenYears(text: string): string {
  const centuryWords = Object.keys(CENTURY).join("|");
  const tailWords =
    Object.keys(TENS).join("|") + "|" + Object.keys(ONES).join("|") + "|oh|o";
  const re = new RegExp(
    `\\b(${centuryWords})[ -]((?:${tailWords})(?:[ -](?:${Object.keys(ONES).join("|")}))?)\\b`,
    "gi",
  );
  return text.replace(re, (match, centuryWord: string, tail: string) => {
    const century = CENTURY[centuryWord.toLowerCase()];
    const rest = spokenTail(tail);
    if (century === undefined || rest === null) return match;
    // "nineteen twenty" → 1920; "nineteen five" is not a real year
    // form, but "nineteen oh five" is — spokenTail already gates it.
    const year = century * 100 + rest;
    if (year < 1000 || year > 2099) return match;
    return String(year);
  });
}

/** Word count of the narration, used for the duration estimate. */
function countWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Apply BUG 4 + BUG 5 fixes to a parsed guide payload. Returns the
 * input untouched when it isn't a guide-shaped object, so callers can
 * pass parseClaudeJson's result straight through.
 */
export function normalizeGuidePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const obj = { ...(payload as Record<string, unknown>) };
  const script = obj.script;
  if (typeof script !== "string" || !script.trim()) return payload;

  // BUG 5 — digits everywhere the user reads or hears text.
  const fixedScript = digitizeSpokenYears(script);
  obj.script = fixedScript;
  for (const field of ["key_facts", "tips", "look_for"]) {
    const arr = obj[field];
    if (Array.isArray(arr)) {
      obj[field] = arr.map((v) => (typeof v === "string" ? digitizeSpokenYears(v) : v));
    }
  }
  if (typeof obj.title === "string") obj.title = digitizeSpokenYears(obj.title);

  // BUG 4 — server-computed duration at ~150 wpm (2.5 words/second),
  // rounded to the nearest 10 s. Overrides whatever the model wrote.
  const seconds = Math.round(countWords(fixedScript) / 2.5 / 10) * 10;
  obj.estimated_duration_seconds = Math.max(30, seconds);

  return obj;
}

/**
 * True when the parsed Claude response contains real guide narration.
 * Used to gate cache writes so we never persist a dud `{script: ""}`
 * row that would short-circuit every future request and serve an
 * empty guide forever.
 */
function hasGuideScript(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const script = (payload as { script?: unknown }).script;
  return typeof script === "string" && script.trim().length > 0;
}

function jsonResponse(
  payload: unknown,
  status: number,
  cacheTag: string,
  reason?: string,
): Response {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "X-Cache": cacheTag,
  };
  if (reason) headers["X-Cache-Reason"] = reason;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(body, { status, headers });
}
