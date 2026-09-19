/**
 * Cache-key normalisation — shared by SERVER and CLIENT.
 *
 * Beka 2026-09-19: these three functions used to live only in
 * `sharedCache.server.ts`, which cannot be imported from the browser
 * bundle (it pulls in the Supabase service-role key and process.env).
 * Guide ratings need the SAME key shape on the client so a rating row
 * can be traced back to the exact cached guide that produced it.
 *
 * Copying them would have been the obvious move and the wrong one:
 * two copies of a normaliser drift, and the day they drift the join
 * silently stops matching with no error anywhere. There is exactly
 * one definition, here; `sharedCache.server.ts` re-exports it.
 *
 * ⚠️ Changing anything in this file re-keys the caches. A name that
 * normalises differently is a different row: existing cached_guides /
 * cached_attractions / cached_photos entries become unreachable and
 * get regenerated at full Claude + Google cost. Treat edits here as a
 * migration, not a tweak.
 *
 * Deliberately dependency-free — no imports at all — so it is safe in
 * a Cloudflare Worker and in the browser bundle alike.
 */

/**
 * Characters that do NOT decompose under Unicode NFD, so the
 * combining-mark strip below can't reach them. Turkish dotless ı is
 * the one that actually bit us (BUG 1b): Haiku returns "Kaputaş"
 * sometimes and "Kaputas" other times, producing two cache rows for
 * one beach. Folding both to "kaputas" made the alias rows the
 * warming script had to insert unnecessary.
 */
const CHAR_FOLD: Record<string, string> = {
  ı: "i",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};

/**
 * Strip diacritics so "Kaputaş" and "Kaputas", "Göreme" and "Goreme",
 * "Şanlıurfa" and "Sanliurfa" collapse to one cache key. Expects an
 * already-lowercased string (Turkish İ lowercases to i + combining
 * dot, which the NFD strip then removes correctly).
 */
export function foldDiacritics(s: string): string {
  let out = s;
  for (const [from, to] of Object.entries(CHAR_FOLD)) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  // NFD splits "ş" into "s" + U+0327; the range strip drops the mark.
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Canonicalize a free-form place name so trivial whitespace / case
 * drift collapses to one cache row. Same shape the frontend
 * `attractionSlug()` uses (modulo the dash separator), so the two can
 * be cross-referenced.
 */
export function normalizeName(name: string): string {
  return foldDiacritics(name.trim().toLowerCase()).replace(/\s+/g, " ");
}

/**
 * Canonical cache language code (BUG 7).
 *
 * The DB had `pl` AND `pl-PL`, `zh` AND `zh-cn` AND `zh-tw` — the
 * same language split across keys, so each variant paid its own
 * Gemini translation and missed the other's cache.
 *
 * Canonical form = the lowercase BASE code, keeping a region suffix
 * ONLY for the four locales the app genuinely serves differently
 * (matching the src/lib/ui-locales/*.ts filenames: pt-br, pt-pt,
 * zh-cn, zh-tw). So "pl-PL" → "pl", "en-US" → "en", "ka-GE" → "ka",
 * "zh-CN" → "zh-cn". Bare "zh"/"pt" get the majority variant so they
 * stop forming their own orphan bucket.
 *
 * ⚠️ NOT the same function as `normalizeLang` in i18n.ts. That one
 * only strips the region for the UI dictionary and does not handle
 * zh-hans/zh-hant or the bare-code defaults. Do not swap them: the UI
 * one would produce different cache keys and silently fragment the
 * store again.
 */
const SPLIT_LOCALES = new Set(["pt-br", "pt-pt", "zh-cn", "zh-tw"]);
const BARE_SPLIT_DEFAULT: Record<string, string> = {
  zh: "zh-cn",
  pt: "pt-br",
};

export function normalizeLang(lang: string): string {
  const raw = (lang ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return "en";
  // Script subtags Chinese sometimes arrives with.
  const scripted = raw
    .replace(/^zh-hans(-.*)?$/, "zh-cn")
    .replace(/^zh-hant(-.*)?$/, "zh-tw");
  if (SPLIT_LOCALES.has(scripted)) return scripted;
  const base = scripted.split("-")[0];
  if (base in BARE_SPLIT_DEFAULT) {
    // "zh" alone, or an unexpected zh-XX / pt-XX region.
    return BARE_SPLIT_DEFAULT[base];
  }
  return base;
}
