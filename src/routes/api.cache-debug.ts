import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/cache-debug — temporary diagnostic endpoint for the Stage 1
 * shared cache. Returns a JSON snapshot of:
 *   - Whether EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
 *     are visible to the deployed Cloudflare Worker
 *   - A live SELECT count(*) on cached_guides + cached_attractions to
 *     prove the connection actually reaches Supabase
 *   - Detailed error messages if either side breaks
 *
 * Hit it from the browser address bar (or `curl`) — no auth, GET only.
 * Once Beka confirms the cache is wired correctly, this file can be
 * deleted; nothing else imports it.
 */
export const Route = createFileRoute("/api/cache-debug")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.EXTERNAL_SUPABASE_URL;
        const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

        const out: Record<string, unknown> = {
          env_url_present: Boolean(url),
          env_url_value: url ? `${url.slice(0, 32)}…` : null,
          env_service_role_present: Boolean(key),
          env_service_role_length: key ? key.length : 0,
        };

        if (!url || !key) {
          out.status = "DISABLED — env vars missing";
          return Response.json(out);
        }

        try {
          const client = createClient(url, key, {
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          });
          // Use head:true + count:exact to get just the row count.
          const guides = await client
            .from("cached_guides")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select("*", { count: "exact", head: true } as any);
          const attractions = await client
            .from("cached_attractions")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select("*", { count: "exact", head: true } as any);

          out.cached_guides = {
            count: guides.count,
            error: guides.error?.message ?? null,
          };
          out.cached_attractions = {
            count: attractions.count,
            error: attractions.error?.message ?? null,
          };
          out.status = guides.error || attractions.error ? "PARTIAL — see errors above" : "OK";
        } catch (err) {
          out.status = "EXCEPTION";
          out.error = err instanceof Error ? err.message : String(err);
        }

        return Response.json(out);
      },
    },
  },
});
