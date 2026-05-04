import { createFileRoute } from "@tanstack/react-router";
import { getCachedAttractions, putCachedAttractions } from "@/lib/sharedCache.server";

/**
 * /api/attractions — Cloudflare Worker proxy in front of the n8n
 * /webhook/attractions workflow.
 *
 * Same shared-cache pattern as /api/guide — see that file for the
 * full rationale. The cache key here is
 * (query, language, filters_key) where `filters_key` is a stable
 * serialization of the {interests, duration} pair so that two
 * requests with the same intent collapse to the same row.
 *
 * Single response header for monitoring: `X-Cache: HIT|MISS`.
 */
export const Route = createFileRoute("/api/attractions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const key = extractAttractionsKey(rawBody);

        // 1. Cache lookup
        if (key) {
          const cached = await getCachedAttractions(key);
          if (cached !== null) {
            return new Response(JSON.stringify(cached), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Cache": "HIT",
              },
            });
          }
        }

        // 2. Forward to n8n
        try {
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/attractions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: rawBody,
          });
          const text = await upstream.text();

          // 3. Persist successful responses to the shared cache.
          if (key && upstream.ok && text.trim().length > 0) {
            const parsed = safeParseJson(text);
            if (parsed !== undefined) {
              // Fire-and-forget — see api.guide.ts for the rationale.
              void putCachedAttractions(key, parsed);
            }
          }

          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
              "X-Cache": "MISS",
            },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
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
    // Frontend sends `query` and also mirrors as `city` / `country`
    // for the n8n workflow. We pick the most-specific one available.
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

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
