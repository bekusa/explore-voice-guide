/**
 * Build the worklist from the October target lists.
 *
 *   npx tsx tools/content-factory/prepare.ts <guides.csv> <cities.csv> [--load]
 *
 * Writes worklist.json next to the CSVs (cached SPARQL answers in
 * wikidata-cache.json so a re-run costs nothing) and, with --load,
 * fills target_guides / target_attractions and queues content_jobs.
 *
 * Decisions applied (Beka 2026-10-21):
 *  - the 8 "unsure" guide categories are left out of the first wave;
 *  - cities: only settlement types (no town / municipality / historical
 *    region / country / region in the first wave);
 *  - places that already have an English guide / cities that already have
 *    an English list are skipped (re-checked again at publish time).
 *
 * City resolution: the target list's nearest_city is often wrong
 * (Leaning Tower of Pisa → Lucca, Auschwitz → Tychy), and the city is
 * both sent to the prompt and used as the cache bucket, so we resolve it
 * from Wikidata's "located in" (P131) chain instead.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeName } from "@/lib/cacheKey";
import { CONFIG } from "./config";
import { db, DRY_RUN } from "./db";
import { isGone, km } from "./gate2";

type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const SETTLEMENT_TYPES = new Set(["big city", "city", "capital", "town", "settlement", "village", "urban area", "municipality", "agglomeration", "quarter", "hamlet"]);
const RUIN_CATEGORIES = /archaeolog|ruin|ancient|tell|necropolis|fortification|castle|amphitheatre|theatre/i;

type WdInfo = {
  inception: string[];
  dissolved: string[];
  chain: { id: string; label: string; pop: number | null }[][]; // per P131 path
};

async function sparql(query: string): Promise<any[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json", "User-Agent": "Lokali-content-factory/1.0 (contact@lokali.travel)" },
      body: `query=${encodeURIComponent(query)}`,
    });
    if (res.ok) return (await res.json()).results.bindings;
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error("SPARQL failed 4×");
}

const qidOf = (uri?: { value: string }) => (uri ? uri.value.replace(/^.*\//, "") : "");

async function wikidataInfo(qids: string[], cacheFile: string): Promise<Map<string, WdInfo>> {
  const cache: Record<string, WdInfo> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const todo = qids.filter((q) => !cache[q]);
  const B = 120;
  for (let i = 0; i < todo.length; i += B) {
    const batch = todo.slice(i, i + B);
    const rows = await sparql(`SELECT ?item ?inc ?dis ?a1 ?a1Label ?a1pop ?a2 ?a2Label ?a2pop ?a3 ?a3Label ?a4 ?a4Label WHERE {
      VALUES ?item { ${batch.map((q) => `wd:${q}`).join(" ")} }
      OPTIONAL { ?item wdt:P571 ?inc }
      OPTIONAL { ?item wdt:P576 ?dis }
      OPTIONAL { ?item wdt:P131 ?a1 . OPTIONAL { ?a1 wdt:P1082 ?a1pop }
        OPTIONAL { ?a1 wdt:P131 ?a2 . OPTIONAL { ?a2 wdt:P1082 ?a2pop }
          OPTIONAL { ?a2 wdt:P131 ?a3 . OPTIONAL { ?a3 wdt:P131 ?a4 } } } }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`);
    const acc = new Map<string, { inc: Set<string>; dis: Set<string>; chains: Map<string, WdInfo["chain"][number]> }>();
    for (const r of rows) {
      const id = qidOf(r.item);
      const a = acc.get(id) ?? { inc: new Set(), dis: new Set(), chains: new Map() };
      if (r.inc) a.inc.add(r.inc.value.replace(/T.*$/, ""));
      if (r.dis) a.dis.add(r.dis.value.replace(/T.*$/, ""));
      const chain = [
        r.a1 && { id: qidOf(r.a1), label: r.a1Label?.value ?? "", pop: r.a1pop ? Number(r.a1pop.value) : null },
        r.a2 && { id: qidOf(r.a2), label: r.a2Label?.value ?? "", pop: r.a2pop ? Number(r.a2pop.value) : null },
        r.a3 && { id: qidOf(r.a3), label: r.a3Label?.value ?? "", pop: null },
        r.a4 && { id: qidOf(r.a4), label: r.a4Label?.value ?? "", pop: null },
      ].filter(Boolean) as WdInfo["chain"][number];
      if (chain.length) a.chains.set(chain.map((c) => c.id).join(">"), chain);
      acc.set(id, a);
    }
    for (const q of batch) {
      const a = acc.get(q);
      cache[q] = { inception: [...(a?.inc ?? [])], dissolved: [...(a?.dis ?? [])], chain: [...(a?.chains.values() ?? [])] };
    }
    writeFileSync(cacheFile, JSON.stringify(cache));
    process.stdout.write(`\rwikidata ${Math.min(i + B, todo.length)}/${todo.length}`);
  }
  if (todo.length) process.stdout.write("\n");
  return new Map(Object.entries(cache));
}

/** For items Wikidata marks "dissolved, abolished or demolished" (P576) we
 *  still need to know whether the BUILDING is gone or only the institution
 *  (a dissolved monastery, a closed prison, a camp that is now a museum).
 *  Gone = state of conservation (P5816) or instance of (P31) says so. */
