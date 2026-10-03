import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, corsJson, corsPreflight } from "@/lib/cors.server";
import { getCachedAudio, putCachedAudio } from "@/lib/sharedCache.server";
import {
  blobExists,
  getAzureBlobPublicUrl,
  isAzureConfigured,
  uploadToAzureBlob,
} from "@/lib/azureBlob.server";
import { classifyStatus, describeThrown, logError } from "@/lib/errorLog.server";

/**
 * How long to wait for Azure before giving up. Beka 2026-10-03.
 *
 * There was no timeout at all: a hung connection sat until Cloudflare
 * killed the entire Worker at ~100 s, which the browser sees as a
 * generic 502 — indistinguishable from a rejected key, which is
 * exactly the confusion that made this bug take five days to spot.
 *
 * 45 s is comfortably above Azure's normal synthesis time for a
 * long guide (typically 3-12 s) and comfortably below the Worker
 * budget, so a timeout here is reported as a timeout rather than
 * taking the whole request down with it.
 */
const TTS_TIMEOUT_MS = 45_000;

/**
 * /api/tts — Azure Speech REST → Azure Blob cache.
 *
 * The n8n hop is GONE (2026-06-08, Beka migrated to LokaliSpeech).
 * This route now calls Azure's Cognitive Services TTS endpoint
 * directly with `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`, builds
 * SSML inline, and uploads the resulting mp3 to the `audio` blob
 * container. Subsequent identical (text, voice, language) hits get
 * a 302 redirect to the cached blob URL — Azure Speech is only
 * invoked once per unique script in the app's lifetime.
 */

const TTS_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/**
 * Base languages whose Azure neural voices read a bare 4-digit year
 * digit-by-digit ("1990" -> "one nine nine zero") instead of as a
 * number. For these we wrap years in <say-as interpret-as="cardinal">
 * so the year is spoken as a whole cardinal number, which is the
 * natural spoken form in every language listed here.
 *
 * We deliberately DON'T touch English / German / Romance voices: they
 * already read years idiomatically ("nineteen ninety") and forcing
 * cardinal would regress the largest audiences. CJK (zh/ja/ko) is also
 * excluded for now -- Chinese reads years digit-by-digit by convention,
 * so the current behaviour may already be correct there.
 *
 * Keyed by the base language (the part before the region). Add a code
 * here once the digit-by-digit bug is confirmed on-device.
 */
