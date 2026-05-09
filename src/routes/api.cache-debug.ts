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

        // Probe attractions table — last 5 rows + full language breakdown
        // across ALL rows (so we can tell whether ka rows exist anywhere
        // in the table, not just within the most recent 5).
        try {
          const { data: attrRows, error: attrErr } = await client
            .from("cached_attractions")
            .select("query_normalized, language, filters_key, hit_count, updated_at")
            .order("updated_at", { ascending: false })
            .limit(5);
          const { data: allLangs } = await client.from("cached_attractions").select("language");
          const byLang: Record<string, number> = {};
          for (const r of allLangs ?? []) byLang[r.language] = (byLang[r.language] ?? 0) + 1;
          out.cached_attractions = attrErr
            ? { error: attrErr.message }
            : {
                recent: attrRows ?? [],
                total_rows: (allLangs ?? []).length,
                by_language: byLang,
              };
        } catch (err) {
          out.cached_attractions = {
            threw: err instanceof Error ? err.message : String(err),
          };
        }

        // Probe guides table — same shape, plus interest breakdown.
        try {
          const { data: guideRows, error: guideErr } = await client
            .from("cached_guides")
            .select("name_normalized, language, interest, hit_count, updated_at")
            .order("updated_at", { ascending: false })
            .limit(5);
          const { data: allMeta } = await client.from("cached_guides").select("language, interest");
          const byLang: Record<string, number> = {};
          const byInterest: Record<string, number> = {};
          for (const r of allMeta ?? []) {
            byLang[r.language] = (byLang[r.language] ?? 0) + 1;
            byInterest[r.interest] = (byInterest[r.interest] ?? 0) + 1;
          }
          out.cached_guides = guideErr
            ? { error: guideErr.message }
            : {
                recent: guideRows ?? [],
                total_rows: (allMeta ?? []).length,
                by_language: byLang,
                by_interest: byInterest,
              };
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

        // Translation probe — the cache pattern (only language="en" rows,
        // never "ka") strongly suggests the Lovable AI Gateway is
        // returning identity translations or erroring out, and the
        // server then refuses to cache those as Georgian (correct
        // behaviour: don't pin English under a ka key). Hit the
        // gateway directly with a tiny known payload and report
        // verbatim what comes back.
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (lovableKey) {
          const probeStrings = ["Begin journey", "Save", "About this place"];
          try {
            const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a translator. Translate every input string to Georgian. Return JSON via the tool.",
                  },
                  { role: "user", content: JSON.stringify({ strings: probeStrings }) },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "return_translations",
                      parameters: {
                        type: "object",
                        properties: {
                          translations: {
                            type: "array",
                            items: { type: "string" },
                          },
                        },
                        required: ["translations"],
                      },
                    },
                  },
                ],
                tool_choice: {
                  type: "function",
                  function: { name: "return_translations" },
                },
              }),
            });
            const upstreamText = await upstream.text();
            let parsedJson: unknown;
            try {
              parsedJson = JSON.parse(upstreamText);
            } catch {
              parsedJson = null;
            }
            out.translation_probe = {
              http_status: upstream.status,
              http_ok: upstream.ok,
              body_preview: upstreamText.slice(0, 800),
              body_parsed_ok: parsedJson !== null,
              source: probeStrings,
            };
          } catch (err) {
            out.translation_probe = {
              threw: err instanceof Error ? err.message : String(err),
              source: probeStrings,
            };
          }
        } else {
          out.translation_probe = { skipped: "LOVABLE_API_KEY missing" };
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
