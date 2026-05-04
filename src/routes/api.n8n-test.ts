import { createFileRoute } from "@tanstack/react-router";

/**
 * /api/n8n-test?q=Singapore — temporary diagnostic endpoint that
 * sends the same payload our /api/attractions proxy would, then
 * returns the raw n8n response (headers + status + first 4KB of
 * body) as JSON. Lets Beka see *exactly* what n8n is returning
 * for a given query without juggling reqbin/curl.
 *
 * Usage from a browser:
 *   /api/n8n-test?q=Singapore
 *   /api/n8n-test?q=Tbilisi&lang=ka
 *
 * Once the n8n workflow is healthy this file can be deleted.
 */
export const Route = createFileRoute("/api/n8n-test")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get("q")?.trim() || "Singapore";
        const language = url.searchParams.get("lang")?.trim() || "en";

        const payload = {
          query,
          city: query,
          country: "",
          language,
          interests: [],
          duration: "",
        };

        const start = Date.now();
        try {
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/attractions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const text = await upstream.text();
          const elapsedMs = Date.now() - start;

          // Capture upstream headers for debugging — content-type
          // mismatches are a common reason for "empty" responses.
          const upstreamHeaders: Record<string, string> = {};
          upstream.headers.forEach((value, name) => {
            upstreamHeaders[name] = value;
          });

          return Response.json({
            request: {
              url: "https://tsitskabeka.app.n8n.cloud/webhook/attractions",
              payload,
            },
            response: {
              status: upstream.status,
              ok: upstream.ok,
              elapsed_ms: elapsedMs,
              body_length: text.length,
              body_trimmed_length: text.trim().length,
              headers: upstreamHeaders,
              body_preview: text.slice(0, 4000),
              body_truncated: text.length > 4000,
            },
          });
        } catch (err) {
          return Response.json(
            {
              request: {
                url: "https://tsitskabeka.app.n8n.cloud/webhook/attractions",
                payload,
              },
              error: err instanceof Error ? err.message : String(err),
              elapsed_ms: Date.now() - start,
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
