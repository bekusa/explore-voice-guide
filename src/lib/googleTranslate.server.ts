/**
 * Google Cloud Translation API v2 (Basic) — drop-in replacement for
 * the previous Anthropic Haiku translation pipeline.
 *
 * Why we picked it:
 *   - It's a real translation service, not an LLM. No hallucinations,
 *     no truncated JSON, no system-prompt leakage. Garbage-detection
 *     filters that lived around the LLM path can be retired.
 *   - 5-10x faster than Haiku (1-2 s for a 50-string batch).
 *   - Doesn't compete with Anthropic for rate-limit budget — Google
 *     and Anthropic accounts are separate quotas.
 *   - $20 / 1M characters (≈ $0.02 per cold-cache attractions search).
 *
 * Setup required:
 *   1. Enable "Cloud Translation API" in the Google Cloud project
 *      that already hosts the Places API key.
 *   2. Create / reuse an API key with "Cloud Translation API" added
 *      to its API restrictions.
 *   3. Set GOOGLE_TRANSLATE_KEY in Lovable Project Secrets.
 *
 * Falls back to the source strings if the env var is missing or the
 * call fails — same defensive behaviour the old LLM path had.
 */

const TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";

/**
 * Map app language codes (BCP-47, lowercased) to Google Translate
 * language codes. Google uses ISO-639-1 mostly, with a handful of
 * regional variants for Chinese.
 */
function toGoogleLang(target: string): string {
  const t = target.trim().toLowerCase();
  // Chinese variants — Google needs uppercase region
  if (t === "zh-cn" || t === "zh") return "zh-CN";
  if (t === "zh-tw") return "zh-TW";
  // Portuguese — Google v2 supports a single "pt"; both pt-br + pt-pt
  // collapse to that. v3 has pt-BR/pt-PT but adds setup overhead.
  if (t.startsWith("pt-") || t === "pt") return "pt";
  // Norwegian Bokmål — Google uses "no" for both bokmål + nynorsk
  if (t === "nb" || t === "no") return "no";
  // Strip region for everything else (en-US → en, es-MX → es, ka-GE → ka)
  return t.split("-")[0];
}

/**
 * Translate an array of strings via Google Cloud Translation API v2.
 *
 * Returns the array of translated strings in the same order; on any
 * failure (missing key, network error, malformed response), returns
 * the original strings unchanged.
 *
 * Source language is always "en" because the upstream pipeline
 * always caches an English baseline before translating to user
 * language.
 *
 * Batches: Google v2 accepts up to ~128 strings per request and a
 * total payload size around 30 KB. Our chunking keeps batches well
 * inside both, but we still split anything over 100 strings just
 * to stay safely under the per-request limits.
 */
export async function googleTranslateBatch(texts: string[], target: string): Promise<string[]> {
  if (texts.length === 0) return [];
  const apiKey = typeof process !== "undefined" ? process.env?.GOOGLE_TRANSLATE_KEY : undefined;
  if (!apiKey) {
    console.warn("[googleTranslate] GOOGLE_TRANSLATE_KEY missing — returning source strings");
    return texts;
  }

  const targetLang = toGoogleLang(target);
  if (!targetLang || targetLang === "en") return texts;

  // Split into 100-string sub-batches to stay safely under the v2
  // per-request payload cap. Each sub-batch is one HTTP call, but
  // they run in parallel — Google's rate limit is generous (500K
  // chars / 100 s by default) and these are tiny in comparison.
  const SUB_BATCH = 100;
  const subBatches: string[][] = [];
  for (let i = 0; i < texts.length; i += SUB_BATCH) {
    subBatches.push(texts.slice(i, i + SUB_BATCH));
  }

  try {
    const results = await Promise.all(
      subBatches.map((batch) => translateOneBatch(batch, targetLang, apiKey)),
    );
    return results.flat();
  } catch (err) {
    console.warn("[googleTranslate] batch failed", err);
    return texts;
  }
}

async function translateOneBatch(
  texts: string[],
  targetLang: string,
  apiKey: string,
): Promise<string[]> {
  const body = {
    q: texts,
    target: targetLang,
    source: "en",
    format: "text" as const,
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[googleTranslate] HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  type TranslateResponse = {
    data?: {
      translations?: Array<{ translatedText?: string }>;
    };
    error?: { message?: string };
  };

  const data = (await res.json()) as TranslateResponse;
  if (data.error) {
    throw new Error(`[googleTranslate] ${data.error.message ?? "unknown error"}`);
  }

  const translations = data.data?.translations ?? [];
  if (translations.length !== texts.length) {
    throw new Error(
      `[googleTranslate] response length mismatch: expected ${texts.length}, got ${translations.length}`,
    );
  }

  // The v2 API returns plaintext when format="text". HTML entities
  // in the source (rare for our content) would NOT be auto-decoded
  // when format is "text", so we don't need decoding here.
  return translations.map((t, i) => t.translatedText ?? texts[i]);
}
