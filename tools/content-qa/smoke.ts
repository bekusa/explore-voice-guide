/** Phase 0 smoke test: assemble the top factory unit, read-only. Run in the factory cloud environment:
 *   CF_DRY_RUN=1 npx tsx tools/content-qa/smoke.ts
 */
import { buildUnit } from "./unit";
import { db } from "./db";
const seed = (await db.select<{ name: string; city: string | null; target_qid: string; rank: number }>("content_jobs", "select=name,city,target_qid,rank&kind=eq.guide&status=eq.published&order=rank&limit=1"))[0];
console.log("seed:", seed);
const { normalizeName } = await import("@/lib/cacheKey");
const u = await buildUnit({ unit_key: `${normalizeName(seed.name)}|${normalizeName(seed.city ?? "")}`, qid: seed.target_qid, name: seed.name, city: seed.city ?? "", country: null, source: "factory", priority: seed.rank, hits: 0 });
console.log(JSON.stringify({ qid: u.qid, name: u.name, keys: u.keys, enRows: u.enRows.length, translated: u.translatedRows.length, other: u.otherInterestRows.length, listItems: u.listItems.length, enrichment: !!u.enrichment, coords: u.coords, photos: { single: u.photos.single.map(p=>p.cache_key), gallery: u.photos.gallery.map(p=>p.cache_key) }, pd: u.placeDetails.length, cls: u.classifications.length, wiki: { ...u.wiki, sitelinks: Object.keys(u.wiki.sitelinks).length }, sizeClass: u.sizeClass }, null, 1));
