import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/attractions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const upstream = await fetch(
            "https://tsitskabeka.app.n8n.cloud/webhook/attractions",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            },
          );
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type":
                upstream.headers.get("Content-Type") ?? "application/json",
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
