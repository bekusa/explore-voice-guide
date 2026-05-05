import { createFileRoute } from "@tanstack/react-router";
import { getCachedAttractions, putCachedAttractions } from "@/lib/sharedCache.server";
import { translateAttractionsPayload } from "@/lib/translatePayload.server";

/**
 * /api/attractions — Cloudflare Worker proxy in front of the n8n
 * /webhook/attractions workflow.
 *
 * Smart cache strategy (saves ~80% Claude cost across languages):
 *   1. Try direct cache hit on (query, userLang).
 *   2. Miss + userLang != en → try (query, "en"); if found,
 *      translate it to userLang via Lovable AI Gateway (Gemini Flash,
 *      ~10× cheaper than Claude) and cache the translated row too.
 *   3. Miss everywhere → forward to n8n forcing language="en" so we
 *      always cache an English baseline, then translate to userLang
 *      if needed.
 *
 * Result: each city now costs ONE Claude call regardless of how
 * many languages we serve it in. The translation step is opportunistic
 * — if it fails or returns the source array, the user sees English
 * which is still a working result.
 *
 * Single response header for monitoring: `X-Cache: HIT|TRANSLATED|MISS`.
 */
export const Route = createFileRoute("/api/attractions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const key = extractAttractionsKey(rawBody);
        const userLang = key?.language ?? "en";
        const wantsTranslation = key !== null && !isEnglish(userLang);

        // 1. Direct cache hit (e.g. user wants ka, ka cached)
        // Skip dud rows — if a previous bad upstream response left
        // an empty {attractions:[]} stuck in the cache, treat it as
        // a miss so the next request actually hits n8n again.
        if (key) {
          const cached = await getCachedAttractions(key);
          if (cached !== null && hasAttractions(cached)) {
            return jsonResponse(cached, 200, "HIT");
          }
        }

        // 2. Miss; if non-English, try the English baseline + translate
        if (key && wantsTranslation) {
          const enKey = { ...key, language: "en" };
          const cachedEn = await getCachedAttractions(enKey);
          if (cachedEn !== null && hasAttractions(cachedEn)) {
            const { payload: translated, translated: ok } = await translateAttractionsPayload(
              cachedEn,
              userLang,
            );
            if (ok) void putCachedAttractions(key, translated);
            return jsonResponse(translated, 200, ok ? "TRANSLATED" : "TRANSLATE-FAILED");
          }
        }

        // 3. Forward to n8n — always request English so the cached
        // baseline is reusable across every locale we ever serve.
        const enBody = forceLanguageEnglish(rawBody);
        try {
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/attractions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: enBody,
          });
          const text = await upstream.text();
          const trimmed = text.trim();
          const parsed = trimmed.length > 0 ? safeParseJson(text) : undefined;

          // Persist the English baseline. Only when there's at least
          // one attraction in the payload — caching an empty list
          // would pin a dud row that short-circuits future requests.
          if (key && upstream.ok && parsed !== undefined && hasAttractions(parsed)) {
            const enKey = { ...key, language: "en" };
            void putCachedAttractions(enKey, parsed);
          }

          // Empty / unparseable upstream → friendly empty list (NOT cached).
          if (upstream.ok && (parsed === undefined || !hasAttractions(parsed))) {
            return jsonResponse({ attractions: [] }, 200, "MISS", "upstream-empty");
          }

          // Translate now if the user wanted a non-English response.
          if (key && upstream.ok && parsed !== undefined && wantsTranslation) {
            const { payload: translated, translated: ok } = await translateAttractionsPayload(
              parsed,
              userLang,
            );
            if (ok) void putCachedAttractions(key, translated);
            return jsonResponse(translated, 200, ok ? "MISS-TRANSLATED" : "MISS-NO-TRANS");
          }

          return jsonResponse(parsed ?? text, upstream.status, "MISS");
        } catch (err) {
          // Network failure talking to n8n — return empty list with
          // an `error` field so the client can render gracefully.
          return new Response(
            JSON.stringify({
              attractions: [],
              error: err instanceof Error ? err.message : "Upstream failed",
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

/**
 * Build a stable cache key from the request body. Returns null if
 * we can't extract a non-empty query — uncacheable.
 */
function extractAttractionsKey(rawBody: string): {
  query: string;
  language: string;
  filters: { interests?: string[]; duration?: string };
} | null {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    const query =
      (typeof obj.query === "string" && obj.query) ||
      (typeof obj.city === "string" && obj.city) ||
      (typeof obj.country === "string" && obj.country) ||
      "";
    const language =
      (typeof obj.language === "string" && obj.language) ||
      (typeof obj.lang === "string" && obj.lang) ||
      "";
    const interests = Array.isArray(obj.interests)
      ? obj.interests.filter((s): s is string => typeof s === "string")
      : [];
    const duration = typeof obj.duration === "string" ? obj.duration : "";
    if (!query.trim() || !language.trim()) return null;
    return {
      query: query.trim(),
      language: language.trim(),
      filters: { interests, duration },
    };
  } catch {
    return null;
  }
}

/**
 * Rewrite `language: ...` → `language: "en"` in the JSON body before
 * forwarding to n8n, so we always cache an English baseline.
 * Falls back to the original body on any parse failure.
 */
function forceLanguageEnglish(rawBody: string): string {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    obj.language = "en";
    if ("lang" in obj) obj.lang = "en";
    return JSON.stringify(obj);
  } catch {
    return rawBody;
  }
}

function isEnglish(lang: string): boolean {
  return !lang || lang.toLowerCase().startsWith("en");
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * True when the parsed n8n response looks like a real attractions
 * payload with at least one entry. Tolerates the wrapped shape
 * `{attractions:[...]}` and the bare-array shape `[...]`. Used to
 * gate cache writes so we never persist a dud empty result.
 */
function hasAttractions(payload: unknown): boolean {
  if (!payload) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (typeof payload !== "object") return false;
  const arr = (payload as { attractions?: unknown }).attractions;
  return Array.isArray(arr) && arr.length > 0;
}

function jsonResponse(
  payload: unknown,
  status: number,
  cacheTag: string,
  reason?: string,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cache": cacheTag,
  };
  if (reason) headers["X-Cache-Reason"] = reason;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(body, { status, headers });
}
