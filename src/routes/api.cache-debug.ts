import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/cache-debug — readable health check for the Supabase shared cache.
 *
 * Beka observed cache writes silently dropping. The cache helper
 * swallows errors with `console.warn`, so failures show up only in
 * Lovable logs. This endpoint surfaces the same diagnostic via the
 * browser so we can tell at a glance whether:
 *   - the EXTERNAL_SUPABASE_* env vars are present
 *   - the service-role key actually authenticates against the project
 *   - the cached_attractions / cached_guides tables exist + are writable
 *
 * Hit it directly: https://lokali-app.lovable.app/api/cache-debug
 *
 * Returns 200 with a JSON snapshot. NEVER returns the secret values
 * themselves — only "present" / length so we can spot truncation.
 */
export const Route = createFileRoute("/api/cache-debug")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.EXTERNAL_SUPABASE_URL;
        const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

        const out: Record<string, unknown> = {
          env: {
            EXTERNAL_SUPABASE_URL: url
              ? { present: true, value: maskUrl(url) }
              : { present: false },
            EXTERNAL_SUPABASE_SERVICE_ROLE_KEY: key
              ? { present: true, length: key.length, prefix: key.slice(0, 8) + "…" }
              : { present: false },
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
              ? { present: true, length: process.env.ANTHROPIC_API_KEY.length }
              : { present: false },
            LOVABLE_API_KEY: process.env.LOVABLE_API_KEY
              ? { present: true, length: process.env.LOVABLE_API_KEY.length }
              : { present: false },
          },
        };

        if (!url || !key) {
          out.status = "missing-env-vars";
          return jsonResponse(out, 200);
        }

        let client;
        try {
          client = createClient(url, key, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
        } catch (err) {
          out.status = "client-init-failed";
          out.error = err instanceof Error ? err.message : String(err);
          return jsonResponse(out, 200);
        }

        // Probe attractions table — count rows + last 3 (with payload trimmed).
        try {
          const { data: attrRows, error: attrErr } = await client
            .from("cached_attractions")
            .select("query_normalized, language, filters_key, hit_count, updated_at")
            .order("updated_at", { ascending: false })
            .limit(5);
          out.cached_attractions = attrErr
            ? { error: attrErr.message }
            : { recent: attrRows ?? [], count: (attrRows ?? []).length };
        } catch (err) {
          out.cached_attractions = {
            threw: err instanceof Error ? err.message : String(err),
          };
        }

        // Probe guides table — same shape.
        try {
          const { data: guideRows, error: guideErr } = await client
            .from("cached_guides")
            .select("name_normalized, language, interest, hit_count, updated_at")
            .order("updated_at", { ascending: false })
            .limit(5);
          out.cached_guides = guideErr
            ? { error: guideErr.message }
            : { recent: guideRows ?? [], count: (guideRows ?? []).length };
        } catch (err) {
          out.cached_guides = {
            threw: err instanceof Error ? err.message : String(err),
          };
        }

        // Round-trip test: write a tiny row to cached_attractions
        // under a sentinel query that won't collide with real entries,
        // then read it back. If this fails the cache is broken even if
        // the recent-rows query worked.
        const sentinel = {
          query_normalized: "__cache_debug_probe__",
          language: "en",
          filters_key: "{}",
          payload: { attractions: [{ name: "probe", at: new Date().toISOString() }] },
          updated_at: new Date().toISOString(),
        };
        try {
          const { error: writeErr } = await client
            .from("cached_attractions")
            .upsert(sentinel, { onConflict: "query_normalized,language,filters_key" });
          if (writeErr) {
            out.write_probe = { ok: false, error: writeErr.message };
          } else {
            const { data: readBack, error: readErr } = await client
              .from("cached_attractions")
              .select("payload, updated_at")
              .eq("query_normalized", "__cache_debug_probe__")
              .eq("language", "en")
              .eq("filters_key", "{}")
              .maybeSingle();
            out.write_probe = readErr
              ? { ok: false, write: "succeeded", read_error: readErr.message }
              : { ok: true, read_back: !!readBack, updated_at: readBack?.updated_at };
          }
        } catch (err) {
          out.write_probe = {
            ok: false,
            threw: err instanceof Error ? err.message : String(err),
          };
        }

        out.status = "ok";
        return jsonResponse(out, 200);
      },
    },
  },
});

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host;
    const masked = host.length > 10 ? host.slice(0, 6) + "…" + host.slice(-6) : host;
    return `${u.protocol}//${masked}`;
  } catch {
    return "(unparseable)";
  }
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
