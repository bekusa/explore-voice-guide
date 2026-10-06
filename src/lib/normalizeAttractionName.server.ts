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

// Rules-only canonicalisation prompt — no few-shot examples by Beka's
// call. Earlier versions used 8 worked examples but one of them
// ("პაკ ხლონგ ტალატი" → "Khlong Lat Mayom Floating Market") was
// itself wrong (two different Bangkok markets), which actively
// taught Haiku the substitution behaviour we were trying to ban.
// Rather than maintain a vetted example set, we ship the rules
// straight. The numbered list + strict OUTPUT FORMAT block carries
// most of the work the examples used to do.
const SYSTEM_PROMPT =
  "You normalize a single place name into its canonical English form.\n\n" +
  "The input may be a landmark, attraction, neighborhood, park, museum, religious site, natural site, city, region, or country. " +
  "It may be written in Georgian, Cyrillic, Arabic, Persian, Chinese, Japanese, Korean, Thai, Devanagari, English, or phonetic transliteration.\n\n" +
  "OUTPUT FORMAT (strict):\n" +
  "- Respond with ONLY the normalized English place name on a single line.\n" +
  '- No quotes. No markdown. No explanation. No alternative names. No parenthetical notes. No trailing punctuation. No prefatory phrases like "Here is..." or "The answer is...".\n' +
  '- If you cannot resolve the input, still return a single-line phonetic English transliteration of the EXACT input — never apologise, never say "I cannot find...", never return an empty answer.\n\n' +
  "NORMALIZATION RULES:\n" +
  "1. Canonical source: use the exact Wikipedia article title spelling, including any diacritics Wikipedia includes. When Wikipedia and Google Maps disagree, prefer Wikipedia.\n" +
  "2. If the input is already a correct English place name, return it unchanged.\n" +
  "3. If the input is in a non-Latin script, transliterate to the standard English Wikipedia spelling of that EXACT place.\n" +
  "4. Preserve the exact intended place. Do not replace it with a more famous, nearby, or similar-sounding attraction. Accuracy beats popularity — a lesser-known exact match is always better than a famous but wrong substitution. This is the most important rule.\n" +
  "5. If multiple real places could match the input, choose the closest direct transliteration of the EXACT input rather than guessing which famous place the user meant.\n" +
  // Beka 2026-10-06 — this rule used to end with "The downstream cache
  // will simply miss and re-fetch — that is safe." That sentence was
  // wrong and it cost real money: a miss is a FULL guide generation,
  // and telling the model a miss was free is what let "ფოთი" become
  // "Photi" instead of "Poti". Substituting a different landmark is
  // still the worse error, so the ordering stands — but invented
  // spellings are now discouraged rather than licensed, and the
  // standard English exonym is named as the thing to reach for.
  "6. If you have ANY doubt about which real place is meant, return the standard English exonym if one exists (Rome, Moscow, Vienna, Poti), otherwise the most widely used English spelling of that EXACT place. Prefer the spelling an English atlas or guidebook would print over a letter-by-letter phonetic rendering. Never substitute a different landmark — that is the one unrecoverable error.\n" +
  '7. Do NOT add generic words ("Museum", "Park", "Church", "Square", "City") unless they are part of the official Wikipedia title.\n' +
  "8. Do NOT remove meaningful place-type words when they ARE part of the name.\n" +
  '9. If the input includes a city qualifier after a landmark name ("Hagia Sophia Istanbul", "Eiffel Tower, Paris", "Louvre in Paris"), return ONLY the landmark name.';

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

  /* AUTHORITATIVE PASS — Wikipedia interlanguage links, before Haiku.
   *
   * Beka 2026-10-06: he searched "ფოთი" in Georgian and the app
   * generated a whole new guide even though "Poti" was already
   * cached. I found the cause in his own data:
   *
   *   cached_attractions: "poti"  | en   ← July, 10 attractions
   *   cached_attractions: "photi" | en   ← 2026-10-06 17:51, new
   *   cached_attractions: "photi" | ka   ← 2026-10-06 17:51, new
   *
   * Haiku transliterated ფოთი as "Photi" (ფ IS an aspirated p, so
   * it is a defensible phonetic answer) and that missed "poti" by
   * one letter. The same split is visible as "david gareja" vs
   * "davit gareja" and "narikala fortress" vs "nariqala fortress" —
   * one monastery and one fortress, each paid for twice.
   *
   * Rule 6 of the prompt below actively CAUSED this: it told the
   * model that inventing a transliteration was safe because "the
   * downstream cache will simply miss and re-fetch". That is not
   * safe — a miss is a whole Claude generation.
   *
   * So we stop asking a model to guess a spelling that an
   * encyclopedia already knows. Wikipedia's langlinks map a
   * native-script article title to its exact English counterpart,
   * deterministically, for free, with no model in the loop.
   *
   * EXACT TITLES ONLY — verified against the live API 2026-10-06:
   *   ფოთი          → "Poti"                           ✅
   *   ნარიყალა      → (redirect) → "Narikala"           ✅
   *   დავითგარეჯა   → "David Gareji monastery complex"  ✅
   *   ფოთის შუქურა  → missing: true → fall through       ✅
   *
   * We deliberately do NOT use Wikipedia's full-text search here.
   * I tested generator=search with "დავით გარეჯა" and it returned
   * "Gia Gugushvili" — a footballer. That is the identical trap that
   * produced the wrong Poti photos on 2026-10-04: full-text search
   * returns articles that merely MENTION the words. Keying a cache
   * on that would serve a guide about the wrong subject entirely.
   * A clean miss is cheap; a confident wrong answer is not. */
  const fromWiki = await resolveViaWikipedia(trimmed, sourceLang);
  if (fromWiki) {
    rememberName(cacheKey, fromWiki);
    return fromWiki;
  }

  try {
    const text = await callClaude({
      model: "claude-haiku-4-5",
      system: SYSTEM_PROMPT,
      user: trimmed,
      // A place name is at most ~10 words. 64 tokens is roomy headroom
      // and a hard ceiling against runaway output if Claude ignores the
      // "no explanation" rule and starts writing prose.
      maxTokens: 64,
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

    rememberName(cacheKey, normalized);
    return normalized;
  } catch {
    // Network / rate-limit error — return the original. Caller's
    // cache lookup will probably MISS, then fall through to
    // generation, which is the same behaviour as before this fix.
    return trimmed;
  }
}

/**
 * LRU-ish store — drop the oldest entry when we hit the cap so a
 * long-running worker doesn't grow unbounded.
 */
function rememberName(cacheKey: string, value: string): void {
  if (nameCache.size >= CACHE_LIMIT) {
    const firstKey = nameCache.keys().next().value;
    if (firstKey) nameCache.delete(firstKey);
  }
  nameCache.set(cacheKey, value);
}

/** Wikipedia asks for a descriptive UA; anonymous clients get 403s. */
const WIKI_UA = "Lokali/1.0 (https://lokali.travel; lokaliapps@gmail.com)";

/**
 * Ask the user's own Wikipedia for the English title of an article
 * whose EXACT title is `name`. Returns null whenever we are not
 * certain — a missing article, an odd shape, a timeout, anything.
 * Null simply means "let Haiku try", so this can only ever help.
 */
async function resolveViaWikipedia(
  name: string,
  sourceLang: string,
): Promise<string | null> {
  // "pt-br" → "pt", "zh-cn" → "zh". Wikipedia subdomains are bare
  // language codes; a regional suffix 404s the whole host.
  const wiki = sourceLang.toLowerCase().split(/[-_]/)[0];
  if (!wiki || !/^[a-z]{2,3}$/.test(wiki)) return null;

  // Hard timeout. This sits on the cold-cache path of a Cloudflare
  // Worker with a ~100 s budget that a Claude call already eats into,
  // so a hanging encyclopedia must never be what times the request
  // out. 4 s is far above Wikipedia's normal sub-300 ms reply.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const url =
      `https://${wiki}.wikipedia.org/w/api.php` +
      `?action=query&format=json&formatversion=2` +
      // redirects=1 follows editor-curated redirects, which is how
      // ნარიყალა reaches თბილისის ციხე and then "Narikala". Those are
      // human-maintained synonyms, not fuzzy guesses.
      `&redirects=1&prop=langlinks&lllang=en` +
      `&titles=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: {
        pages?: {
          missing?: boolean;
          langlinks?: { lang?: string; title?: string }[];
        }[];
      };
    };
    const page = json.query?.pages?.[0];
    // `missing: true` is the common case for a landmark that has no
    // article of its own ("ფოთის შუქურა"). Not an error — just a
    // signal to hand over to the model.
    if (!page || page.missing) return null;
    const title = page.langlinks?.find((l) => l.lang === "en")?.title?.trim();
    if (!title) return null;

    // Drop a trailing disambiguator — "Poti (city)" → "Poti". That
    // suffix is a Wikipedia bookkeeping device, never part of the
    // name, and leaving it in would fragment the cache all over again.
    const clean = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!clean || clean.length > 120) return null;
    return clean;
  } catch {
    // Abort, DNS, malformed JSON — all mean the same thing here.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
