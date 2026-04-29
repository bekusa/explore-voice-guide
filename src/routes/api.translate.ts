/**
 * POST /api/translate
 *
 * Body: { texts: string[]; target: string /* lang code */ }
 * Returns: { translations: string[] } in same order.
 *
 * Uses the Lovable AI Gateway. Falls back to source on any error so the
 * UI stays usable even when offline / the gateway is rate-limited.
 */
import { createFileRoute } from "@tanstack/react-router";

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
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        if (texts.length === 0) {
          return Response.json({ translations: [] });
        }
        if (!target || target.toLowerCase().startsWith("en")) {
          return Response.json({ translations: texts });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          // No key: degrade gracefully.
          return Response.json({ translations: texts });
        }

        const targetName = langName(target);

        const system = [
          `You are a professional translator.`,
          `Translate every input string to ${targetName}.`,
          `Preserve placeholders like {name}, {n}, {city} EXACTLY (do not translate or remove them).`,
          `Preserve punctuation, ellipses, ampersands, line breaks, and the literal "|" character.`,
          `Do not add commentary, quotes, or markdown.`,
          `Return the same number of strings, in the same order, via the provided tool.`,
        ].join(" ");

        const userPrompt = JSON.stringify({ strings: texts }, null, 0);

        try {
          const upstream = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: userPrompt },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "return_translations",
                      description: `Return translations into ${targetName}.`,
                      parameters: {
                        type: "object",
                        properties: {
                          translations: {
                            type: "array",
                            items: { type: "string" },
                            description:
                              "Translated strings in the same order as input.strings",
                          },
                        },
                        required: ["translations"],
                        additionalProperties: false,
                      },
                    },
                  },
                ],
                tool_choice: {
                  type: "function",
                  function: { name: "return_translations" },
                },
              }),
            },
          );

          if (!upstream.ok) {
            // 429/402/etc — fall back to source so UI doesn't freeze.
            return Response.json({ translations: texts });
          }

          const data = (await upstream.json()) as {
            choices?: Array<{
              message?: {
                tool_calls?: Array<{
                  function?: { arguments?: string };
                }>;
              };
            }>;
          };

          const argsRaw =
            data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (!argsRaw) return Response.json({ translations: texts });

          let parsed: { translations?: unknown };
          try {
            parsed = JSON.parse(argsRaw);
          } catch {
            return Response.json({ translations: texts });
          }
          const out =
            Array.isArray(parsed.translations) &&
            parsed.translations.every((s) => typeof s === "string")
              ? (parsed.translations as string[])
              : texts;

          // Guard array length
          const aligned =
            out.length === texts.length
              ? out
              : texts.map((t, i) => out[i] ?? t);

          return Response.json({ translations: aligned });
        } catch {
          return Response.json({ translations: texts });
        }
      },
    },
  },
});
