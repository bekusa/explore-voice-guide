/**
 * POST /api/translate
 *
 * Body: { texts: string[]; target: string }   // target = BCP-47 / ISO lang code
 * Returns: { translations: string[] } in same order.
 *
 * Calls Anthropic Claude Haiku directly. Falls back to source on any
 * error so the UI stays usable even when offline / Anthropic is
 * rate-limited.
 */
import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { googleTranslateBatch } from "@/lib/googleTranslate.server";

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ka: "Georgian",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  "pt-br": "Brazilian Portuguese",
  "pt-pt": "European Portuguese",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  nb: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  cs: "Czech",
  el: "Greek",
  hu: "Hungarian",
  ro: "Romanian",
  ru: "Russian",
  uk: "Ukrainian",
  tr: "Turkish",
  ar: "Arabic",
  he: "Hebrew",
  fa: "Persian",
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  id: "Indonesian",
  ms: "Malay",
  th: "Thai",
  vi: "Vietnamese",
  ja: "Japanese",
  ko: "Korean",
  "zh-cn": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
};

function langName(code: string): string {
  const c = code.toLowerCase();
  return LANG_NAMES[c] ?? c;
}

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        let texts: string[] = [];
        let target = "en";
        try {
          const body = (await request.json()) as {
            texts?: unknown;
            target?: unknown;
          };
          if (Array.isArray(body.texts)) {
            texts = body.texts.filter((t): t is string => typeof t === "string");
          }
          if (typeof body.target === "string") target = body.target;
        } catch {
          return corsJson({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (texts.length === 0) {
          return corsJson({ translations: [] });
        }
        if (!target || target.toLowerCase().startsWith("en")) {
          return corsJson({ translations: texts });
        }

        // Migrated to Google Cloud Translation v2. Previously this
        // called Anthropic Haiku with a JSON-output prompt (which
        // had replaced an even worse Lovable Gateway / Gemini path
        // that was leaking system prompts + foreign characters
        // into the cache — Beka caught a Bengali "উ" prepended to
        // "ნიუ იორკი" on the home page city card because the old
        // Haiku-via-JSON path landed garbage in localStorage).
        //
        // Google Translate is a real translation service: no JSON
        // parsing, no garbage characters, much faster. Same path
        // the content translator now uses (translatePayload.server.ts).
        try {
          const translations = await googleTranslateBatch(texts, target);
          // Anti-garbage filter still runs as a belt-and-braces gate —
          // Google output is normally clean, but a network blip
          // returns the source array unchanged via the helper's
          // fallback, and the filter is fine with that.
          const sanitized = translations.map((t, i) =>
            looksLikeGatewayGarbage(t, texts[i], target) ? texts[i] : t,
          );
          return corsJson({ translations: sanitized });
        } catch {
          return corsJson({ translations: texts });
        }
      },
    },
  },
});

function looksLikeGatewayGarbage(translated: string, source: string, target: string): boolean {
  if (typeof translated !== "string") return true;
  const t = translated.trim();
  if (!t) return true;
  if (/\b(ValueError|TypeError|KeyError|Exception|Traceback|RuntimeError|stacktrace)\b/i.test(t))
    return true;
  if (/default_api\.|return_translations\s*\(/i.test(t)) return true;
  if (/translate (every|each|the|all) input string/i.test(t)) return true;
  if (/preserve placeholders like \{name\}/i.test(t)) return true;
  if (source.length >= 5 && t.length > source.length * 10) return true;
  if (source.length >= 4 && t.length <= 2) return true;
  // Trailing / mid-string bracket junk — "टोक्यो))", "रोम]))"
  if (/[)\]}>]{2,}\s*$/.test(t)) return true;
  if (/[)\]}>]{2,}\s+\S/.test(t)) return true;
  // Wrong-script result for descriptive text (≥8 chars). Prevents
  // English (or any other language) from being cached under a Hindi/
  // Georgian/Arabic key.
  if (source.length >= 8 && hasWrongScript(t, target)) return true;
  return false;
}

function hasWrongScript(text: string, target: string): boolean {
  const lc = (target || "").toLowerCase();
  const scriptOf: Array<[string, RegExp]> = [
    ["ka", /[\u10A0-\u10FF]/],
    ["hi", /[\u0900-\u097F]/],
    ["bn", /[\u0980-\u09FF]/],
    ["ur", /[\u0600-\u06FF]/],
    ["ru", /[\u0400-\u04FF]/],
    ["uk", /[\u0400-\u04FF]/],
    ["ar", /[\u0600-\u06FF]/],
    ["fa", /[\u0600-\u06FF]/],
    ["he", /[\u0590-\u05FF]/],
    ["el", /[\u0370-\u03FF]/],
    ["th", /[\u0E00-\u0E7F]/],
    ["ja", /[\u3040-\u30FF\u4E00-\u9FFF]/],
    ["ko", /[\uAC00-\uD7AF]/],
    ["zh", /[\u4E00-\u9FFF]/],
  ];
  for (const [prefix, rx] of scriptOf) {
    if (lc.startsWith(prefix)) return !rx.test(text);
  }
  return false;
}
