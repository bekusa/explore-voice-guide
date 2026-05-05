import { createFileRoute } from "@tanstack/react-router";
import { getCachedGuide, putCachedGuide } from "@/lib/sharedCache.server";
import { translateGuidePayload } from "@/lib/translatePayload.server";

/**
 * /api/guide — Cloudflare Worker proxy in front of the n8n
 * /webhook/guide workflow.
 *
 * Smart cache strategy (mirror of /api/attractions):
 *   1. Try direct cache hit on (name, lang, interest).
 *   2. Miss + lang != en → look up the English baseline, translate
 *      to userLang via the Lovable AI Gateway, cache, return.
 *   3. Miss everywhere → call n8n forcing language="en", cache the
 *      English version, translate if needed.
 *
 * One Claude generation per (name, interest) regardless of locale.
 *
 * `X-Cache: HIT|TRANSLATED|MISS|MISS-TRANSLATED` for monitoring.
 */
export const Route = createFileRoute("/api/guide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const key = extractGuideKey(rawBody);
        const userLang = key?.language ?? "en";
        const wantsTranslation = key !== null && !isEnglish(userLang);

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
            if (ok) void putCachedGuide(key, translated);
            return jsonResponse(translated, 200, ok ? "TRANSLATED" : "TRANSLATE-FAILED");
          }
        }

        // 3. Forward to n8n in English
        const enBody = forceLanguageEnglish(rawBody);
        try {
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/guide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: enBody,
          });
          const text = await upstream.text();
          const trimmed = text.trim();
          const parsed = trimmed.length > 0 ? safeParseJson(text) : undefined;

          // Cache the English baseline only when there's actual
          // narration content — empty {script: ""} would pin a dud
          // row and short-circuit every future request.
          if (key && upstream.ok && parsed !== undefined && hasGuideScript(parsed)) {
            const enKey = { ...key, language: "en" };
            void putCachedGuide(enKey, parsed);
          }

          // Empty / scriptless upstream → friendly empty guide (NOT cached).
          if (upstream.ok && (parsed === undefined || !hasGuideScript(parsed))) {
            return jsonResponse({ script: "" }, 200, "MISS", "upstream-empty");
          }

          if (key && upstream.ok && parsed !== undefined && wantsTranslation) {
            const { payload: translated, translated: ok } = await translateGuidePayload(
              parsed,
              userLang,
            );
            if (ok) void putCachedGuide(key, translated);
            return jsonResponse(translated, 200, ok ? "MISS-TRANSLATED" : "MISS-NO-TRANS");
          }

          return jsonResponse(parsed ?? text, upstream.status, "MISS");
        } catch (err) {
          return new Response(
            JSON.stringify({
              script: "",
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
    const interest = (typeof obj.interest === "string" && obj.interest) || "history";
    if (!name.trim() || !language.trim()) return null;
    return { name: name.trim(), language: language.trim(), interest: interest.trim() };
  } catch {
    return null;
  }
}

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
 * True when the parsed n8n response contains real guide narration.
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
    "Content-Type": "application/json",
    "X-Cache": cacheTag,
  };
  if (reason) headers["X-Cache-Reason"] = reason;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(body, { status, headers });
}
