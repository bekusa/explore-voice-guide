/**
 * Publishing = writing the app's own cache rows, in the app's own shape.
 *
 * Row shapes mirror src/lib/sharedCache.server.ts exactly:
 *   putCachedGuide          → cached_guides (name_normalized, city_normalized, language, interest, payload, updated_at)
 *   putCachedAttractions    → cached_attractions (query_normalized, language, filters_key, payload, updated_at)
 *   putCachedClassification → cached_classifications (query_normalized, kind, name, city, country, slug, updated_at)
 * and use the same normalizers (src/lib/cacheKey.ts), so the live routes
 * find these rows on their first lookup.
 *
 * Rule: the factory NEVER overwrites a row that already exists — a row a
 * user's request produced (or an earlier curated one) wins. Classification
 * rows are insert-if-absent for the same reason.
 */
import { foldDiacritics, normalizeLang, normalizeName } from "@/lib/cacheKey";
import { filtersKey } from "@/lib/sharedCache.server";
import { db, DRY_RUN, inList } from "./db";
import type { AttractionItem, GuidePayload } from "./generate";

export type GuideTarget = {
  /** name sent to the prompt (English Wikipedia title unless it carries a parenthetical) */
  name: string;
  /** every spelling a user / the attractions list may produce for this place */
  keyNames: string[];
  city: string;
  cityAliases: string[];
  country?: string;
  /** keys allowed in the '' (city-less) bucket — only names unique across the whole target list */
  bucketlessNames: string[];
};

export function slugify(name: string): string {
  return foldDiacritics(name.trim().toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type GuideKeyRow = { name_normalized: string; city_normalized: string };

/** All (name, city) keys this guide should be reachable under. */
export function guideKeys(t: GuideTarget): GuideKeyRow[] {
  const out = new Map<string, GuideKeyRow>();
  const add = (name: string, city: string) => {
    const k = { name_normalized: normalizeName(name), city_normalized: normalizeName(city) };
    if (!k.name_normalized) return;
    out.set(`${k.name_normalized}|${k.city_normalized}`, k);
  };
  for (const n of t.keyNames) {
    for (const c of [t.city, ...t.cityAliases]) if (c.trim()) add(n, c);
  }
  for (const n of t.bucketlessNames) add(n, "");
  return [...out.values()];
}

/** Which of these keys already have an English baseline for this interest? */
export async function existingGuideKeys(keys: GuideKeyRow[], interest: string): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const names = [...new Set(keys.map((k) => k.name_normalized))];
  const rows = await db.select<GuideKeyRow & { payload: { script?: string } }>(
    "cached_guides",
    `select=name_normalized,city_normalized,payload->script&language=eq.en&interest=eq.${interest}&name_normalized=${inList(names)}`,
  );
  return new Set(
    rows.filter((r) => typeof (r as any).script === "string" && (r as any).script.trim()).map((r) => `${r.name_normalized}|${r.city_normalized}`),
  );
}

export async function publishGuide(t: GuideTarget, payload: GuidePayload, interest: string) {
  const keys = guideKeys(t);
  if (DRY_RUN) return { written: keys, skippedExisting: 0, dryRun: true };
  const existing = await existingGuideKeys(keys, interest);
  const fresh = keys.filter((k) => !existing.has(`${k.name_normalized}|${k.city_normalized}`));
  const now = new Date().toISOString();
  await db.insertIgnore(
    "cached_guides",
    fresh.map((k) => ({ ...k, language: normalizeLang("en"), interest, payload, updated_at: now })),
    "name_normalized,city_normalized,language,interest",
  );
  // Direct search ("Leaning Tower of Pisa" typed into the search bar) →
  // straight to the attraction page with OUR name + city, so the guide
  // lookup hits the row above on the first try.
  const classRows = t.keyNames.map((q) => ({
    query_normalized: normalizeName(q),
    kind: "attraction",
    name: t.name,
    city: t.city || null,
    country: t.country || null,
    slug: slugify(t.name),
    updated_at: now,
  }));
  await db.insertIgnore("cached_classifications", dedupe(classRows, (r) => r.query_normalized), "query_normalized");
  return { written: fresh, skippedExisting: keys.length - fresh.length };
}

export async function cityHasList(query: string): Promise<boolean> {
  const rows = await db.select<{ payload: unknown }>(
    "cached_attractions",
    `select=id&query_normalized=eq.${encodeURIComponent(normalizeName(query))}&language=eq.en&filters_key=eq.${encodeURIComponent(filtersKey({}))}`,
  );
  return rows.length > 0;
}

export async function publishAttractions(queries: string[], list: AttractionItem[]) {
  if (DRY_RUN) return { written: [...new Set(queries.map(normalizeName))], dryRun: true };
  const now = new Date().toISOString();
  const written: string[] = [];
  for (const q of [...new Set(queries.map(normalizeName))]) {
    if (await cityHasList(q)) continue;
    written.push(q);
  }
  await db.insertIgnore(
    "cached_attractions",
    written.map((q) => ({ query_normalized: q, language: normalizeLang("en"), filters_key: filtersKey({}), payload: { attractions: list }, updated_at: now })),
    "query_normalized,language,filters_key",
  );
  return { written };
}

function dedupe<T>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) if (!m.has(key(r))) m.set(key(r), r);
  return [...m.values()];
}

export { inList };
