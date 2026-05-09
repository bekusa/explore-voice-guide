import { createFileRoute } from "@tanstack/react-router";
import { getCachedAttractions, putCachedAttractions } from "@/lib/sharedCache.server";
import { translateAttractionsPayload } from "@/lib/translatePayload.server";
import { callClaude, parseClaudeJson } from "@/lib/anthropic.server";
import { buildAttractionsSystem, buildAttractionsUser } from "@/lib/prompts";

/**
 * /api/attractions — Cloudflare Worker route that calls Anthropic
 * Claude directly (no more n8n hop).
 *
 * Smart cache strategy (saves ~80% Claude cost across languages):
 *   1. Try direct cache hit on (query, userLang).
 *   2. Miss + userLang != en → try (query, "en"); if found,
 *      translate it to userLang via Lovable AI Gateway (Gemini Flash,
 *      ~10× cheaper than Claude) and cache the translated row too.
 *   3. Miss everywhere → forward to n8n forcing language="en" so we
 *      always cache an English baseline, then translate to userLang
 *      if needed.
 *
 * Result: each city now costs ONE Claude call regardless of how
 * many languages we serve it in. The translation step is opportunistic
 * — if it fails or returns the source array, the user sees English
 * which is still a working result.
 *
 * Extension mode (background prefetch for /results pagination): when
 * the request body carries `exclude: string[]` + `count: number`, we
 * SKIP the cache lookup and ask n8n for `count` more attractions that
 * are NOT in the exclude list. The new items get merged into both the
 * English baseline and the user-language cache rows so the next
 * visitor reads the full ≤30-item set in one cache hit. The response
 * only carries the freshly-fetched items — the client already has the
 * first page in state, so we don't waste bytes echoing them back.
 *
 * Single response header for monitoring:
 *   `X-Cache: HIT | TRANSLATED | MISS | EXTEND | EXTEND-TRANSLATED |
 *             EXTEND-EMPTY | EXTEND-NO-TRANS`.
 */
