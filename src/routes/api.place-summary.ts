import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { getCachedAttractions } from "@/lib/sharedCache.server";
import { translateAttractionsPayload } from "@/lib/translatePayload.server";
import { normalizeLang, normalizeName } from "@/lib/cacheKey";

/**
 * GET /api/place-summary?name=…&lang=…&city=…
 * → { about?: string, story?: string, source?: string }
 *
 * The "About this place" and "The story" text for ONE attraction, taken
 * from lists that are already in the cache. Beka 2026-11-28: "კიდე
 * მარტო the tour დააგენერირა" — Talad Noi, Capitoline Museums and
 * others opened with only the tour.
 *
 * ── Why ───────────────────────────────────────────────────────────
 * The attraction page got those two texts by asking /api/attractions to
 * build a whole attractions list for the place's own name, then picking
 * the place out of it. For a name nobody had searched that meant a fresh
 * Sonnet list (≈35 s, a few cents) — and the place is not always in the
 * list it generates, so even then the sections could stay empty. Yet
 * the same place is usually already sitting, fully written and often
 * already translated, in its CITY's list (Talad Noi is in "bangkok" in
 * Georgian). This route looks there first.
 *
 * ── What it may do ────────────────────────────────────────────────
 * Two exact-key cache reads per language (the place's own query and its
 * city), at most one small translation of two strings when only the
 * English list has it. It never calls Claude, never generates a list and
 * never writes to the cache. Nothing found → {} and the page falls back
 * to the old /api/attractions path.
 */

type Item = Record<string, unknown>;

function listOf(payload: unknown): Item[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const arr = Array.isArray(p.attractions)
    ? p.attractions
    : Array.isArray(p.items)
      ? p.items
      : Array.isArray(p.data)
        ? p.data
        : [];
  return arr.filter((x): x is Item => !!x && typeof x === "object");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pick(item: Item): { about: string; story: string } {
  return {
    about: str(item.outside_desc) || str(item.description) || str(item.desc),
    story: str(item.insider_desc),
  };
}

async function findIn(queries: string[], language: string, wanted: string): Promise<Item | null> {
  for (const query of queries) {
    const payload = await getCachedAttractions({ query, language, filters: {} });
    const hit = listOf(payload).find(
      (it) => normalizeName(str(it.name_en)) === wanted || normalizeName(str(it.name)) === wanted,
    );
    if (hit) return hit;
  }
  return null;
}

export const Route = createFileRoute("/api/place-summary")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const name = (url.searchParams.get("name") ?? "").trim().slice(0, 160);
        const city = (url.searchParams.get("city") ?? "").trim().slice(0, 120);
        const lang = normalizeLang(url.searchParams.get("lang") ?? "en");
        if (!name) return corsJson({});

        const wanted = normalizeName(name);
        const queries = [...new Set([name, city].filter(Boolean))];
        const headers = { "Cache-Control": "public, max-age=300" };

        // 1. Already in the reader's language.
        const own = await findIn(queries, lang, wanted);
        if (own) {
          const s = pick(own);
          if (s.about || s.story) return corsJson({ ...s, source: "cache" }, { headers });
        }
        if (lang === "en") return corsJson({}, { headers });

        // 2. Only the English list has it — translate just these two texts.
        const en = await findIn(queries, "en", wanted);
        if (!en) return corsJson({}, { headers });
        const s = pick(en);
        if (!s.about && !s.story) return corsJson({}, { headers });
        const { payload, translated } = await translateAttractionsPayload(
          { attractions: [{ outside_desc: s.about, insider_desc: s.story }] },
          lang,
        );
        // Untranslated English is worse than an empty section here: the
        // rest of the page is in the reader's language.
        if (!translated) return corsJson({});
        const t = listOf(payload)[0] ?? {};
        return corsJson(
          { about: str(t.outside_desc), story: str(t.insider_desc), source: "translated" },
          { headers },
        );
      },
    },
  },
});
