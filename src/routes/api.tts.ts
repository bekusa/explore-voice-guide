import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          const buffer = await upstream.arrayBuffer();
          return new Response(buffer, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
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
