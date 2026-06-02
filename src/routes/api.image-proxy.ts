import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, corsPreflight } from "@/lib/cors.server";

/**
 * /api/image-proxy?url=<encoded>
 *
 * Server-side image fetch + base64 re-encode for client-side inline
 * caching. The browser-side `inlineImageAsDataUrl` first tries direct
 * fetch and a canvas fallback; when both fail (CORS-blocked
 * Wikipedia/Google Places redirects, opaque responses, tainted
 * canvases), it falls through here.
 *
 * Why this is safe:
 *   - The Cloudflare Worker has no CORS restrictions on outbound
 *     fetches, so it can read the bytes the browser couldn't.
 *   - We cap the response at 2 MB to prevent abuse (someone passing
 *     a giant URL to bloat our worker bandwidth).
 *   - We only proxy upload.wikimedia.org, lh3.googleusercontent.com,
 *     and maps.googleapis.com — the three hosts /api/photo can
 *     legitimately return. Anything else is rejected with 403, so
 *     this endpoint can't be used as an open proxy.
 *   - 30-day immutable cache header — the resolved photo URLs are
 *     content-addressed (Wikimedia file hash or Google Places sig)
 *     and don't rotate.
 */
const ALLOWED_HOSTS = new Set([
  "upload.wikimedia.org",
  "lh3.googleusercontent.com",
  "maps.googleapis.com",
  "commons.wikimedia.org",
]);

const MAX_BYTES = 2_000_000;

export const Route = createFileRoute("/api/image-proxy")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("url");
        if (!target) {
          return jsonError(400, "missing url param");
        }
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return jsonError(400, "invalid url");
        }
        if (!ALLOWED_HOSTS.has(parsed.host)) {
          return jsonError(403, "host not in allowlist");
        }
        try {
          const upstream = await fetch(parsed.toString(), {
            redirect: "follow",
            headers: {
              "User-Agent":
                "Lokali-ImageProxy/1.0 (https://lokali.ge; lokaliapps@gmail.com)",
              Accept: "image/*",
            },
          });
          if (!upstream.ok) {
            return jsonError(upstream.status, "upstream error");
          }
          const reader = upstream.body?.getReader();
          if (!reader) {
            return jsonError(502, "no body");
          }
          const chunks: Uint8Array[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              received += value.byteLength;
              if (received > MAX_BYTES) {
                return jsonError(413, "payload too large");
              }
              chunks.push(value);
            }
          }
          const body = mergeChunks(chunks, received);
          const contentType = upstream.headers.get("Content-Type") ?? "image/jpeg";
          return new Response(body, {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=2592000, immutable",
            },
          });
        } catch (err) {
          return jsonError(
            502,
            err instanceof Error ? err.message : "proxy fetch failed",
          );
        }
      },
    },
  },
});

function mergeChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
