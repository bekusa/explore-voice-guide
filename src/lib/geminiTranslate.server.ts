import { logError } from "@/lib/errorLog.server";

/**
 * Gemini Flash translation — replaces Google Cloud Translation v2
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
 *
 * ── 2026-11-28: the model was switched off under us ─────────────────
 * Beka: "ქართულ ენაზე ჩავწერე ბაგრატის კათედრალი … ინგლისურად
 * გამოაქვს". Every translation had been failing since about
 * 2026-11-13: the last non-English row in cached_guides is from that
 * day, cached_attractions three days earlier, and the Gemini API page in
 * Google Cloud showed 100 % errors. `gemini-2.0-flash` was deprecated
 * with a June 2026 shutdown date and Google finally turned it off. The
 * Google v2 fallback did not catch it either (zero traffic on the Cloud
 * Translation API — its key is missing or points elsewhere), so every
 * non-English user got English guides and English voice for two weeks,
 * and NOTHING was recorded: this file only ever console.warn'ed.
 *
 * Fixed three ways:
 *   1. A current model, with a second one to fall back to if the first
 *      is ever retired the same way (404 / "not found").
 *   2. Every failure now lands in error_logs (service "gemini"), at most
 *      once a minute per kind of failure per Worker, so the dashboard
 *      shows it the same day instead of two weeks later.
 *   3. More output room — the new models count their (minimal) thinking
 *      against the same cap, and a long Georgian script was already
 *      close to the old 8192.
 */

/* gemini-3.5-flash-lite: Google's recommended low-cost model for new
 * work, no shutdown date announced, thinking defaults to "minimal" so a
 * translation costs barely more than its output. gemini-3.1-flash-lite
 * (shutdown no earlier than May 2027) is the safety net. Paid tier,
 * 3.1-flash-lite: $0.25 / 1M input, $1.50 / 1M output — roughly 2 US
 * cents for a full guide into Georgian. */
const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/** Retired or unknown model — worth trying the next one; anything else is not. */
function isModelGone(status: number, body: string): boolean {
  return status === 404 || (status === 400 && /not found|not supported|unknown model/i.test(body));
}

/* One row per failure kind per minute per isolate. During an outage
 * every guide request fails the same way; a row each would bury the
 * dashboard, a row a minute still makes the outage impossible to miss. */
const lastLogged = new Map<string, number>();

async function reportFailure(
  what: string,
  message: string,
  status: number | null,
  context: Record<string, unknown>,
): Promise<void> {
  console.warn(`[geminiTranslate] ${what}: ${message}`);
  const now = Date.now();
  const sig = `${what}|${status ?? ""}`;
  if (now - (lastLogged.get(sig) ?? 0) < 60_000) return;
  lastLogged.set(sig, now);
  await logError({
    service: "gemini",
    route: "translate",
    status,
    ...(status == null ? { kind: what === "network" ? "network" : "bad-response" } : {}),
    message: `${what}: ${message}`.slice(0, 600),
    context,
  });
}

/**
 * Translate an array of strings via Gemini Flash-Lite. Returns the
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
    await reportFailure("config", "GEMINI_API_KEY missing — returning source", null, {
      target: targetLangName,
    });
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
      // Output cap. Thinking tokens count against it on the current
      // models, and a full guide script in Georgian runs to several
      // thousand tokens on its own — 8192 was already close.
      maxOutputTokens: 16384,
    },
  };
  const ctx = { target: targetLangName, strings: texts.length };

  let res: Response | null = null;
  let model: string = GEMINI_MODELS[0];
  for (const m of GEMINI_MODELS) {
    model = m;
    try {
      res = await fetch(`${geminiUrl(m)}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      await reportFailure("network", String(err), null, { ...ctx, model: m });
      return texts;
    }
    if (res.ok) break;
    const errTxt = await res.text().catch(() => "");
    await reportFailure("http", errTxt.slice(0, 300) || "(empty body)", res.status, {
      ...ctx,
      model: m,
    });
    if (!isModelGone(res.status, errTxt)) return texts;
    res = null; // retired model — try the next one
  }
  if (!res) return texts;

  type GeminiResponse = {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch (err) {
    await reportFailure("parse", `response body: ${String(err)}`, null, { ...ctx, model });
    return texts;
  }

  // Join the answer parts; skip any thought part a thinking model adds.
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) {
    await reportFailure("empty", `no text (finishReason ${candidate?.finishReason ?? "?"})`, null, {
      ...ctx,
      model,
    });
    return texts;
  }

  let translations: unknown;
  try {
    translations = JSON.parse(text);
  } catch (err) {
    await reportFailure(
      "parse",
      `model JSON (finishReason ${candidate?.finishReason ?? "?"}): ${String(err)}`,
      null,
      { ...ctx, model, chars: text.length },
    );
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
    await reportFailure("shape", "unexpected response shape", null, { ...ctx, model });
    return texts;
  }

  if (arr.length !== texts.length) {
    await reportFailure(
      "shape",
      `length mismatch: expected ${texts.length}, got ${arr.length}`,
      null,
      { ...ctx, model },
    );
    return texts;
  }

  return arr.map((v, i) => (typeof v === "string" ? v : texts[i]));
}
