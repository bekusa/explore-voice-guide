import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, corsJson, corsPreflight } from "@/lib/cors.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      // Preflight for Capacitor's WebView — see src/lib/cors.server.ts
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          const buffer = await upstream.arrayBuffer();
          // CORS_HEADERS spread alongside the audio Content-Type so
          // the Capacitor WebView can read the binary response body.
          return new Response(buffer, {
            status: upstream.status,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (err) {
          return corsJson(
            { error: err instanceof Error ? err.message : "Upstream failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