async function physicallyGone(qids: string[], cacheFile: string): Promise<Set<string>> {
  const cache: Record<string, string[]> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const todo = qids.filter((q) => !(q in cache));
  for (let i = 0; i < todo.length; i += 150) {
    const batch = todo.slice(i, i + 150);
    const rows = await sparql(`SELECT ?item ?xLabel WHERE {
      VALUES ?item { ${batch.map((q) => `wd:${q}`).join(" ")} }
      { ?item wdt:P5816 ?x } UNION { ?item wdt:P31 ?x }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`);
    for (const q of batch) cache[q] = [];
    for (const r of rows) cache[qidOf(r.item)].push(r.xLabel?.value ?? "");
    writeFileSync(cacheFile, JSON.stringify(cache));
  }
  const GONE = /\b(destroyed|demolished|collapsed|dismantled|lost|former building|former structure|no longer exists)\b/i;
  return new Set(Object.entries(cache).filter(([q, labels]) => qids.includes(q) && labels.some((l) => GONE.test(l))).map(([q]) => q));
}

/** Historical cities (Constantinople, East Berlin) are in the target list
 *  but must not become a query or a guide's city bucket. */
async function dissolvedEntities(qids: string[], cacheFile: string): Promise<Set<string>> {
  const cache: Record<string, boolean> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const todo = qids.filter((q) => !(q in cache));
  for (let i = 0; i < todo.length; i += 300) {
    const batch = todo.slice(i, i + 300);
    const rows = await sparql(`SELECT DISTINCT ?item WHERE { VALUES ?item { ${batch.map((q) => `wd:${q}`).join(" ")} } ?item wdt:P576 ?d }`);
    for (const q of batch) cache[q] = false;
    for (const r of rows) cache[qidOf(r.item)] = true;
    writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return new Set(qids.filter((q) => cache[q]));
}

function wdTimeYear(s: string): string {
  // "-0500-01-01" / "0537-12-27" → same signed-year format gate2.isGone() reads
  return s;
}

async function main() {
  const [guidesCsv, citiesCsv, ...flags] = process.argv.slice(2);
  const load = flags.includes("--load");
  const outDir = dirname(guidesCsv);
  const guides = parseCsv(readFileSync(guidesCsv, "utf8"));
  const cities = parseCsv(readFileSync(citiesCsv, "utf8"));

  const historical = await dissolvedEntities(cities.map((c) => c.qid), join(outDir, "wikidata-cities-dissolved.json"));
  const cityByQid = new Map(cities.filter((c) => SETTLEMENT_TYPES.has(c.place_type) && !historical.has(c.qid)).map((c) => [c.qid, c]));
  // Big settlements first so a tie goes to the city people search for.
  const settlements = [...cityByQid.values()]
    .filter((c) => Number.isFinite(Number(c.lat)))
    .map((c) => ({ row: c, pos: { lat: Number(c.lat), lng: Number(c.lng) } }));
  const countryQids = new Set(cities.filter((c) => c.place_type === "country").map((c) => c.qid));

  // Which normalized names belong to exactly one target place? Only those may use the '' bucket.
  const keyOwners = new Map<string, Set<string>>();
  for (const g of guides) for (const n of [g.name, g.en_title]) {
    const k = normalizeName(n);
    if (!keyOwners.has(k)) keyOwners.set(k, new Set());
    keyOwners.get(k)!.add(g.qid);
  }

  const excluded = new Set(CONFIG.worklist.excludeGuideCategories);
  const candidates = guides.filter((g) => !excluded.has(g.category) && g.has_guide !== "true");
  const wd = await wikidataInfo(candidates.map((g) => g.qid), join(outDir, "wikidata-cache.json"));

  const maybeGone = candidates.filter((g) => {
    const info = wd.get(g.qid);
    return info && !RUIN_CATEGORIES.test(g.category) && isGone({ inception: info.inception.map(wdTimeYear), dissolved_or_demolished: info.dissolved.map(wdTimeYear) });
  });
  const gone = await physicallyGone(maybeGone.map((g) => g.qid), join(outDir, "wikidata-gone.json"));
  const guideJobs = [];
  const skipped: Record<string, number> = {};
  const skippedNames: string[] = [];
  for (const g of candidates) {
    const info = wd.get(g.qid);
    if (gone.has(g.qid)) { skipped.no_longer_exists = (skipped.no_longer_exists ?? 0) + 1; skippedNames.push(`${g.rank} ${g.name}`); continue; }
    // (a) nearest ancestor that is one of our target settlements
    let city = "";
    let cityAliases: string[] = [];
    let how = "";
    for (const chain of info?.chain ?? []) {
      const hit = chain.find((a) => cityByQid.has(a.id));
      if (hit) {
        const c = cityByQid.get(hit.id)!;
        city = c.name; cityAliases = c.en_title !== c.name ? [c.en_title] : []; how = "p131_target_city";
        break;
      }
    }
    // (b) the nearest target settlement by coordinates (Berlin Wall → Berlin, not the borough)
    if (!city && Number.isFinite(Number(g.lat))) {
      let bestKm = 15;
      for (const c of settlements) {
        const d = km({ lat: Number(g.lat), lng: Number(g.lng) }, c.pos);
        if (d < bestKm) { bestKm = d; city = c.row.name; cityAliases = c.row.en_title !== c.row.name ? [c.row.en_title] : []; how = "nearest_target_city"; }
      }
    }
    // (c) first populated, non-country ancestor
    if (!city) {
      for (const chain of info?.chain ?? []) {
        const a = chain.find((x, i) => i < 2 && x.pop && x.pop > 0 && !countryQids.has(x.id) && !historical.has(x.id) && x.label && !/^Q\d+$/.test(x.label));
        if (a) { city = a.label; how = "p131_populated"; break; }
      }
    }
    // (d) fall back to the list's nearest city
    if (!city) { city = g.nearest_city; how = "nearest_fallback"; }
    if (g.nearest_city && normalizeName(g.nearest_city) !== normalizeName(city) && Number(g.nearest_city_km) <= 15) cityAliases.push(g.nearest_city);

    const promptName = /\(/.test(g.en_title) ? g.name : g.en_title;
    const keyNames = [...new Set([g.en_title, g.name, promptName].filter(Boolean))];
    const bucketless = keyNames.filter((n) => (keyOwners.get(normalizeName(n))?.size ?? 0) === 1 && g.name_collision !== "true");
    guideJobs.push({
      kind: "guide", target_qid: g.qid, rank: Number(g.rank), name: promptName, city, country: g.country,
      homonym: g.name_collision === "true",
      meta: { en_title: g.en_title, keyNames, cityAliases: [...new Set(cityAliases)], bucketlessNames: bucketless, category: g.category, lat: Number(g.lat), lng: Number(g.lng), city_how: how },
    });
  }

  // City names that only one target city uses can be keyed bare ("Paris"); others only by en_title.
  const cityKeyOwners = new Map<string, number>();
  for (const c of cities) for (const n of new Set([c.name, c.en_title])) cityKeyOwners.set(normalizeName(n), (cityKeyOwners.get(normalizeName(n)) ?? 0) + 1);
  const cityJobs = cities
    .filter((c) => CONFIG.worklist.cityPlaceTypes.includes(c.place_type) && c.category_review !== "unsure" && c.has_attractions !== "true" && !historical.has(c.qid))
    .map((c) => ({
      kind: "attractions", target_qid: c.qid, rank: Number(c.rank), name: c.en_title, city: "", country: c.country, homonym: false,
      meta: { queries: [...new Set([c.en_title, ...(c.name !== c.en_title && cityKeyOwners.get(normalizeName(c.name)) === 1 ? [c.name] : [])])], lat: Number(c.lat), lng: Number(c.lng), place_type: c.place_type },
    }));

  const hows: Record<string, number> = {};
  for (const j of guideJobs) hows[j.meta.city_how] = (hows[j.meta.city_how] ?? 0) + 1;
  const summary = { guides_in_list: guides.length, guide_candidates: candidates.length, guide_jobs: guideJobs.length, skipped, skipped_examples: skippedNames.slice(0, 40), historical_cities: historical.size, city_resolution: hows, city_jobs: cityJobs.length };
  writeFileSync(join(outDir, "worklist.json"), JSON.stringify({ summary, guideJobs, cityJobs }, null, 0));
  console.log(JSON.stringify(summary, null, 1));

  if (load) {
    if (DRY_RUN) throw new Error("--load with CF_DRY_RUN=1 makes no sense");
    const targetG = guides.map((g) => ({
      qid: g.qid, rank: Number(g.rank), name: g.name, name_normalized: normalizeName(g.name), en_title: g.en_title, category: g.category, country: g.country,
      lat: Number(g.lat) || null, lng: Number(g.lng) || null, sitelinks: Number(g.sitelinks) || null, pageviews_month: Number(g.pageviews_month) || null,
      score: Number(g.score) || null, nearest_city: g.nearest_city, nearest_city_km: Number(g.nearest_city_km) || null,
      has_guide: g.has_guide === "true", guide_languages: Number(g.guide_languages) || 0, guide_match: g.guide_match || null,
    }));
    const targetA = cities.map((c) => ({
      qid: c.qid, rank: Number(c.rank), name: c.name, name_normalized: normalizeName(c.name), en_title: c.en_title, country: c.country,
      lat: Number(c.lat) || null, lng: Number(c.lng) || null, population: Number(c.population) || null, sitelinks: Number(c.sitelinks) || null,
      pageviews_month: Number(c.pageviews_month) || null, score: Number(c.score) || null, has_attractions: c.has_attractions === "true",
      attraction_langs: Number(c.attraction_langs) || 0, attraction_count: Number(c.attraction_count) || null, place_type: c.place_type,
    }));
    for (let i = 0; i < targetG.length; i += 500) await db.upsert("target_guides", targetG.slice(i, i + 500), "qid");
    for (let i = 0; i < targetA.length; i += 500) await db.upsert("target_attractions", targetA.slice(i, i + 500), "qid");
    const jobs = [...guideJobs, ...cityJobs];
    for (let i = 0; i < jobs.length; i += 500) await db.insertIgnore("content_jobs", jobs.slice(i, i + 500), "kind,name,city");
    console.log(`loaded ${targetG.length} target_guides, ${targetA.length} target_attractions, queued ${jobs.length} jobs`);
  }
}

await main();
