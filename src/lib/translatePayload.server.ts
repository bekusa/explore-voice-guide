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
  _apiKey: string,
): Promise<string[]> {
  // Migrated from the Lovable AI Gateway (Gemini 2.5 Flash via BYOK)
  // to Anthropic Claude Haiku 4.5. Beka observed Gemini repeatedly
  // leaking garbage into the translations array — Python tracebacks,
  // its own system prompt, "टोक्यो)) flores", English under a Hindi
  // key, etc — and the anti-garbage filters kept catching everything
  // and falling back to English source. Net effect: nothing
  // translated. Claude Haiku is more expensive (~$1/MT input vs
  // Gemini's free BYOK) but produces clean output that respects the
  // target language. Cached forever per (place, lang) so the cost
  // is paid once per locale, not per visit.
  const targetName = langName(target);
  const system = [
    `You are a professional travel-content translator.`,
    `Translate every input string into ${targetName}.`,
    `Preserve placeholders like {name}, {n}, {city} EXACTLY.`,
    `Preserve URLs, numbers, em-dashes, and the literal "|" character.`,
    // Beka observed Georgian guide descriptions arriving as one
    // unbroken wall of text where the English source had clean
    // paragraph breaks. The translator must keep the source's
    // line / paragraph structure character-for-character — every
    // \\n stays a \\n, every blank-line gap stays a blank-line gap.
    `CRITICAL: Preserve ALL line breaks and paragraph breaks from the source EXACTLY. If the source has "\\n\\n" between paragraphs, the translation must too. Do not concatenate paragraphs.`,
    `Do not translate proper nouns of places ("Marina Bay Sands", "Colosseum") — keep them in their original form.`,
    `Keep tone natural and travel-magazine quality.`,
    `RESPOND WITH ONLY VALID JSON. No markdown fences, no preamble, no commentary.`,
    `Output shape: {"translations": ["<translated string 1>", "<translated string 2>", ...]}.`,
    `Return EXACTLY ${texts.length} translated strings, in the same order as the input.`,
  ].join(" ");

  const userMessage = JSON.stringify({ strings: texts });

  try {
    const text = await callClaude({
      model: "claude-haiku-4-5",
      system,
      user: userMessage,
      // Roughly 4× the input character count + headroom — translation
      // output usually stays close to source length; 4096 covers up to
      // the longest single guide-script chunk we send.
      maxTokens: 4096,
      // Lower temperature for translation — we want consistency, not
      // creative re-wording.
      temperature: 0.3,
    });
    const parsed = parseClaudeJson(text) as { translations?: unknown } | undefined;
    if (!parsed || !Array.isArray(parsed.translations)) return texts;
    const out = parsed.translations.filter((s): s is string => typeof s === "string");
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

  // Aggressive chunking to fit Anthropic Tier-1 rate limits
  // (10K output tokens/min). The cold-cache Georgian path runs
  // attractions Sonnet (~3K out) + translation chunks back-to-
  // back inside a single minute window — at the previous chunk
  // sizes the cumulative output crossed the cap and triggered
  // 429 retries with retry-after up to 45 s, blowing past the
  // 120-s postJSON timeout.
  //
  // History: 6 → 12 → 25 strings/chunk, char cap 4000 → 6000.
  // Each step roughly halves the round-trip count without
  // breaking Claude's per-request limit (input cap stays well
  // under 100K tokens; output rarely exceeds 4K per chunk
  // because translation output mirrors source length).
  //
  // Once Beka spends $40+ on Anthropic the account auto-
  // promotes to Tier 2 (50K out/min) and the rate ceiling
  // disappears as a constraint. Until then, fewer + larger
  // chunks keep the cold-cache wall under the timeout.
  const LONG = 1500;
  const MAX_PER_CHUNK = 25;
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
    if (current.length >= MAX_PER_CHUNK || currentChars + s.length > 6000) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(i);
    currentChars += s.length;
  });
  if (current.length > 0) chunks.push(current);

  // Serial fan-out — was Promise.all, but Beka hit
  // "Rate limit of 10000 tokens per minute" on Anthropic when a
  // cold-cache Time Machine generation overlapped with a chunked
  // translation pass. Each chunk is its own callClaude (Haiku) and
  // sending 4-6 of them simultaneously can easily trip the
  // per-minute token budget — once we exceed it the whole batch
  // fails together, and the visible "we couldn't load this guide"
  // toast confuses the user. Running them sequentially keeps the
  // bursts narrow, lets callClaude's retry-after kick in cleanly
  // when needed, and adds at most a few seconds of latency on a
  // cold cache miss (cached-language hits don't touch this path).
  const results: Array<{ idxs: number[]; out: string[] }> = [];
  for (const idxs of chunks) {
    const slice = idxs.map((i) => texts[i]);
    const out = await callGatewayChunk(slice, target, apiKey);
    results.push({ idxs, out });
  }

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
 * `name` is now included — Beka observed result cards rendering
 * "Old Town Tbilisi" / "Narikala Fortress" in English even when the
 * user had Georgian selected, which broke immersion. We preserve the
 * English original under `name_en` (set just before the translation
 * pass) so UNESCO matching, photo lookups, and slug stability still
 * have a stable English handle.
 *
 * `category` and `duration` stay OUT: they're either technical IDs
 * ("history", "editors") that the gateway sensibly leaves alone, or
 * short numeric strings ("30-60 min") with mostly digits. Including
 * them inflates the "unchanged" count and trips the looksReal gate.
 */
