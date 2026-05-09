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
import { callClaude, parseClaudeJson } from "@/lib/anthropic.server";

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
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (texts.length === 0) {
          return Response.json({ translations: [] });
        }
        if (!target || target.toLowerCase().startsWith("en")) {
          return Response.json({ translations: texts });
        }

        // Migrated from Lovable AI Gateway (Gemini 2.5 Flash) to
        // Anthropic Claude Haiku — the gateway was leaking garbage
        // (truncations, wrong-language responses, system-prompt
        // echoes) badly enough that every cached UI string was
        // corrupted. Claude is more expensive but reliable; UI
        // strings are batch-cached in browser localStorage so the
        // cost is paid once per (user, lang).
        const targetName = langName(target);

        const system = [
          `You are a professional translator.`,
          `Translate every input string to ${targetName}.`,
          `Preserve placeholders like {name}, {n}, {city} EXACTLY (do not translate or remove them).`,
          `Preserve punctuation, ellipses, ampersands, line breaks, and the literal "|" character.`,
          `Do not add commentary, quotes, or markdown.`,
          `RESPOND WITH ONLY VALID JSON. No markdown fences, no preamble.`,
          `Output shape: {"translations": ["<translated string 1>", ...]}.`,
          `Return EXACTLY ${texts.length} translated strings, in the same order as the input.`,
        ].join(" ");

        const userMessage = JSON.stringify({ strings: texts }, null, 0);

        try {
          const text = await callClaude({
            model: "claude-haiku-4-5",
            system,
            user: userMessage,
            maxTokens: 4096,
            temperature: 0.3,
          });
          const parsedJson = parseClaudeJson(text) as { translations?: unknown } | undefined;
          if (!parsedJson || !Array.isArray(parsedJson.translations)) {
            return Response.json({ translations: texts });
          }
          const out = parsedJson.translations.filter((s): s is string => typeof s === "string");

          // Guard array length
          const aligned = out.length === texts.length ? out : texts.map((t, i) => out[i] ?? t);

          // Anti-garbage: the gateway has been seen to leak Python
          // tracebacks, system-prompt echoes, truncated nonsense
          // ("टोक्यो)) flores"), and wrong-language results into the
          // translations array. Detect those patterns and substitute
          // the source string back so we never cache them. Beka saw
          // corrupted destination names on the home screen because
          // this filter wasn't running before.
          const sanitized = aligned.map((t, i) =>
            looksLikeGatewayGarbage(t, texts[i], target) ? texts[i] : t,
          );

          return Response.json({ translations: sanitized });
        } catch {
          return Response.json({ translations: texts });
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
