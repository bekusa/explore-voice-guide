/**
 * unit.ts — assemble ONE place from every table it lives in.
 *
 * A unit is one real place (QID). Its content is spread across:
 *   cached_guides        several rows with the identical EN payload (city bucket, '' bucket, aliases)
 *                        + translations + other-interest rows under the same keys
 *   cached_attractions   the enrichment row (query = the place's own name) and list items in city lists
 *   attraction_coords    one row keyed by the normalised name
 *   cached_photos        '|<city>||<name>', '|||<name>', 'gallery|<city>||<name>' for every alias/city
 *   cached_place_details rows for the name (+ city)
 *   cached_classifications  search variants → this place
 *
 * The unit is grouped by md5(payload::text) of the EN editors row, exactly as the 2026-10-29 audit
 * did, and tied to a Wikidata QID: content_jobs.target_qid first, then the English Wikipedia
 * summary's wikibase_item. No QID → the unit goes to REVIEW.
 */
import { normalizeName } from "@/lib/cacheKey";
import { db, inList, payloadMd5, selectAll } from "./db";
import { wdEntity, wdCoord, wdStrings, wdItemIds, wpSummary, type WdEntity } from "./wiki";
import type { Unit, GuideRow, PhotoRow, PlaceDetailsRow, CoordsRow, ClassificationRow, ListItemRef, AttractionItem } from "./types";

export type Seed = { unit_key: string; qid: string | null; name: string; city: string; country: string | null; source: "factory" | "app"; priority: number | null; hits: number };

/** Wikidata classes that imply a larger footprint (coordinate and hours thresholds). */
const NATURE = new Set(["Q8502", "Q23397", "Q46831", "Q150784", "Q39816", "Q4421", "Q46169", "Q34763", "Q23442", "Q355304", "Q40080"]); // mountain, lake, mountain range, canyon, valley, forest, national park, peninsula, river, strait, beach
const DISTRICT = new Set(["Q7444", "Q123705", "Q22698", "Q11315", "Q1549591", "Q1348006"]); // old town, neighbourhood, park, shopping mall, big city square, promenade
const SITE = new Set(["Q839954", "Q16560", "Q44539", "Q24398318", "Q12280", "Q1081138", "Q1497364", "Q57821", "Q33506"]); // archaeological site, palace, temple complex, religious complex, bridge, historic site, building complex, fortification, museum(large)

export function sizeClassOf(instanceOf: string[]): Unit["sizeClass"] {
  if (instanceOf.some((q) => NATURE.has(q))) return "nature";
  if (instanceOf.some((q) => DISTRICT.has(q))) return "district";
  if (instanceOf.some((q) => SITE.has(q))) return "site";
  return "building";
}

async function resolveQid(seed: Seed, enTitleGuess: string): Promise<{ qid: string | null; enTitle: string | null }> {
  if (seed.qid) return { qid: seed.qid, enTitle: null };
  const s = await wpSummary("en", enTitleGuess);
  if (s?.wikibase_item && s.type !== "disambiguation") return { qid: s.wikibase_item, enTitle: s.title };
  return { qid: null, enTitle: null };
}

