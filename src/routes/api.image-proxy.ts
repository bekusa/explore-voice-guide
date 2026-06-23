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
// Our own Azure Blob photo mirror. /api/photo mirrors every resolved
// Wikipedia / Google Places image into this container and hands the
// browser the blob URL, so the offline-save path MUST be able to proxy
// it. The blob host sends no CORS headers, so a direct browser fetch and
// the <img>+canvas fallback both fail; without this allow-list entry the
// proxy 403'd too, which is why all three save-time strategies failed and
// /saved fell back to the MapPin placeholder offline. Derived from the
// storage-account env so it tracks renames; the literal is a cold-start
// fallback for when the env isn't visible at module-eval time.
const BLOB_ACCOUNT =
  typeof process !== "undefined"
    ? (process.env?.AZURE_STORAGE_ACCOUNT ?? "")
    : "";
const ALLOWED_HOSTS = new Set(
  [
    "upload.wikimedia.org",
    "lh3.googleusercontent.com",
    "maps.googleapis.com",
    "commons.wikimedia.org",
    BLOB_ACCOUNT ? `${BLOB_ACCOUNT}.blob.core.windows.net` : "",
    "lokaliphotos.blob.core.windows.net",
  ].filter(Boolean),
);

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
                "Lokali-ImageProxy/1.0 (https://lokali.travel; lokaliapps@gmail.com)",
              Accept: "image/*",
            },
          });
          if (!upstream.ok) {
            return jsonError(
              upstream.status,
              `upstream ${upstream.status} for ${parsed.host}`,
            );
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
          return new Response(new Uint8Array(body), {
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
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      // Stop Cloudflare's edge from caching errors. Without this, a
      // transient upstream blip (Wikipedia 5xx, Google quota spike)
      // can lock the edge into serving an error for hours, making
      // the proxy look broken from some devices and fine from
      // others (Beka caught this — mobile got the cached error
      // while desktop hit a different edge with a fresh success).
      "Cache-Control": "no-store",
    },
  });
}
