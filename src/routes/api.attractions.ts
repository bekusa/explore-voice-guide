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
          const trimmed = text.trim();
          const parsed = trimmed.length > 0 ? safeParseJson(text) : undefined;

          // 3. Persist successful responses to the shared cache.
          if (key && upstream.ok && parsed !== undefined) {
            // Fire-and-forget — see api.guide.ts for the rationale.
            void putCachedAttractions(key, parsed);
          }

          // 4. Always return parseable JSON to the client. If n8n
          // gave us an empty / unparseable body (timeout, unfamiliar
          // city, silent error) we fall back to {attractions: []}
          // so the client renders an empty results page instead of
          // throwing a "Could not parse response as JSON" toast.
          if (upstream.ok && parsed === undefined) {
            return new Response(JSON.stringify({ attractions: [] }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Cache": "MISS",
                "X-Cache-Reason": "upstream-empty",
              },
            });
          }

          return new Response(parsed !== undefined ? JSON.stringify(parsed) : text, {
            status: upstream.status,
            headers: {
              "Content-Type": "application/json",
              "X-Cache": "MISS",
            },
          });
        } catch (err) {
          // Network failure talking to n8n. Return a structured
          // "no results" payload instead of a 502 with raw text so
          // the client doesn't crash on a missing JSON body.
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
