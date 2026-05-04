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
 * errors, we transparently fall through to n8n. Same for the write
 * side — a failed insert is logged and swallowed; we never block
 * the user's response on the cache.
 */
export const Route = createFileRoute("/api/guide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        // Pull the cache-key fields out of the body. Missing pieces
        // disable caching for that request (we only cache when we
        // can build a stable key).
        const key = extractGuideKey(rawBody);
        // Diagnostic header surfaced via DevTools so Beka can tell
        // at a glance whether the cache key was extracted correctly
        // even when X-Cache says MISS.
        const keyHeader = key ? `${key.name}|${key.language}|${key.interest}` : "no-key";

        // 1. Cache lookup
        if (key) {
          const cached = await getCachedGuide(key);
          if (cached !== null) {
            return new Response(JSON.stringify(cached), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Cache": "HIT",
                "X-Cache-Key": keyHeader,
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

          // 3. Persist successful responses to the shared cache.
          // Only cache 2xx with a non-empty body that parses as JSON
          // — avoids storing error bodies or transient n8n hiccups.
          let writeStatus = "skip";
          if (key && upstream.ok && text.trim().length > 0) {
            const parsed = safeParseJson(text);
            if (parsed !== undefined) {
              // We pay the Claude latency, but await the write so
              // X-Cache-Write can report its actual outcome — handy
              // for debugging. Once cache is stable we can switch
              // back to fire-and-forget.
              try {
                await putCachedGuide(key, parsed);
                writeStatus = "ok";
              } catch (err) {
                writeStatus = `error: ${err instanceof Error ? err.message : "unknown"}`;
              }
            } else {
              writeStatus = "skip-not-json";
            }
          } else if (!key) {
            writeStatus = "skip-no-key";
          } else if (!upstream.ok) {
            writeStatus = `skip-status-${upstream.status}`;
          }

          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
              "X-Cache": "MISS",
              "X-Cache-Key": keyHeader,
              "X-Cache-Write": writeStatus,
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
