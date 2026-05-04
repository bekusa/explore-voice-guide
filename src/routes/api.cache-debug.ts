import { createFileRoute } from "@tanstack/react-router";

/**
 * Diagnostic endpoint retired — Stage 1 cache is verified and live.
 * Kept as a 410 stub instead of deleted because the file lives on a
 * FUSE-mounted Lovable workspace where `rm` is blocked; once the
 * Lovable sync prunes the file we can drop this stub entirely.
 */
export const Route = createFileRoute("/api/cache-debug")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({
            error: "cache-debug endpoint removed — see X-Cache response header",
          }),
          { status: 410, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