export const Route = createFileRoute("/api/attractions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const key = extractAttractionsKey(rawBody);
        const userLang = key?.language ?? "en";
        const wantsTranslation = key !== null && !isEnglish(userLang);

        // Extension request — frontend background-prefetching pages 2-3.
        // Always hits n8n (bypasses cache by design); merges results
        // into the cached rows so subsequent visitors see all 30 in one
        // shot. Falls through to the normal flow if exclude is missing.
        const extras = extractExtensionExtras(rawBody);
        if (key && extras.exclude.length > 0 && extras.count > 0) {
          return handleExtensionRequest(key, userLang, wantsTranslation, rawBody, extras);
        }

        // 1. Direct cache hit (e.g. user wants ka, ka cached)
        // Skip dud rows — if a previous bad upstream response left
        // an empty {attractions:[]} stuck in the cache, treat it as
        // a miss so the next request actually hits n8n again.
        if (key) {
          const cached = await getCachedAttractions(key);
          if (cached !== null && hasAttractions(cached)) {
            return jsonResponse(cached, 200, "HIT");
          }
        }

        // 2. Miss; if non-English, try the English baseline + translate
        if (key && wantsTranslation) {
          const enKey = { ...key, language: "en" };
          const cachedEn = await getCachedAttractions(enKey);
          if (cachedEn !== null && hasAttractions(cachedEn)) {
            const { payload: translated, translated: ok } = await translateAttractionsPayload(
              cachedEn,
              userLang,
            );
            if (ok) await putCachedAttractions(key, translated);
            return jsonResponse(translated, 200, ok ? "TRANSLATED" : "TRANSLATE-FAILED");
          }
        }

        // 3. Cache miss — call Claude directly. Always request the
        // English baseline so the cached row is reusable across every
        // locale we ever serve (translateAttractionsPayload handles
        // the rest via Lovable AI Gateway → Gemini Flash).
        if (!key) {
          return jsonResponse({ attractions: [] }, 200, "MISS", "no-query");
        }
        try {
          const system = buildAttractionsSystem();
          const user = buildAttractionsUser({
            query: key.query,
            language: "en",
            count: 10,
            interests: key.filters.interests,
            duration: key.filters.duration,
          });
          // Haiku, not Sonnet — Beka observed first-page loads taking
          // ~45 s with Sonnet's slower throughput (50 tok/s × 4096 max
          // tokens). Haiku at ~150 tok/s cuts the same 10-item list
          // to ~10-15 s and the structured-list quality is identical
          // to the eye. Sonnet stays on the guide route where the
          // long narrative actually benefits from the bigger model.
          const text = await callClaude({
            model: "claude-haiku-4-5",
            system,
            user,
            maxTokens: 3072,
          });
          const parsed = parseClaudeJson(text);

          // Persist the English baseline only when at least one
          // attraction is present — caching an empty list would pin
          // a dud row that short-circuits future requests forever.
          if (parsed !== undefined && hasAttractions(parsed)) {
            const enKey = { ...key, language: "en" };
            await putCachedAttractions(enKey, parsed);
          }

          // Empty / unparseable Claude output → friendly empty list (NOT cached).
          if (parsed === undefined || !hasAttractions(parsed)) {
            return jsonResponse({ attractions: [] }, 200, "MISS", "upstream-empty");
          }

          // Translate now if the user wanted a non-English response.
          if (wantsTranslation) {
            const { payload: translated, translated: ok } = await translateAttractionsPayload(
              parsed,
              userLang,
            );
            if (ok) await putCachedAttractions(key, translated);
            return jsonResponse(translated, 200, ok ? "MISS-TRANSLATED" : "MISS-NO-TRANS");
          }

          return jsonResponse(parsed, 200, "MISS");
        } catch (err) {
          // Anthropic call failed (key missing, rate limit, network,
          // …) — return an empty list with an `error` field so the
          // client renders a graceful "nothing found" instead of a
          // broken page.
          return new Response(
            JSON.stringify({
              attractions: [],
              error: err instanceof Error ? err.message : "Upstream failed",
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

/**
 * Build a stable cache key from the request body. Returns null if
 * we can't extract a non-empty query — uncacheable.
 */
function extractAttractionsKey(rawBody: string): {
  query: string;
  language: string;
  filters: { interests?: string[]; duration?: string };
} | null {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    const query =
      (typeof obj.query === "string" && obj.query) ||
      (typeof obj.city === "string" && obj.city) ||
      (typeof obj.country === "string" && obj.country) ||
      "";
    const language =
      (typeof obj.language === "string" && obj.language) ||
      (typeof obj.lang === "string" && obj.lang) ||
      "";
    const interests = Array.isArray(obj.interests)
      ? obj.interests.filter((s): s is string => typeof s === "string")
      : [];
    const duration = typeof obj.duration === "string" ? obj.duration : "";
    if (!query.trim() || !language.trim()) return null;
    return {
      query: query.trim(),
      language: language.trim(),
      filters: { interests, duration },
    };
  } catch {
    return null;
  }
}

function isEnglish(lang: string): boolean {
  return !lang || lang.toLowerCase().startsWith("en");
}

/**
 * True when the parsed Claude response looks like a real attractions
 * payload with at least one entry. Tolerates the wrapped shape
 * `{attractions:[...]}` and the bare-array shape `[...]`. Used to
 * gate cache writes so we never persist a dud empty result.
 */
function hasAttractions(payload: unknown): boolean {
  if (!payload) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (typeof payload !== "object") return false;
  const arr = (payload as { attractions?: unknown }).attractions;
  return Array.isArray(arr) && arr.length > 0;
}

function jsonResponse(
  payload: unknown,
  status: number,
  cacheTag: string,
  reason?: string,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cache": cacheTag,
  };
  if (reason) headers["X-Cache-Reason"] = reason;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(body, { status, headers });
}

/* ───────── Extension (background prefetch) helpers ───────── */

type ExtensionExtras = { exclude: string[]; count: number };

/**
 * Pull the `exclude` (already-shown attraction names) and `count`
 * (how many more to fetch) fields out of the request body. Both
 * default to empty/zero when absent — that's the signal for "this is
 * a normal first-page fetch, not an extension".
 */
function extractExtensionExtras(rawBody: string): ExtensionExtras {
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    const exclude = Array.isArray(obj.exclude)
      ? obj.exclude.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    const rawCount = obj.count;
    const count =
      typeof rawCount === "number" && Number.isFinite(rawCount) && rawCount > 0
        ? Math.min(30, Math.floor(rawCount))
        : 0;
    return { exclude, count };
  } catch {
    return { exclude: [], count: 0 };
  }
}

/**
 * Pull the attractions array out of a Claude response payload. Tolerates both
 * the wrapped `{attractions: [...]}` shape and the bare-array `[...]`
 * shape, returning [] when neither matches.
 */
function extractAttractionsArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  }
  if (!payload || typeof payload !== "object") return [];
  const arr = (payload as { attractions?: unknown }).attractions;
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
}