const YEAR_CARDINAL_LANGS = new Set<string>([
  "ka", // Georgian (confirmed)
  "hy", // Armenian
  "az", // Azerbaijani
  "uz", // Uzbek — Turkic, reads years as a cardinal number like az/tr
  "kk", // Kazakh — same Turkic pattern
  "ar", // Arabic
  "fa", // Persian
  "he", // Hebrew
  "tr", // Turkish
  "ru", // Russian
  "uk", // Ukrainian
  "el", // Greek
  "hi", // Hindi
  "bn", // Bengali
  "ur", // Urdu
  "ta", // Tamil
  "te", // Telugu
  "mr", // Marathi
  "th", // Thai
  "bg", // Bulgarian
  "hr", // Croatian
  "sr", // Serbian
  "sw", // Swahili
]);

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const meta = extractMeta(rawBody);
        if (!meta.text) {
          return corsJson({ error: "missing text" }, { status: 400 });
        }
        if (!meta.voice) {
          return corsJson({ error: "missing voice" }, { status: 400 });
        }

        // SHA-1 over the canonicalised (voice|language|text) tuple so
        // re-orderings of body keys never produce a different cache
        // key for what's logically the same synthesis request.
        const cacheKey = await sha1Hex(
          `${meta.voice}|${meta.language ?? ""}|${meta.text}`,
        );

        // ─── 1. Cache hit → 302 redirect ─────────────────────────
        const cachedUrl = await getCachedAudio(cacheKey);
        if (cachedUrl) {
          return new Response(null, {
            status: 302,
            headers: { ...CORS_HEADERS, Location: cachedUrl },
          });
        }

        // ─── 2. Direct call to Azure Speech ──────────────────────
        const speechKey = env("AZURE_SPEECH_KEY");
        const speechRegion = env("AZURE_SPEECH_REGION");
        if (!speechKey || !speechRegion) {
          // Logged, not just returned: a secret going missing after a
          // redeploy looks identical to a rejected key from the user's
          // side, and this is the one case where the fix is "put the
          // value back in Lovable Project Secrets".
          await logError({
            service: "azure-speech",
            route: "/api/tts",
            kind: "auth",
            message: "AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured",
            context: {
              hasKey: Boolean(speechKey),
              hasRegion: Boolean(speechRegion),
              hint: "Set both in Lovable Project Secrets, then redeploy",
            },
          });
          return corsJson({ reason: "auth" }, { status: 500 });
        }
        const ssml = buildSsml(meta);
        let mp3Buffer: ArrayBuffer;
        let contentType = "audio/mpeg";

        /* ── Azure call, instrumented. Beka 2026-10-03 ──────────────
         *
         * This block used to do two things wrong, and together they
         * cost five days of completely broken audio that nobody could
         * see:
         *
         *   1. It logged only to console.warn. In a Cloudflare Worker
         *      that goes nowhere unless someone happens to be running
         *      a live tail at that moment.
         *   2. It returned the raw upstream status to the browser,
         *      which rendered as
         *        HTTP 502: {"error":"Azure Speech 401","detail":""}
         *      That is a stack trace shown to a traveller, and it was
         *      also actively misleading: Beka reasonably read "502"
         *      as a timeout, when 401 means the KEY WAS REJECTED.
         *
         * So: every outcome is now classified, logged to error_logs
         * with timing, and translated into one of three honest
         * machine-readable reasons the client maps to real sentences.
         *
         * An explicit timeout is set because there wasn't one. A hung
         * Azure connection would previously sit until Cloudflare
         * killed the whole Worker at ~100 s, which surfaces as a
         * generic 502 and is indistinguishable from everything else.
         */
        const started = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
        try {
          const upstream = await fetch(
            `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
            {
              method: "POST",
              headers: {
                "Ocp-Apim-Subscription-Key": speechKey,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": TTS_OUTPUT_FORMAT,
                "User-Agent": "Lokali/1.0",
              },
              body: ssml,
              signal: controller.signal,
            },
          );
          if (!upstream.ok) {
            const errTxt = await upstream.text().catch(() => "");
            const kind = classifyStatus(upstream.status);
            await logError({
              service: "azure-speech",
              route: "/api/tts",
              status: upstream.status,
              kind,
              message: `Azure Speech rejected the request: ${errTxt.slice(0, 300) || "(empty body)"}`,
              durationMs: Date.now() - started,
              context: {
                region: speechRegion,
                voice: meta.voice ?? null,
                language: meta.language ?? null,
                ssmlChars: ssml.length,
                // The single most useful field: 401/403 means the key
                // or region is wrong — which for a free (F0) Speech
                // resource usually means it expired and needs
                // recreating, not that anything in the app changed.
                hint:
                  kind === "auth"
                    ? "AZURE_SPEECH_KEY/REGION rejected — check the Speech resource still exists and the key matches the region"
                    : kind === "quota"
                      ? "Azure Speech quota exhausted for this period"
                      : undefined,
              },
            });
            return corsJson({ reason: kind }, { status: 502 });
          }
          mp3Buffer = await upstream.arrayBuffer();
          const ct = upstream.headers.get("Content-Type");
          if (ct) contentType = ct.split(";")[0].trim();
        } catch (err) {
          const { message, kind } = describeThrown(err);
          await logError({
            service: "azure-speech",
            route: "/api/tts",
            kind,
            message,
            durationMs: Date.now() - started,
            context: {
              region: speechRegion,
              voice: meta.voice ?? null,
              language: meta.language ?? null,
              timeoutMs: TTS_TIMEOUT_MS,
            },
          });
          return corsJson({ reason: kind }, { status: 502 });
        } finally {
          clearTimeout(timeoutId);
        }

        // Sanity-check the response actually looks like audio — Azure
        // can return a 200 with an empty body if the quota is hit
        // mid-request, and we don't want to pin a broken blob in cache.
        if (mp3Buffer.byteLength < 500) {
          await logError({
            service: "azure-speech",
            route: "/api/tts",
            status: 200,
            kind: "bad-response",
            message: `Azure Speech returned ${mp3Buffer.byteLength} bytes — too small to be audio`,
            durationMs: Date.now() - started,
            context: { bytes: mp3Buffer.byteLength, voice: meta.voice ?? null },
          });
          return corsJson({ reason: "bad-response" }, { status: 502 });
        }

        // ─── 3. Upload to blob + cache the URL ───────────────────
        if (isAzureConfigured()) {
          try {
            const blobName = `${cacheKey}.mp3`;
            let blobUrl: string | null = getAzureBlobPublicUrl(blobName, "audio");
            if (!(await blobExists(blobName, "audio"))) {
              blobUrl = await uploadToAzureBlob(
                blobName,
                new Uint8Array(mp3Buffer),
                contentType,
                "audio",
              );
            }
            if (blobUrl) {
              await putCachedAudio(cacheKey, blobUrl, {
                voice: meta.voice,
                language: meta.language,
              });
            }
          } catch (err) {
            console.warn("[api.tts] blob upload failed", err);
          }
        }

        // First request gets bytes inline so playback can start
        // immediately; future requests get the 302 → blob path.
        return new Response(mp3Buffer, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});

/**
 * Build SSML envelope around the script. We use a minimal envelope
 * (no prosody / rate tweaks) so the voice's default delivery wins —
 * the Georgian Neural voices already sound natural without rate
 * adjustments, and overriding rate often introduces audible glitches
 * at language boundaries. Special characters in the user-supplied
 * text are XML-escaped so an apostrophe like `it's` doesn't end the
 * voice tag prematurely.
 */
function buildSsml(meta: {
  text: string;
  voice: string;
  language: string | null;
}): string {
  // Azure SSML requires xml:lang on the root <speak> AND on <voice>.
  // The voice name implies a locale (e.g. ka-GE-EkaNeural → ka-GE),
  // but we still derive from the locale string the client sent when
  // available — that lets a user pick a Georgian voice while listening
  // to an English script for a multilingual mode later.
  const locale = inferLocaleFromVoice(meta.voice, meta.language);
  const baseLang = locale.split("-")[0].toLowerCase();
  // XML-escape FIRST (so an apostrophe like `it's` or an ampersand
  // can't break the markup), THEN inject <say-as> tags. Years are pure
  // digits, so escaping never alters them and the post-escape regex
  // stays valid.
  let inner = escapeXml(meta.text);
  if (YEAR_CARDINAL_LANGS.has(baseLang)) {
    inner = wrapYearsAsCardinal(inner);
  }
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(locale)}">` +
    `<voice name="${escapeXml(meta.voice)}">${inner}</voice>` +
    `</speak>`
  );
}