export async function buildUnit(seed: Seed): Promise<Unit> {
  const nameN = normalizeName(seed.name);
  const cityN = normalizeName(seed.city);

  // 1. The anchor EN row, then every row sharing its payload (any name/city key).
  const anchor = await db.select<GuideRow & { payload_text?: string }>(
    "cached_guides",
    `select=id,name_normalized,city_normalized,language,interest,payload,hit_count,updated_at&language=eq.en&interest=eq.editors&name_normalized=eq.${encodeURIComponent(nameN)}&city_normalized=eq.${encodeURIComponent(cityN)}&limit=1`,
  );
  if (!anchor[0]) throw new Error(`no EN editors row for ${seed.name} | ${seed.city}`);
  const enPayload = anchor[0].payload;
  const enPayloadMd5 = payloadMd5(enPayload);

  // Rows with the same payload: PostgREST cannot filter by md5, so fetch candidates by name
  // (all buckets) and by the title, then compare md5 locally.
  const candidateNames = new Set<string>([nameN, normalizeName(enPayload.title || seed.name)]);
  const byName = await selectAll<GuideRow>(
    "cached_guides",
    `select=id,name_normalized,city_normalized,language,interest,payload,hit_count,updated_at&name_normalized=${inList([...candidateNames])}`,
  );
  const enRows = byName.filter((r) => r.language === "en" && r.interest === "editors" && payloadMd5(r.payload) === enPayloadMd5);
  // Any other EN editors row under these names with a DIFFERENT payload is a duplicate guide (ALIASES §2).
  const duplicates = byName.filter((r) => r.language === "en" && r.interest === "editors" && payloadMd5(r.payload) !== enPayloadMd5);
  const keys = dedupeKeys(enRows.map((r) => ({ name: r.name_normalized, city: r.city_normalized })));
  const keySet = new Set(keys.map((k) => `${k.name}|${k.city}`));
  const translatedRows = byName.filter((r) => r.language !== "en" && r.interest === "editors" && keySet.has(`${r.name_normalized}|${r.city_normalized}`));
  const otherInterestRows = byName.filter((r) => r.language === "en" && r.interest !== "editors" && keySet.has(`${r.name_normalized}|${r.city_normalized}`));
  const names = [...new Set(keys.map((k) => k.name))];

  // 2. Wikidata + Wikipedia identity.
  const { qid, enTitle: enTitleFromSummary } = await resolveQid(seed, enPayload.title || seed.name);
  let wd: WdEntity | null = qid ? await wdEntity(qid) : null;
  const enTitle = wd?.sitelinks?.enwiki ?? enTitleFromSummary ?? null;
  const instanceOf = wd ? wdItemIds(wd, "P31") : [];

  // 3. Lists: enrichment row + items in city lists (all languages), matched by name or name_en.
  const listRows = await selectAll<{ id: string; query_normalized: string; language: string; payload: { attractions?: Array<AttractionItem & { name_en?: string }> } }>(
    "cached_attractions",
    `select=id,query_normalized,language,payload&or=(query_normalized.in.(${names.map((n) => `"${n.replace(/"/g, '\\"')}"`).map(encodeURIComponent).join(",")}),query_normalized.eq.${encodeURIComponent(cityN || "__none__")})`,
  );
  const listItems: ListItemRef[] = [];
  let enrichment: ListItemRef | null = null;
  for (const row of listRows) {
    (row.payload?.attractions ?? []).forEach((item, index) => {
      const n = normalizeName(item.name ?? ""), ne = normalizeName(item.name_en ?? "");
      if (!names.includes(n) && !names.includes(ne)) return;
      const ref = { listId: row.id, query: row.query_normalized, language: row.language, index, item };
      listItems.push(ref);
      if (!enrichment && row.language === "en" && names.includes(row.query_normalized)) enrichment = ref;
    });
  }
  // City lists in other cities that merely mention a homonym are NOT the unit; the caller filters by
  // the unit's city when needed (ALIASES §1 homonym rule).

  // 4. Coordinates, photos, place details, classifications — for every name of the unit.
  const [coordsRows, photoRows, pdRows, clsRows] = await Promise.all([
    db.select<CoordsRow>("attraction_coords", `select=*&name_key=${inList(names)}`),
    selectAll<PhotoRow>("cached_photos", `select=cache_key,url,source_url,not_found,updated_at&or=(${names.map((n) => `cache_key.like.*||${encodeURIComponent(n.replace(/[%_]/g, "\\$&"))}`).join(",")})`),
    selectAll<PlaceDetailsRow>("cached_place_details", `select=*&or=(${names.map((n) => `name.ilike.${encodeURIComponent(n)}`).join(",")})`),
    selectAll<ClassificationRow>("cached_classifications", `select=*&kind=eq.attraction&or=(${names.map((n) => `name.ilike.${encodeURIComponent(n)}`).join(",")},query_normalized.in.(${names.map(encodeURIComponent).join(",")}))`),
  ]);
  // Photo keys are scope|city|museum|name; keep only place scope ('') and 'gallery', exact name match.
  const photos = { single: [] as PhotoRow[], gallery: [] as PhotoRow[] };
  for (const p of photoRows) {
    const [scope, , museum, n] = p.cache_key.split("|");
    if (museum || !names.includes(n)) continue;
    if (scope === "") photos.single.push(p);
    else if (scope === "gallery") photos.gallery.push(p);
  }

  return {
    unitKey: seed.unit_key,
    qid,
    name: enPayload.title || seed.name,
    city: seed.city,
    country: seed.country,
    source: seed.source,
    priority: seed.priority,
    hits: enRows.reduce((s, r) => s + (r.hit_count || 0), 0),
    enRows,
    translatedRows,
    otherInterestRows,
    enPayload,
    enPayloadMd5,
    keys,
    names,
    listItems,
    enrichment,
    coords: coordsRows[0] ?? null,
    photos,
    placeDetails: pdRows,
    classifications: clsRows,
    wiki: {
      enTitle,
      sitelinks: wd?.sitelinks ?? {},
      p625: wd ? wdCoord(wd) : null,
      p18: wd ? (wdStrings(wd, "P18")[0] ?? null) : null,
      p373: wd ? (wdStrings(wd, "P373")[0] ?? null) : null,
      description: wd?.description ?? null,
      instanceOf,
    },
    sizeClass: sizeClassOf(instanceOf),
    aliases: [],
    // Duplicate guides are surfaced through a finding by aliases.ts; stash them on the unit.
    ...(duplicates.length ? { duplicates } : {}),
  } as Unit & { duplicates?: GuideRow[] };
}