/**
 * Merge two attractions arrays, deduping by case-insensitive name.
 * Existing entries win on conflict (we trust the cached order over
 * a fresh re-fetch). Used to glue the prefetched 20 onto the cached
 * first-page 10 without dupes if Claude ignored the exclude hint.
 */
function mergeAttractions(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const row of [...existing, ...incoming]) {
    const name = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(row);
  }
  return out;
}

/**
 * Handle an extension request — call n8n for `count` more attractions
 * excluding the already-shown ones, merge the new English-baseline
 * results into the (q, en) cache row, and (if the user wants
 * non-English) translate them into the user-language cache row too.
 *
 * Always returns ONLY the new attractions to the client; the client
 * already holds the first page in state and merges locally.
 */
async function handleExtensionRequest(
  key: { query: string; language: string; filters: { interests?: string[]; duration?: string } },
  userLang: string,
  wantsTranslation: boolean,
  _rawBody: string,
  extras: ExtensionExtras,
): Promise<Response> {
  let parsed: unknown;
  try {
    const system = buildAttractionsSystem();
    const user = buildAttractionsUser({
      query: key.query,
      language: "en",
      count: extras.count,
      exclude: extras.exclude,
      interests: key.filters.interests,
      duration: key.filters.duration,
    });
    // Haiku here too — same reasoning as the first-page call. Bigger
    // maxTokens because extension calls can ask for up to 30 more
    // attractions — each row averages ~120-180 tokens.
    const text = await callClaude({
      model: "claude-haiku-4-5",
      system,
      user,
      maxTokens: 6144,
    });
    parsed = parseClaudeJson(text);
  } catch (err) {
    return new Response(
      JSON.stringify({
        attractions: [],
        error: err instanceof Error ? err.message : "Upstream failed",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Filter out anything Claude returned that's already in the exclude
  // list — Claude sometimes ignores the "don't include these" rule.
  const excludeSet = new Set(extras.exclude.map((s) => s.trim().toLowerCase()));
  const newEnRaw = extractAttractionsArray(parsed);
  const newEn = newEnRaw.filter((row) => {
    const name = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
    return name.length > 0 && !excludeSet.has(name);
  });

  if (newEn.length === 0) {
    return jsonResponse({ attractions: [] }, 200, "EXTEND-EMPTY", "no-new-items");
  }

  // Merge into the (q, en) cache row. Read first so we extend the
  // existing 10 → 30 instead of stamping a fresh 20-item row over it.
  const enKey = { ...key, language: "en" };
  const cachedEnPayload = await getCachedAttractions(enKey);
  const cachedEnArr = extractAttractionsArray(cachedEnPayload);
  const mergedEn = mergeAttractions(cachedEnArr, newEn).slice(0, 30);
  await putCachedAttractions(enKey, { attractions: mergedEn });

  // English-speaking user → return new English items, done.
  if (!wantsTranslation) {
    return jsonResponse({ attractions: newEn }, 200, "EXTEND");
  }

  // Non-English user → translate the NEW items only (cheaper than
  // re-translating the whole 30) and merge into the (q, userLang)
  // cache row. Returns the translated new items to the client.
  const { payload: translatedPayload, translated: ok } = await translateAttractionsPayload(
    { attractions: newEn },
    userLang,
  );
  const newTranslated = extractAttractionsArray(translatedPayload);
  if (ok && newTranslated.length > 0) {
    const cachedUserLangPayload = await getCachedAttractions(key);
    const cachedUserLangArr = extractAttractionsArray(cachedUserLangPayload);
    const mergedUserLang = mergeAttractions(cachedUserLangArr, newTranslated).slice(0, 30);
    await putCachedAttractions(key, { attractions: mergedUserLang });
    return jsonResponse({ attractions: newTranslated }, 200, "EXTEND-TRANSLATED");
  }

  // Translation failed — return the English new items so the client
  // still gets pagination, just in English. NOT cached under userLang
  // (so we don't pin English rows under a Georgian key forever).
  return jsonResponse({ attractions: newEn }, 200, "EXTEND-NO-TRANS");
}
