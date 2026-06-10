/**
 * Gemini Flash 2.0 translation — replaces Google Cloud Translation v2
 * (Basic) as Lokali's runtime translator.
 *
 * Why we picked it (Beka's 2026-06-09 call):
 *   - Quality: 9/10 vs v2 Basic's 7/10 — Gemini is a real LLM, so
 *     it gets context. "Georgia" gets translated to "საქართველო"
 *     (the country) instead of "ჯორჯია" (the US state) when the
 *     surrounding strings are clearly about a museum / city.
 *   - Cost: ~$2 per 1M source chars vs $20 for v2. ~10× cheaper.
 *   - Speed: 1-3 seconds per batch — comparable to v2 in practice.
 *   - JSON output: model card supports `responseMimeType: "application/json"`
 *     so we get an array back without prose / pre-amble noise the
 *     old Anthropic-Haiku path used to leak.
 *
 * Fallback behaviour: if the Gemini call fails (missing key, model
 * outage, response parse error), we hand the source strings back to
 * the caller unchanged. The /api/translate route layers Google v2 as
 * a secondary fallback so a Gemini outage doesn't black-hole the
 * whole translation pipeline.
 *
 * Setup required:
 *   - Set `GEMINI_API_KEY` in Lovable Project Secrets (and the
 *     local .env if running cap:android from Windows).
 *   - The API key needs Generative Language API enabled in the
 *     Google Cloud project — same place you turned on Cloud
 *     Translation earlier.
 */

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/**
 * Translate an array of strings via Gemini Flash 2.0. Returns the
 * translated strings in the same order. On any failure returns the
 * source array unchanged so the caller can layer additional
 * fallbacks (Google v2) on top.
 *
 * `targetLangName` is the full English name of the target language
 * ("Georgian", "Japanese", "Brazilian Portuguese", …) so the model
 * understands which dialect to render. The caller already does the
 * BCP-47 → human-name lookup before this function is invoked.
 */
export async function geminiTranslateBatch(
  texts: string[],
  targetLangName: string,
): Promise<string[]> {
  if (texts.length === 0) return [];
  const apiKey = typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined;
  if (!apiKey) {
    console.warn("[geminiTranslate] GEMINI_API_KEY missing — returning source");
    return texts;
  }

  // The model card prompt: explicit about preserving placeholders,
  // proper nouns, and the country-vs-state disambiguation that v2
  // got wrong for Georgia.
  const systemInstruction =
    `You are a translation engine. Translate every input string into ${targetLangName}.\n\n` +
    `Strict rules:\n` +
    `  - Output ONLY a JSON array of translated strings, same length and same order as the input.\n` +
    `  - Do not add comments, prefaces, or explanations.\n` +
    `  - Preserve placeholders like {name}, {n}, %s, {{x}} verbatim.\n` +
    `  - Preserve proper nouns (museum names, artist names, brand names) in their original form unless ${targetLangName} has a well-established conventional spelling.\n` +
    `  - For country and city names, use the canonical ${targetLangName} form (e.g. "Georgia" → the South Caucasus country, not the US state, when context is about a city or museum).\n` +
    `  - Never return the source text untranslated unless it is a brand name, code, or already in ${targetLangName}.\n`;

  const userPayload = JSON.stringify({ inputs: texts });

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPayload }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      // Generous output cap — 2000 short UI strings still fit
      // comfortably inside this budget.
      maxOutputTokens: 8192,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn("[geminiTranslate] network error", err);
    return texts;
  }

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    console.warn(`[geminiTranslate] HTTP ${res.status}: ${errTxt.slice(0, 200)}`);
    return texts;
  }

  type GeminiResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch (err) {
    console.warn("[geminiTranslate] response parse error", err);
    return texts;
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.warn("[geminiTranslate] empty model response");
    return texts;
  }

  let translations: unknown;
  try {
    translations = JSON.parse(text);
  } catch (err) {
    console.warn("[geminiTranslate] JSON parse error", err);
    return texts;
  }

  // Accept both `[...]` (a bare array) and `{ "translations": [...] }`
  // shapes — Gemini sometimes wraps the array in an object even when
  // the system prompt asks for a bare array.
  let arr: unknown[];
  if (Array.isArray(translations)) {
    arr = translations;
  } else if (
    typeof translations === "object" &&
    translations !== null &&
    "translations" in translations &&
    Array.isArray((translations as { translations: unknown }).translations)
  ) {
    arr = (translations as { translations: unknown[] }).translations;
  } else {
    console.warn("[geminiTranslate] unexpected response shape");
    return texts;
  }

  if (arr.length !== texts.length) {
    console.warn(
      `[geminiTranslate] length mismatch: expected ${texts.length}, got ${arr.length}`,
    );
    return texts;
  }

  return arr.map((v, i) => (typeof v === "string" ? v : texts[i]));
}
