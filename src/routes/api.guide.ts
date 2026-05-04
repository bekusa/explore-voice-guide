import { createFileRoute } from "@tanstack/react-router";
import { getCachedGuide, putCachedGuide } from "@/lib/sharedCache.server";

/**
 * /api/guide — Cloudflare Worker proxy in front of the n8n
 * /webhook/guide workflow.
 *
 * Cache layer: shared Postgres cache (see `lib/sharedCache.server`).
 *   - HIT  → return the stored payload immediately. Skip n8n + Claude.
 *   - MISS → forward to n8n; on success, write the response back into
 *     Supabase so the next visitor — anywhere in the world — gets a
 *     ~50ms answer instead of a 6-8s Claude round-trip.
 *
 * The cache is opportunistic: if Supabase is down or the lookup
 * errors, we transparently fall through to n8n. Writes are
 * fire-and-forget so the cold-cache visitor doesn't pay an extra
 * Postgres round-trip on top of the Claude latency they already ate.
 *
 * One header is exposed for monitoring: `X-Cache: HIT|MISS`. The
 * verbose debug headers (X-Cache-Key, X-Cache-Write) were removed
 * once the cache was confirmed working — see commit history.
 */
export const Route = createFileRoute("/api/guide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const key = extractGuideKey(rawBody);

        // 1. Cache lookup
        if (key) {
          const cached = await getCachedGuide(key);
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
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/guide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: rawBody,
          });
          const text = await upstream.text();
          const trimmed = text.trim();
          const parsed = trimmed.length > 0 ? safeParseJson(text) : undefined;

          // 3. Persist successful responses to the shared cache.
          // Only cache 2xx with a non-empty body that parses as JSON
          // — avoids storing error bodies or transient n8n hiccups.
          if (key && upstream.ok && parsed !== undefined) {
            // Fire-and-forget: we already paid the Claude latency
            // for this user, no point making them wait on a
            // Postgres write too. Errors are logged inside
            // putCachedGuide and swallowed.
            void putCachedGuide(key, parsed);
          }

          // 4. Always return parseable JSON. Empty / unparseable n8n
          // body becomes an empty guide envelope so the client doesn't
          // surface "Could not parse response as JSON".
          if (upstream.ok && parsed === undefined) {
            return new Response(JSON.stringify({ script: "" }), {
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
 * body. Returns null if name or language is missing — the cache row
 * would be ambiguous and a future request with the same (incomplete)
 * payload couldn't safely match it.
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

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