const ATTRACTION_TRANSLATABLE_FIELDS = [
  "name",
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
    // Preserve the English source name under `name_en` BEFORE the
    // translation pass overwrites `name` with the localized form.
    // Frontend UNESCO matching, photo lookups, and any future
    // technical operation that needs a stable handle should read
    // `name_en` (set on every translated row from now on), falling
    // back to `name` when it isn't present (English baseline rows).
    if (typeof row.name === "string" && row.name.trim().length > 0 && !row.name_en) {
      row.name_en = row.name;
    }
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
 *
 * Beka observed a parade of failure modes from the Lovable AI Gateway:
 *   - Python tracebacks leaking through ("ValueError(...)")
 *   - Gemini echoing its own system prompt back as the translation
 *   - Truncated nonsense ("თ=[" for "Tokyo")
 *   - Length explosions (5-char source → 500-char monologue)
 *   - Trailing bracket junk ("टोक्यो)) flores", "रोम]))")
 *   - Wrong target language entirely (target=hi, response in English)
 *
 * Each check below maps to one of those observed failures.
 */
function looksLikeGarbage(translated: string, source: string, target: string): boolean {
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
  // Trailing bracket junk — "टोक्यो))", "रोम]))", "ბარსელონა]))ა))"
  // Real translations don't end with stray closing brackets/parens.
  if (/[)\]}>]{2,}\s*$/.test(t)) return true;
  // Mid-string bracket junk: ")) flores", "]) extra"
  if (/[)\]}>]{2,}\s+\S/.test(t)) return true;
  // Wrong-script result for a long descriptive source. Threshold
  // lifted 8 → 30 chars because Beka caught the wrong-script check
  // misfiring on short proper-noun-only strings: an English source
  // like "Mona Lisa" or "Louvre" stays Latin in a faithful Georgian
  // translation (the system prompt explicitly tells Claude to
  // preserve proper nouns) — at 8 chars the filter wrongly flagged
  // those as failed and fell back to source. At 30 chars we only
  // reject genuine "Gorbachev resigned on 25 December…" passthroughs
  // where the LLM forgot to translate the whole sentence. Proper-
  // noun mixes inside longer prose are still considered a real
  // translation because at least one Georgian character will appear.
  if (source.length >= 30 && hasWrongScript(t, target)) return true;
  return false;
}

/**
 * True when the translated text doesn't contain any character from
 * the target language's expected script. Only checks for non-Latin
 * targets — for European languages we can't reliably distinguish a
 * legit Spanish translation from an English passthrough by script
 * alone. Returns false for any target we don't have a script range
 * for (so we never reject European-language results just for being
 * Latin).
 */
