import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { corsJson, corsPreflight } from "@/lib/cors.server";

/**
 * POST /api/report — record a "this guide has wrong info" report.
 *
 * Writes to Supabase `guide_reports` using the service-role key, so the
 * table stays fully locked down (RLS on, no public insert policy — the
 * service role bypasses RLS). That keeps the report sink private while
 * still letting anonymous users flag bad content from the client.
 *
 * Best-effort by design: we always return { ok: true } for a well-formed
 * request even if the DB write fails, so the one-tap UX never surfaces
 * infrastructure errors to the user. Real failures are logged server-side.
 *
 * Field lengths are clipped as a cheap abuse guard (this is a public
 * endpoint). A stronger rate-limit can be layered later if needed.
 */
function db() {
  if (typeof process === "undefined") return null;
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export const Route = createFileRoute("/api/report")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          /* ignore — handled by the missing-name guard below */
        }

        const attraction_name = clip(body.name, 300);
        if (!attraction_name) {
          return corsJson({ ok: false, error: "missing name" }, { status: 400 });
        }

        const row = {
          attraction_slug: clip(body.slug, 300) ?? attraction_name.toLowerCase(),
          attraction_name,
          name_en: clip(body.nameEn, 300),
          city: clip(body.city, 200),
          language: clip(body.language, 20),
          interest: clip(body.interest, 40),
          script_excerpt: clip(body.script, 800),
          reason: clip(body.reason, 500),
          user_id: clip(body.userId, 64),
          user_agent: clip(request.headers.get("user-agent"), 400),
        };

        const client = db();
        if (!client) {
          console.warn("[api.report] Supabase not configured — report dropped:", row.attraction_name);
          return corsJson({ ok: true });
        }
        const { error } = await client.from("guide_reports").insert(row);
        if (error) console.warn("[api.report] insert failed:", error.message);
        return corsJson({ ok: true });
      },
    },
  },
});
