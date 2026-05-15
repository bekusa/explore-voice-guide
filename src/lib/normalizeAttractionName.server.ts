import { callClaude } from "@/lib/anthropic.server";

/**
 * Canonical-English-name normalisation for cache keys.
 *
 * Without this, the cache treated "Khlong Lat Mayom Floating Market"
 * (English search) and "პაკ ხლონგ ტალატი" (Georgian search) as two
 * different attractions — each got its own English baseline and its
 * own per-language translation, paying the Sonnet cost twice and
 * producing the duplicate rows Beka caught in cached_guides:
 *
 *   name="khlong lat mayom floating market", language="en"
 *   name="პაკ ხლონგ ტალატი",                  language="en"   ← dup
 *   name="khlong lat mayom floating market", language="ka"
 *   name="პაკ ხლონგ ტალატი",                  language="ka"   ← dup
 *
 * The fix: before any cache lookup, ask Haiku to translate the
 * input name to its canonical English form and use THAT as the
 * cache key. So all four rows above collapse to one English
 * baseline + one ka translation.
 *
 * Cost: one extra Haiku call per cold-cache request (~1-2s, ~$0.0003)
 * for non-English inputs. English inputs short-circuit. Cached
 * mappings reuse a per-worker in-memory Map so repeat lookups
 * within a hot worker are free.
 *
 * Failure modes: if the Haiku translation fails or returns garbage,
 * we fall back to the original name. Worst case the cache
 * fragments slightly (the same as the pre-fix behaviour) — never
 * worse, never blocks generation.
 */

const nameCache = new Map<string, string>();
const CACHE_LIMIT = 5000;

const SYSTEM_PROMPT =
  "You translate landmark / attraction / city names into their canonical English form. " +
  "Respond with ONLY the English name. No quotes, no markdown, no explanation, no punctuation around it. " +
  "If the input is already in English, repeat it back unchanged. " +
  "If the input is a transliteration (e.g. Georgian phonetic spelling of a Thai place), " +
  "return the standard English Wikipedia / Google Maps spelling. " +
  "Examples: " +
  '"პარიზი" → "Paris"; ' +
  '"პაკ ხლონგ ტალატი" → "Khlong Lat Mayom Floating Market"; ' +
  '"თბილისი" → "Tbilisi"; ' +
  '"Eiffel Tower" → "Eiffel Tower".';

/**
 * Translate `name` to its canonical English form. English inputs
 * pass through unchanged.
 *
 * Returns the original name on any failure — callers should use
 * the result as a cache key, never replace user-facing strings.
 */
export async function normalizeToCanonicalEnglish(
  name: string,
  sourceLang: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  // English inputs are already canonical. We also treat empty /
  // missing language as English to be safe — better to skip the
  // call than to mis-translate a name we already have right.
  if (!sourceLang || sourceLang.toLowerCase().startsWith("en")) {
    return trimmed;
  }

  // Pure-ASCII fast path. Even if the user has the UI in Georgian
  // ("ka"), they often type English place names directly — "Paris",
  // "Bangkok", "Eiffel Tower". The query has no non-Latin chars to
  // translate, so the normalization Haiku call is wasted latency
  // (~1-2 s + a chance of catching a 429 retry on Tier-1). Beka
  // hit 120-s timeouts after the previous fix added this call to
  // the cold-cache path; ASCII detection short-circuits before any
  // network hit. Allows Latin letters, digits, common punctuation,
  // and whitespace — anything else (Georgian Mkhedruli, Arabic,
  // CJK, etc.) needs the actual translation step.
  if (/^[\x20-\x7E]+$/.test(trimmed)) {
    return trimmed;
  }

  const cacheKey = `${sourceLang.toLowerCase()}:${trimmed.toLowerCase()}`;
  const cached = nameCache.get(cacheKey);
  if (cached) return cached;

  try {
    const text = await callClaude({
      model: "claude-haiku-4-5",
      system: SYSTEM_PROMPT,
      user: trimmed,
      maxTokens: 256,
      temperature: 0.1, // tight — we want consistency, not creativity
    });
    // Strip leading / trailing quotes and whitespace; Claude
    // sometimes wraps single-word answers in quotes despite the
    // explicit "no quotes" rule.
    const normalized = text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

    if (!normalized) return trimmed;

    // Sanity check — if the response looks too long (>120 chars,
    // probably an explanation despite the prompt) or contains
    // newlines, treat as garbage and skip.
    if (normalized.length > 120 || /[\n\r]/.test(normalized)) return trimmed;

    // LRU-ish trim — drop oldest entries when we hit the cap so a
    // long-running worker doesn't grow unbounded.
    if (nameCache.size >= CACHE_LIMIT) {
      const firstKey = nameCache.keys().next().value;
      if (firstKey) nameCache.delete(firstKey);
    }
    nameCache.set(cacheKey, normalized);
    return normalized;
  } catch {
    // Network / rate-limit error — return the original. Caller's
    // cache lookup will probably MISS, then fall through to
    // generation, which is the same behaviour as before this fix.
    return trimmed;
  }
}