/**
 * Wrap standalone 4-digit years (1000-2099) in
 * <say-as interpret-as="cardinal"> so affected neural voices read them
 * as a whole number instead of digit-by-digit. Operates on the ALREADY
 * XML-escaped script. The look-behind/look-ahead keep us from matching
 * inside longer digit runs, decimals or thousands-separated numbers
 * ("24000", "1990.5", "1,990") -- only a clean 4-digit token bounded by
 * non-digit / non-dot / non-comma characters is treated as a year.
 */
function wrapYearsAsCardinal(escapedText: string): string {
  return escapedText.replace(
    /(?<![\d.,])(1\d{3}|20\d{2})(?![\d.,])/g,
    '<say-as interpret-as="cardinal">$1</say-as>',
  );
}

function inferLocaleFromVoice(voice: string, fallback: string | null): string {
  // Azure voice names are <locale>-<region>-<NameNeural>, e.g.
  // ka-GE-EkaNeural → locale is "ka-GE". Slice off the trailing
  // segment safely; if the voice doesn't match the convention,
  // fall back to whatever language the client passed.
  const match = voice.match(/^([a-z]{2,3}-[A-Z]{2})/);
  if (match) return match[1];
  if (fallback) return fallback;
  return "en-US";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractMeta(rawBody: string): {
  text: string;
  voice: string;
  language: string | null;
} {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    const text =
      (typeof obj.text === "string" && obj.text) ||
      (typeof obj.script === "string" && obj.script) ||
      "";
    const voice = (typeof obj.voice === "string" && obj.voice) || "";
    const language =
      (typeof obj.language === "string" && obj.language) ||
      (typeof obj.lang === "string" && obj.lang) ||
      null;
    return { text, voice, language };
  } catch {
    return { text: "", voice: "", language: null };
  }
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function env(name: string): string | null {
  if (typeof process === "undefined") return null;
  return process.env?.[name] ?? null;
}