function hasWrongScript(text: string, target: string): boolean {
  const lc = (target || "").toLowerCase();
  // Each entry: [language prefix, regex of expected script range]
  const scriptOf: Array<[string, RegExp]> = [
    ["ka", /[\u10A0-\u10FF]/], // Georgian
    ["hi", /[\u0900-\u097F]/], // Devanagari (Hindi)
    ["bn", /[\u0980-\u09FF]/], // Bengali
    ["ur", /[\u0600-\u06FF]/], // Urdu (Arabic script)
    ["ru", /[\u0400-\u04FF]/], // Cyrillic
    ["uk", /[\u0400-\u04FF]/], // Cyrillic
    ["ar", /[\u0600-\u06FF]/], // Arabic
    ["fa", /[\u0600-\u06FF]/], // Persian
    ["he", /[\u0590-\u05FF]/], // Hebrew
    ["el", /[\u0370-\u03FF]/], // Greek
    ["th", /[\u0E00-\u0E7F]/], // Thai
    ["ja", /[\u3040-\u30FF\u4E00-\u9FFF]/], // Japanese
    ["ko", /[\uAC00-\uD7AF]/], // Korean
    ["zh", /[\u4E00-\u9FFF]/], // Chinese
  ];
  for (const [prefix, rx] of scriptOf) {
    if (lc.startsWith(prefix)) return !rx.test(text);
  }
  return false;
}

/* ─── Museum highlights payload ─── */

const HIGHLIGHT_TRANSLATABLE_FIELDS = ["name", "era", "brief", "story", "location_hint"] as const;

/**
 * Translate the museum highlights payload — same chunked-translate +
 * sanitize pattern as translateAttractionsPayload, applied to the
 * `highlights[]` array. Always preserves the English source `name`
 * under `name_en` on each row so frontend technical handles (image
 * lookup, deep linking, deduplication) keep working in localised UIs.
 */
export async function translateMuseumHighlightsPayload(
  payload: unknown,
  target: string,
): Promise<{ payload: unknown; translated: boolean }> {
  if (isEnglish(target)) return { payload, translated: true };
  if (!payload || typeof payload !== "object") return { payload, translated: false };

  const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const list = Array.isArray((cloned as { highlights?: unknown }).highlights)
    ? ((cloned as { highlights: unknown[] }).highlights as unknown[])
    : null;
  if (!list) return { payload: cloned, translated: false };

  const sources: string[] = [];
  const slots: Array<{ row: AttractionRecord; field: string }> = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as AttractionRecord;
    // Preserve English name under name_en before the translation pass
    // overwrites name with the localised form. Same pattern as the
    // attractions translator.
    if (typeof row.name === "string" && row.name.trim().length > 0 && !row.name_en) {
      row.name_en = row.name;
    }
    for (const field of HIGHLIGHT_TRANSLATABLE_FIELDS) {
      const v = row[field];
      if (typeof v === "string" && v.trim().length > 0) {
        sources.push(v);
        slots.push({ row, field });
      }
    }
  }

  if (sources.length === 0) return { payload: cloned, translated: true };

  const translated = await callGateway(sources, target);
  const safe = translated.map((t, i) => (looksLikeGarbage(t, sources[i], target) ? sources[i] : t));
  for (let i = 0; i < slots.length; i++) {
    slots[i].row[slots[i].field] = safe[i] ?? sources[i];
  }
  return { payload: cloned, translated: translationLooksReal(sources, safe) };
}

/* ─── Time Machine payload ─── */

const TIME_MACHINE_TRANSLATABLE_FIELDS = ["title", "intro", "body", "epilogue"] as const;

/**
 * Translate a Time Machine simulation payload — the same chunked-
 * translate + sanitize pattern as the guide translator. The `body`
 * field is the long multi-paragraph first-person narrative; the
 * chunker in `callGateway` will hand it off as its own oversized
 * chunk so it doesn't starve the shorter title / intro / epilogue
 * fields. Paragraph breaks (\n\n) inside `body` must survive — see
 * the system prompt in callGatewayChunk.
 */
export async function translateTimeMachinePayload(
  payload: unknown,
  target: string,
): Promise<{ payload: unknown; translated: boolean }> {
  if (isEnglish(target)) return { payload, translated: true };
  if (!payload || typeof payload !== "object") return { payload, translated: false };

  const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  const sources: string[] = [];
  const setters: Array<(value: string) => void> = [];

  for (const field of TIME_MACHINE_TRANSLATABLE_FIELDS) {
    const v = cloned[field];
    if (typeof v === "string" && v.trim().length > 0) {
      sources.push(v);
      setters.push((value) => {
        cloned[field] = value;
      });
    }
  }

  if (sources.length === 0) return { payload: cloned, translated: true };

  const translated = await callGateway(sources, target);
  const safe = translated.map((t, i) => (looksLikeGarbage(t, sources[i], target) ? sources[i] : t));
  for (let i = 0; i < setters.length; i++) {
    setters[i](safe[i] ?? sources[i]);
  }
  return { payload: cloned, translated: translationLooksReal(sources, safe) };
}
