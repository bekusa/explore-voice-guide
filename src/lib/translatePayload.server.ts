/**
 * Server-side helpers that translate the dynamic content fields of
 * an n8n attractions / guide payload from English into another
 * language, by calling the Lovable AI Gateway directly.
 *
 * Why this exists: caching the n8n response per-language meant 7
 * Claude calls per city to cover the top languages — at ~$0.05-0.10
 * each, that's ~$0.50/city × 25 cities = $12+ just to seed Top-25.
 * Caching ONLY the English version and translating on demand drops
 * the per-language cost to ~$0.01 (Gemini Flash) and re-uses one
 * Claude call across every locale we ever serve.
 *
 * Strategy:
 *   - Caller passes a payload + target lang.
 *   - We walk the known translatable fields (descriptions, types,
 *     era, situation, key_facts, tips, look_for, nearby.desc).
 *   - We DO NOT translate proper nouns: place names, attraction
 *     `name` fields, hero image URLs, lat/lng, rating numbers.
 *   - We collect all translatable strings into one batch, send to
 *     the gateway, splice the results back into a deep clone.
 *
 * Failure mode: gateway error / no API key → we return the payload
 * unchanged (English). Better to surface English than to fail the
 * request and spike a Claude retry.
 */

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
  return LANG_NAMES[code.toLowerCase()] ?? code;
}

/**
 * Treat anything that starts with "en" as a no-op target (the
 * payload is already English).
 */
function isEnglish(target: string): boolean {
  return !target || target.toLowerCase().startsWith("en");
}

/**
 * Issue one gateway call for a small batch of strings. Used by
 * `callGateway` which slices the full input into safe-sized chunks
 * — long guide scripts trip Gemini's tool-output token cap when sent
 * in one go and the response truncates silently to the input array.
 */
async function callGatewayChunk(
  texts: string[],
  target: string,
  apiKey: string,
): Promise<string[]> {
  const targetName = langName(target);
  const system = [
    `You are a professional travel-content translator.`,
    `Translate every input string to ${targetName}.`,
    `Preserve placeholders like {name}, {n}, {city} EXACTLY.`,
    `Preserve URLs, numbers, em-dashes, and the literal "|" character.`,
    `Do not translate proper nouns of places (e.g. "Marina Bay Sands", "Colosseum") — keep them in their original form, optionally appending a transliteration in parentheses if meaningful.`,
    `Keep tone natural and travel-magazine quality.`,
    `Return the same number of strings, in the same order, via the provided tool.`,
  ].join(" ");

  try {
    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ strings: texts }) },
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
                    description: "Translated strings in the same order as input.strings",
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
    });
    if (!upstream.ok) return texts;
    const data = (await upstream.json()) as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
      }>;
    };
    const argsRaw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsRaw) return texts;
    const parsed = JSON.parse(argsRaw) as { translations?: unknown };
    const out =
      Array.isArray(parsed.translations) && parsed.translations.every((s) => typeof s === "string")
        ? (parsed.translations as string[])
        : texts;
    return out.length === texts.length ? out : texts.map((t, i) => out[i] ?? t);
  } catch {
    return texts;
  }
}

/**
 * Call the Lovable AI Gateway with chunking + size guards so that
 * a single very long string (say, a 5KB guide script) doesn't
 * starve smaller items in the same batch. Strategy:
 *
 *   - Long strings (> 1500 chars) get a chunk of size 1.
 *   - Everything else is grouped up to 6 strings per chunk.
 *
 * Failure mode is preserved: any chunk that errors keeps its source
 * strings, so the caller still sees something sensible.
 */
async function callGateway(texts: string[], target: string): Promise<string[]> {
  if (texts.length === 0) return [];
  if (isEnglish(target)) return texts;

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return texts;

  const LONG = 1500;
  const MAX_PER_CHUNK = 6;
  const chunks: number[][] = []; // each chunk holds the original indices
  let current: number[] = [];
  let currentChars = 0;

  texts.forEach((s, i) => {
    if (s.length > LONG) {
      // Flush any accumulating chunk, then send this big string alone.
      if (current.length > 0) {
        chunks.push(current);
        current = [];
        currentChars = 0;
      }
      chunks.push([i]);
      return;
    }
    if (current.length >= MAX_PER_CHUNK || currentChars + s.length > 4000) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(i);
    currentChars += s.length;
  });
  if (current.length > 0) chunks.push(current);

  // Fan out chunks in parallel — each call independent so a slow
  // long-script translation doesn't block the short-text ones.
  const results = await Promise.all(
    chunks.map(async (idxs) => {
      const slice = idxs.map((i) => texts[i]);
      const out = await callGatewayChunk(slice, target, apiKey);
      return { idxs, out };
    }),
  );

  const merged = texts.slice();
  for (const { idxs, out } of results) {
    idxs.forEach((origIdx, j) => {
      merged[origIdx] = out[j] ?? texts[origIdx];
    });
  }
  return merged;
}

