import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, corsJson, corsPreflight } from "@/lib/cors.server";
import { getCachedAudio, putCachedAudio } from "@/lib/sharedCache.server";
import {
  blobExists,
  getAzureBlobPublicUrl,
  isAzureConfigured,
  uploadToAzureBlob,
} from "@/lib/azureBlob.server";

/**
 * /api/tts — Azure-Speech-backed TTS proxy with persistent blob cache.
 *
 * Cache flow (cost-saving big win):
 *   1. SHA-1 over the request body → cache_key
 *   2. Hit `cached_audio` → 302 redirect to the blob URL → audio plays
 *      instantly with zero Worker bandwidth
 *   3. Miss → call n8n's TTS workflow (which calls Azure Speech) →
 *      upload mp3 to Azure Blob → save URL in cached_audio → respond
 *      with the audio bytes inline (the first user pays the upload
 *      latency; everyone after gets the redirect path)
 *
 * Without this, every load of every guide re-synthesises ~7-12 KB of
 * Georgian Neural voice at $16/M source chars. With the cache, each
 * unique (script, voice, language) combination synthesises once in
 * its entire lifetime.
 */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const body = await request.text();
        const meta = extractMeta(body);
        const cacheKey = await sha1Hex(body);

        // ─── 1. Cache hit → 302 redirect ─────────────────────────
        const cachedUrl = await getCachedAudio(cacheKey);
        if (cachedUrl) {
          return new Response(null, {
            status: 302,
            headers: { ...CORS_HEADERS, Location: cachedUrl },
          });
        }

        // ─── 2. Miss → upstream n8n call ─────────────────────────
        try {
          const upstream = await fetch("https://tsitskabeka.app.n8n.cloud/webhook/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          const buffer = await upstream.arrayBuffer();
          const contentType =
            upstream.headers.get("Content-Type") ?? "audio/mpeg";
          // Only persist successful mp3 responses — error blobs would
          // pin every future request to a broken response.
          const looksLikeAudio =
            upstream.ok &&
            buffer.byteLength > 500 &&
            contentType.toLowerCase().includes("audio");

          // ─── 3. Upload to blob + cache the URL ────────────────
          if (looksLikeAudio && isAzureConfigured()) {
            try {
              const blobName = `${cacheKey}.mp3`;
              let blobUrl = getAzureBlobPublicUrl(blobName, "audio");
              if (!(await blobExists(blobName, "audio"))) {
                blobUrl = await uploadToAzureBlob(
                  blobName,
                  new Uint8Array(buffer),
                  contentType,
                  "audio",
                );
              }
              if (blobUrl) {
                await putCachedAudio(cacheKey, blobUrl, {
                  voice: meta.voice,
                  language: meta.language,
                  // No external upstream URL for TTS — leave source_url
                  // null. (The QA workflow for audio is "play it",
                  // not "click a link to compare".)
                });
              }
            } catch (err) {
              console.warn("[api.tts] blob upload failed", err);
            }
          }

          // Return the audio bytes inline to the caller — they're
          // already in the response, no need to make them follow a
          // redirect on the first request.
          return new Response(buffer, {
            status: upstream.status,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": contentType,
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

/**
 * Pull voice + language out of the request body for the metadata
 * columns. Best-effort — the body shape is whatever the InlineAudioPanel
 * sends, currently `{ text, voice, language }`.
 */
function extractMeta(rawBody: string): {
  voice: string | null;
  language: string | null;
} {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      voice: typeof obj.voice === "string" ? obj.voice : null,
      language:
        (typeof obj.language === "string" && obj.language) ||
        (typeof obj.lang === "string" && obj.lang) ||
        null,
    };
  } catch {
    return { voice: null, language: null };
  }
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
