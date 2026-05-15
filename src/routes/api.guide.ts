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
          const text = await callClaude({ system, user, maxTokens: 8192 });
          const parsed = parseClaudeJson(text);

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
          // — return an empty guide with an error string so the
          // client renders gracefully instead of breaking.
          return new Response(
            JSON.stringify({
              script: "",
              error: err instanceof Error ? err.message : "Upstream failed",
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
    const language =
      (typeof obj.language === "string" && obj.language) ||
      (typeof obj.lang === "string" && obj.lang) ||
      "";
    const interest = (typeof obj.interest === "string" && obj.interest) || "editors";
    if (!name.trim() || !language.trim()) return null;
    return { name: name.trim(), language: language.trim(), interest: interest.trim() };
  } catch {
    return null;
  }
}

function isEnglish(lang: string): boolean {
  return !lang || lang.toLowerCase().startsWith("en");
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