function dedupeKeys(keys: Array<{ name: string; city: string }>) {
  const m = new Map<string, { name: string; city: string }>();
  for (const k of keys) m.set(`${k.name}|${k.city}`, k);
  return [...m.values()];
}

/**
 * Fill qa_units from the database. Run once (idempotent: insertIgnore).
 *   factory units: content_jobs kind=guide status=published → qid, rank, name, city
 *   app units:     EN editors guides not covered by a factory job → priority 100000+, by hit_count
 */
export async function seedUnits(): Promise<{ factory: number; app: number }> {
  const jobs = await selectAll<{ target_qid: string; name: string; city: string | null; country: string | null; rank: number | null }>(
    "content_jobs",
    "select=target_qid,name,city,country,rank&kind=eq.guide&status=eq.published",
  );
  const seeds = new Map<string, Seed>();
  for (const j of jobs) {
    const key = `${normalizeName(j.name)}|${normalizeName(j.city ?? "")}`;
    seeds.set(key, { unit_key: key, qid: j.target_qid?.startsWith("Q") ? j.target_qid : null, name: j.name, city: j.city ?? "", country: j.country, source: "factory", priority: j.rank, hits: 0 });
  }
  const factory = seeds.size;
  // App-born: one seed per distinct payload, choosing the row with a city bucket when there is one.
  const en = await selectAll<{ name_normalized: string; city_normalized: string; hit_count: number; payload: { title?: string } }>(
    "cached_guides",
    "select=name_normalized,city_normalized,hit_count,payload&language=eq.en&interest=eq.editors&order=hit_count.desc",
  );
  const seenPayload = new Set<string>();
  let rankApp = 100_000;
  for (const r of en) {
    const h = payloadMd5(r.payload);
    if (seenPayload.has(h)) continue;
    seenPayload.add(h);
    const key = `${r.name_normalized}|${r.city_normalized}`;
    if (seeds.has(key) || [...seeds.values()].some((s) => normalizeName(s.name) === r.name_normalized)) continue;
    seeds.set(key, { unit_key: key, qid: null, name: r.payload?.title || r.name_normalized, city: r.city_normalized, country: null, source: "app", priority: rankApp++, hits: r.hit_count });
  }
  const rows = [...seeds.values()].map((s) => ({ ...s, status: "queued" }));
  for (let i = 0; i < rows.length; i += 500) await db.insertIgnore("qa_units", rows.slice(i, i + 500), "unit_key");
  return { factory, app: seeds.size - factory };
}