/**
 * How "different" the translated array is from the source. Used to
 * decide whether translation actually ran — Gemini occasionally
 * returns the source verbatim on overload, and we don't want to
 * cache that as if it were the target language.
 *
 * Char-weighted: a single 3000-char description carries more signal
 * than a dozen 5-char chips. Earlier the count-based 50% rule
 * misfired on attractions payloads where short fields ("Museum",
 * "Park") sometimes survived the gateway untouched while the long
 * descriptions were genuinely translated — payload was 95% Georgian
 * by content but only 40% of items differed by count → we falsely
 * marked it failed and skipped the cache write.
 */
export function translationLooksReal(source: string[], translated: string[]): boolean {
  if (source.length === 0) return true;
  if (translated.length !== source.length) return false;
  let changedChars = 0;
  let totalChars = 0;
  for (let i = 0; i < source.length; i++) {
    const s = source[i].trim();
    const t = translated[i].trim();
    totalChars += s.length;
    if (s !== t) changedChars += s.length;
  }
  if (totalChars === 0) return true;
  // 25% of characters changed = successful translation. Lenient on
  // purpose — the alternative (refusing to cache) leaves the user
  // staring at English forever. False positives just mean a noisy
  // payload gets cached as ka; the client still renders fine.
  return changedChars / totalChars >= 0.25;
}

/* ─── Field selectors ─── */

type AttractionRecord = Record<string, unknown>;

/**
 * Fields on each attraction that hold human prose worth translating.
 *
 * `name` is intentionally absent — see the prompt note above; place
 * names are preserved so search/maps still work.
 *
 * `category` and `duration` are also OUT now: they're either technical
 * IDs ("history", "editors") that the gateway sensibly leaves alone,
 * or short numeric strings ("30-60 min") with mostly digits. Keeping
 * them in the source set inflated the "unchanged" count and caused
 * `translationLooksReal` to mark genuinely-translated payloads as
 * failed, blocking the cache write under the user-language key. Beka
 * observed this as "ka cache rows never appear, only en".
 */
const ATTRACTION_TRANSLATABLE_FIELDS = [
  "type",
  "era",
  "situation",
  "outside_desc",
  "insider_desc",
  "description",
  "desc",
] as const;

/**
 * Translate an attractions list response from English into the
 * target language. Returns both the (possibly-)translated payload
 * AND a `translated` flag — caller uses the flag to decide whether
 * to cache the result as the target-language row, or skip the cache
 * write when translation visibly failed (so we don't pin English
 * content under a Georgian key forever).
 */
export async function translateAttractionsPayload(
  payload: unknown,
  target: string,
): Promise<{ payload: unknown; translated: boolean }> {
  if (isEnglish(target)) return { payload, translated: true };
  if (!payload || typeof payload !== "object") return { payload, translated: false };

  const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const list = pickAttractionsArray(cloned);
  if (!list) return { payload: cloned, translated: false };

  const sources: string[] = [];
  const slots: Array<{ row: AttractionRecord; field: string }> = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as AttractionRecord;
    for (const field of ATTRACTION_TRANSLATABLE_FIELDS) {
      const v = row[field];
      if (typeof v === "string" && v.trim().length > 0) {
        sources.push(v);
        slots.push({ row, field });
      }
    }
  }

  if (sources.length === 0) return { payload: cloned, translated: true };

  const translated = await callGateway(sources, target);
  // Sanitize: replace any obviously-garbage gateway response with the
  // source string before splicing into the payload. The gateway has
  // been seen to return Python stack traces ("ValueError: ..."),
  // its own system prompt, or truncated nonsense ("თ=[") inside the
  // translations array — we cached those in production and they
  // showed up as destination names on the home screen.
  const safe = translated.map((t, i) => (looksLikeGarbage(t, sources[i], target) ? sources[i] : t));
  for (let i = 0; i < slots.length; i++) {
    slots[i].row[slots[i].field] = safe[i] ?? sources[i];
  }
  return { payload: cloned, translated: translationLooksReal(sources, safe) };
}

