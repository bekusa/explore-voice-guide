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

const foldItemName = (s: unknown) => foldDiacritics(String(s ?? "")).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The city's current EN list (first query that has one), for page 2-3 jobs. */
export async function existingCityList(queries: string[]): Promise<{ query: string; list: AttractionItem[] } | null> {
  const qs = [...new Set(queries.map(normalizeName))];
  if (qs.length === 0) return null;
  const rows = await db.select<{ query_normalized: string; payload: { attractions?: AttractionItem[] } | null }>(
    "cached_attractions",
    `select=query_normalized,payload&query_normalized=${inList(qs)}&language=eq.en&filters_key=eq.${encodeURIComponent(filtersKey({}))}`,
  );
  for (const q of qs) {
    const list = rows.find((r) => r.query_normalized === q)?.payload?.attractions;
    if (Array.isArray(list) && list.length > 0) return { query: q, list };
  }
  return null;
}

/** New items whose names are not already on the list (the app's mergeAttractions does the same). */
export function newItemsOnly(base: AttractionItem[], extra: AttractionItem[]): AttractionItem[] {
  const seen = new Set(base.map((a) => foldItemName(a.name)));
  return extra.filter((a) => {
    const k = foldItemName(a.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Pages 2-3 on a city that already has a list: the existing items stay exactly as they are
 * (first, in order) and the new ones are appended — the same merge the app's extension call
 * writes (mergeAttractions(cached, new).slice(0, 30) → putCachedAttractions). An alias row
 * holding a different list is left alone, in line with the rule above.
 */
export async function publishExtendedAttractions(queries: string[], base: { query: string; list: AttractionItem[] }, merged: AttractionItem[]) {
  const qs = [...new Set(queries.map(normalizeName))];
  if (DRY_RUN) return { written: qs, extended: true, dryRun: true };
  const rows = await db.select<{ query_normalized: string; payload: { attractions?: AttractionItem[] } | null }>(
    "cached_attractions",
    `select=query_normalized,payload&query_normalized=${inList(qs)}&language=eq.en&filters_key=eq.${encodeURIComponent(filtersKey({}))}`,
  );
  const sig = (l: AttractionItem[] | undefined) => (l ?? []).map((a) => foldItemName(a.name)).join("|");
  const baseSig = sig(base.list);
  const written: string[] = [];
  const skipped: string[] = [];
  for (const q of qs) {
    const own = rows.find((r) => r.query_normalized === q)?.payload?.attractions;
    if (!own || own.length === 0 || q === base.query || sig(own) === baseSig) written.push(q);
    else skipped.push(q);
  }
  const now = new Date().toISOString();
  await db.upsert(
    "cached_attractions",
    written.map((q) => ({ query_normalized: q, language: normalizeLang("en"), filters_key: filtersKey({}), payload: { attractions: merged }, updated_at: now })),
    "query_normalized,language,filters_key",
  );
  return { written, extended: true, base_items: base.list.length, total_items: merged.length, skipped_alias_with_other_list: skipped };
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