function pickAttractionsArray(obj: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(obj.attractions)) return obj.attractions;
  // n8n sometimes wraps differently — be tolerant.
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.items)) return obj.items;
  return null;
}

/* ─── Guide payload ─── */

const GUIDE_TRANSLATABLE_FIELDS = ["title", "script"] as const;
const GUIDE_TRANSLATABLE_ARRAYS = ["key_facts", "look_for", "tips"] as const;

/**
 * Translate a rich guide payload (script + chips + tips + nearby).
 * Returns both the result and a `translated` flag — see the
 * attractions variant above for the rationale.
 */
export async function translateGuidePayload(
  payload: unknown,
  target: string,
): Promise<{ payload: unknown; translated: boolean }> {
  if (isEnglish(target)) return { payload, translated: true };
  if (!payload || typeof payload !== "object") return { payload, translated: false };

  const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  const sources: string[] = [];
  const setters: Array<(value: string) => void> = [];

  for (const field of GUIDE_TRANSLATABLE_FIELDS) {
    const v = cloned[field];
    if (typeof v === "string" && v.trim().length > 0) {
      sources.push(v);
      setters.push((value) => {
        cloned[field] = value;
      });
    }
  }

  for (const field of GUIDE_TRANSLATABLE_ARRAYS) {
    const arr = cloned[field];
    if (Array.isArray(arr)) {
      arr.forEach((item, idx) => {
        if (typeof item === "string" && item.trim().length > 0) {
          sources.push(item);
          setters.push((value) => {
            (cloned[field] as unknown[])[idx] = value;
          });
        }
      });
    }
  }

  // nearby_suggestions: array of {name, desc} — translate desc only
  const nearby = cloned.nearby_suggestions;
  if (Array.isArray(nearby)) {
    nearby.forEach((entry, idx) => {
      if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.desc === "string" && obj.desc.trim().length > 0) {
          sources.push(obj.desc);
          setters.push((value) => {
            (nearby[idx] as Record<string, unknown>).desc = value;
          });
        }
      }
    });
  }

  if (sources.length === 0) return { payload: cloned, translated: true };

  const translated = await callGateway(sources, target);
  // Same garbage filter as the attractions path — we've seen Gateway
  // dumps of Python errors and system prompts make it into cached rows.
  const safe = translated.map((t, i) => (looksLikeGarbage(t, sources[i], target) ? sources[i] : t));
  for (let i = 0; i < setters.length; i++) {
    setters[i](safe[i] ?? sources[i]);
  }
  return { payload: cloned, translated: translationLooksReal(sources, safe) };
}

/**
 * Does this "translated" string look like the gateway misfired?
 * Triggers on:
 *   - Python / JS error patterns (ValueError, Traceback, Exception)
 *   - Translation-instruction echoes ("Translate every input string")
 *   - Length explosions (>10× the source — Gemini going on a monologue)
 *   - Dead-short fragments (≤2 chars when source is much longer —
 *     truncation like "თ=[" for "Tokyo")
 *   - Wrong script entirely (target=ka but result is pure ASCII when
 *     source already had Georgian letters available)
 *
 * Lenient on legit short-to-short translations (e.g. "OK" → "კარგი")
 * by requiring the source to be ≥4 chars before the truncation guard
 * fires.
 */
function looksLikeGarbage(translated: string, source: string, _target: string): boolean {
  if (typeof translated !== "string") return true;
  const t = translated.trim();
  if (!t) return true;
  // Python / JS exception traces leaking through
  if (/\b(ValueError|TypeError|KeyError|Exception|Traceback|RuntimeError|stacktrace)\b/i.test(t))
    return true;
  if (/default_api\.|return_translations\s*\(/i.test(t)) return true;
  // System-prompt echo (Gemini repeating instructions back at us)
  if (/translate (every|each|the|all) input string/i.test(t)) return true;
  if (/preserve placeholders like \{name\}/i.test(t)) return true;
  // Length explosion — translation should never be 10× the source
  if (source.length >= 5 && t.length > source.length * 10) return true;
  // Dead-short truncation
  if (source.length >= 4 && t.length <= 2) return true;
  return false;
}
