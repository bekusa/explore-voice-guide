/**
 * Post-publication audit of everything the factory wrote.
 *
 *   npx tsx tools/content-factory/audit.ts fetch   # pull jobs + the app's cache rows into $CF_OUT/audit-data
 *   npx tsx tools/content-factory/audit.ts check   # run every check, write $CF_OUT/audit/*.json|csv
 *
 * It audits what users actually receive: the rows in cached_guides /
 * cached_attractions / cached_classifications, joined to content_jobs by
 * the keys the publisher recorded. Every rule is a rule the app states —
 * the prompt (src/lib/prompts.ts), the post-processor
 * (src/lib/guidePostprocess.ts) or the cache layer (src/lib/cacheKey.ts).
 * Read-only: nothing here writes to the database.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeGuidePayload } from "@/lib/guidePostprocess";
import { normalizeName } from "@/lib/cacheKey";
import { INTERESTS } from "@/lib/interests";
import { db } from "./db";
import { foldName, gate1Attractions, gate1Guide } from "./gate1";
import { km } from "./gate2";
import type { AttractionItem, GuidePayload } from "./generate";

const OUT = process.env.CF_OUT ?? "cf-out";
const DATA = join(OUT, "audit-data");
const REPORT = join(OUT, "audit");
const WINDOW = { from: "2026-10-22T18:00:00Z" };

type Job = {
  id: number;
  kind: "guide" | "attractions";
  name: string;
  city: string;
  country: string | null;
  rank: number;
  homonym: boolean;
  target_qid: string;
  published_keys: any[];
  meta: Record<string, any>;
};
type GuideRow = { id: string; name_normalized: string; city_normalized: string; payload: GuidePayload; hit_count: number; created_at: string };
type ListRow = { id: string; query_normalized: string; filters_key: string; payload: { attractions: AttractionItem[] }; hit_count: number; created_at: string };
type ClassRow = { query_normalized: string; kind: string; name: string; city: string | null; country: string | null; slug: string };
type TransRow = { id: string; name_normalized: string; city_normalized: string; language: string; interest: string; created_at: string };

async function fetchAll<T>(table: string, query: string, page = 500): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += page) {
    const rows = await db.select<T>(table, `${query}&limit=${page}&offset=${offset}`);
    out.push(...rows);
    process.stdout.write(`\r${table}: ${out.length}`);
    if (rows.length < page) break;
  }
  process.stdout.write("\n");
  return out;
}

async function fetchData() {
  mkdirSync(DATA, { recursive: true });
  // rows the factory wrote, plus keys added later by audit fixes (regen.ts / city relabelling)
  const win = `created_at=gte.${WINDOW.from}`;
  const jobs = await fetchAll<Job>("content_jobs", "select=id,kind,name,city,country,rank,homonym,target_qid,published_keys,meta&status=eq.published&order=id.asc", 1000);
  writeFileSync(join(DATA, "jobs.json"), JSON.stringify(jobs));
  const guides = await fetchAll<GuideRow>("cached_guides", `select=id,name_normalized,city_normalized,payload,hit_count,created_at&language=eq.en&interest=eq.editors&${win}&order=id.asc`, 400);
  writeFileSync(join(DATA, "guides.json"), JSON.stringify(guides));
  const lists = await fetchAll<ListRow>("cached_attractions", `select=id,query_normalized,filters_key,payload,hit_count,created_at&language=eq.en&${win}&order=id.asc`, 500);
  writeFileSync(join(DATA, "lists.json"), JSON.stringify(lists));
  const classes = await fetchAll<ClassRow>("cached_classifications", `select=query_normalized,kind,name,city,country,slug&${win}&order=query_normalized.asc`, 1000);
  writeFileSync(join(DATA, "classifications.json"), JSON.stringify(classes));
  const trans = await fetchAll<TransRow>("cached_guides", `select=id,name_normalized,city_normalized,language,interest,created_at&language=neq.en&created_at=gte.${WINDOW.from}&order=id.asc`, 1000);
  writeFileSync(join(DATA, "translations.json"), JSON.stringify(trans));
  console.log(`jobs ${jobs.length} · guide rows ${guides.length} · list rows ${lists.length} · classifications ${classes.length} · translations ${trans.length}`);
}

/* ───────── checks ───────── */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const INTEREST_IDS = new Set(INTERESTS.map((i) => i.id));

type Finding = { id: string; severity: "fail" | "fix" | "warn"; rule: string; detail?: string };

/** Rules the stored guide must meet. `fail` = breaks the app contract and needs regeneration,
 *  `fix` = deterministic repair possible, `warn` = style deviation, kept. */
function checkGuide(job: Job, g: GuidePayload): { findings: Finding[]; metrics: Record<string, any> } {
  const f: Finding[] = [];
  const id = `guide#${job.id}`;
  const add = (severity: Finding["severity"], rule: string, detail?: string) => f.push({ id, severity, rule, detail });
  const g1 = gate1Guide(g, job.meta.en_title ?? job.name);
  const script = g.script ?? "";
  const paras = script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const total = words(script);

  // Contract violations the generator gates already block (should be zero)
  for (const h of g1.hard) {
    if (h.startsWith("chip_count")) {
      const n = Number(h.split(":").pop());
      add(n > 5 ? "fix" : "fail", "chip_count", h);
    } else add("fail", h.split(":")[0], h);
  }

  // App post-processor must be a no-op on what's stored (duration + digit years)
  const renorm = normalizeGuidePayload(g) as GuidePayload;
  if (renorm.estimated_duration_seconds !== g.estimated_duration_seconds) add("fix", "duration_formula", `${g.estimated_duration_seconds}→${renorm.estimated_duration_seconds}`);
  if (renorm.script !== g.script || JSON.stringify([renorm.key_facts, renorm.tips, renorm.look_for, renorm.title]) !== JSON.stringify([g.key_facts, g.tips, g.look_for, g.title])) add("fix", "spoken_years_not_digitized");

  // Length — the prompt: "hard minimum 900 ... Under 900 words is a failed guide"
  if (total < 900) add(total < 800 ? "fail" : "warn", "words_under_900", String(total));
  if (total > 1500) add("warn", "words_over_1500", String(total));
  if (paras.length < 12 || paras.length > 14) add(paras.length < 10 ? "fail" : "warn", "paragraph_count", String(paras.length));
  const shortParas = paras.filter((p) => words(p) < 75).length;
  const longParas = paras.filter((p) => words(p) > 110).length;
  if (longParas) add(longParas > 2 ? "warn" : "warn", "paragraph_over_110", String(longParas));
  if (shortParas > 2) add("warn", "paragraphs_under_75", String(shortParas));
  const dupPara = paras.length - new Set(paras.map((p) => p.toLowerCase())).size;
  if (dupPara) add("fail", "duplicate_paragraph", String(dupPara));

  // Truncation / meta text
  if (!/[.!?…"”'’)]\s*$/.test(script.trim())) add("fail", "script_truncated", script.trim().slice(-60));
  if (/\b([Aa]s an AI|language model|this particular (venue|site)|[Ii]t is not in [A-Z][a-z]+|[Ii]f you (planned|started) your day)\b/.test(script)) add("fail", "meta_or_hint_artifact");

  // Chips: count 3-5 (6+ is trimmable), length, price/hours in tips
  for (const k of ["key_facts", "tips", "look_for"] as const) {
    const arr = (g[k] ?? []) as string[];
    const lim = k === "tips" ? 14 : 12;
    const long = arr.filter((c) => words(c) > lim + 2).length;
    if (long) add("warn", `chip_too_long:${k}`, String(long));
    const empty = arr.filter((c) => typeof c !== "string" || !c.trim()).length;
    if (empty) add("fix", `chip_empty:${k}`, String(empty));
    const dups = arr.length - new Set(arr.map((c) => foldName(String(c)))).size;
    if (dups) add("fix", `chip_duplicate:${k}`, String(dups));
  }
  const priceRx = /[€$£¥₺₹]\s?\d|\b\d+(\.\d+)?\s?(euros?|dollars?|usd|eur|lira|liras|pounds|rupees|yen|yuan|baht|dirhams?)\b|\bfree (entry|admission|of charge)\b|\b(entrance|admission|entry) (fee|ticket costs?)\b|\b(ticket|admission) prices?\b|\bopen(s|ing)? (daily|every day|hours)\b|\bopen(s)? (from|until) \d{1,2}(:\d{2})?\s?(am|pm)?\b(?!\d)|\bclosed on (mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b|\b\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)\b/i;
  const priceTips = (g.tips ?? []).filter((t) => priceRx.test(String(t)));
  if (priceTips.length) add("fix", "tip_price_or_hours", priceTips.join(" | "));
  for (const k of ["key_facts", "look_for"] as const) {
    const hit = (g[k] ?? []).filter((t) => priceRx.test(String(t)));
    if (hit.length) add("fix", `chip_price_or_hours:${k}`, hit.join(" | "));
  }
  const scriptPrice = script.match(new RegExp(priceRx.source, "gi"));
  if (scriptPrice) add("warn", "script_price_or_hours", [...new Set(scriptPrice)].join(","));

  // TTS rules
  if (/\*[^*\n]+\*/.test(script) || /(^|\s)_[^_\n]+_(\s|$)/.test(script)) add("fix", "markdown_emphasis");
  const parens = (script.match(/\(/g) ?? []).length;
  if (parens) add("warn", "parentheses", String(parens));
  const abbrev = script.match(/\bSt\.(?=\s+[A-Z])|\b\d+\s?(km|m|cm|sq m|ft)\b|\bBC\./g);
  if (abbrev) add("warn", "unspelled_abbreviation", [...new Set(abbrev)].join(","));
  const digitCent = script.match(/\b\d{1,2}(st|nd|rd|th)[- ]centur(y|ies)\b/gi);
  if (digitCent) add("warn", "digit_century", String(digitCent.length));
  const spokenYear = script.match(/\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen) (oh|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi);
  // "fifteen hundred years" is a duration, not a year — left alone on purpose
  if (spokenYear) add("warn", "spoken_year_left", [...new Set(spokenYear)].join(","));
  const sentences = script.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const longS = sentences.filter((s) => words(s) > 25).length;
  if (sentences.length && longS / sentences.length > 0.2) add("warn", "long_sentences", `${longS}/${sentences.length}`);
  const banned = g1.soft.find((s) => s.startsWith("banned:"));
  if (banned) add("warn", "banned_cliche", banned.slice(7));
  const title = g1.soft.find((s) => s.startsWith("title_mismatch:"));
  if (title) add("warn", "title_mismatch", `${title.slice(15)} ≠ ${job.meta.en_title ?? job.name}`);

  // Content policy (Beka 2026-10-23)
  const allText = [g.title, script, ...(g.key_facts ?? []), ...(g.tips ?? []), ...(g.look_for ?? [])].join("\n");
  if (/republic of abkhazia|republic of south ossetia|independent (state of )?(abkhazia|south ossetia)|(abkhazia|south ossetia|tskhinvali|sukhumi)[^.]{0,60}\b(in|of|part of) russia\b/i.test(allText)) add("fail", "georgia_policy");
  const future = (allText.match(/\b20(2[7-9]|[3-9]\d)\b/g) ?? []).filter((y) => !/\b(until|by|planned|expected|scheduled)\b/i.test(allText));
  if (future.length) add("warn", "future_year", [...new Set(future)].join(","));

  return {
    findings: f,
    metrics: { words: total, paragraphs: paras.length, chips: [g.key_facts?.length, g.tips?.length, g.look_for?.length], duration: g.estimated_duration_seconds },
  };
}

const VENUE_BAD = /\b(hotel|hostel|resort|inn|restaurant|bar|pub|café|cafe|mall|shopping cent(er|re)|outlet|cinema|casino|nightclub|bowling|escape room|trampoline|family fun|fun cent(er|re)|entertainment cent(er|re)|day spa|gym|stadium)\b/i;
const CONFLICT_EVERYDAY = /\b(market|bazaar|souk|port|harbou?r|beach|camp|park|square|street|promenade|embankment|boulevard)\b/i;

function checkList(job: Job, list: AttractionItem[], requeued: boolean): { findings: Finding[]; metrics: Record<string, any> } {
  const f: Finding[] = [];
  const id = `list#${job.id}`;
  const add = (severity: Finding["severity"], rule: string, detail?: string) => f.push({ id, severity, rule, detail });
  const g1 = gate1Attractions(list);
  for (const h of g1.hard) add("fail", h.replace(/^#\d+:/, "").split(":")[0], h);
  if (list.length > 10) add("fix", "items_over_10", String(list.length));

  const center = Number.isFinite(job.meta.lat) && Number.isFinite(job.meta.lng) ? { lat: job.meta.lat, lng: job.meta.lng } : null;
  let noCoords = 0;
  const coordKeys = new Map<string, number>();
  const folded = list.map((a) => foldName(String(a.name ?? "")));
  list.forEach((a, i) => {
    const tag = `#${i + 1} ${a.name}`;
    const r = Number(a.rating);
    if (!Number.isFinite(r)) add("fix", "rating_missing", tag);
    else if (r < 3.6) add("warn", "rating_below_3.6", `${tag} ${r}`);
    else if (r > 5) add("fix", "rating_over_5", `${tag} ${r}`);
    if (!INTEREST_IDS.has(String(a.category ?? ""))) add("fix", "category_invalid", `${tag} ${a.category}`);
    if (!/^\d+(\.\d+)?-\d+(\.\d+)? (min|hours)$/.test(String(a.duration ?? ""))) add("warn", "duration_format", `${tag} ${a.duration}`);
    if (words(String(a.type ?? "")) > 2 || !String(a.type ?? "").trim()) add("warn", "type_words", `${tag} ${a.type}`);
    const ow = words(String(a.outside_desc ?? ""));
    const iw = words(String(a.insider_desc ?? ""));
    if (ow < 25 || ow > 75) add("warn", "outside_desc_length", `${tag} ${ow}`);
    if (iw < 12 || iw > 55) add("warn", "insider_desc_length", `${tag} ${iw}`);
    if (/\(/.test(String(a.name))) add("fix", "parenthetical_name", tag);
    if (VENUE_BAD.test(`${a.type} ${a.name}`) && !/\b(market|historic|old|museum|monastery|palace|castle|fort|national park|botanical|theme park|amusement park|water ?park|thermal|geothermal)\b/i.test(`${a.type}`)) add("warn", "excluded_venue_type", `${tag} [${a.type}]`);
    if (typeof a.lat !== "number" || typeof a.lng !== "number") noCoords++;
    else {
      const k = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}`;
      coordKeys.set(k, (coordKeys.get(k) ?? 0) + 1);
      if (center) {
        const d = km(center, { lat: a.lat, lng: a.lng });
        if (d > 120) add("fix", "coords_far_from_city", `${tag} ${Math.round(d)} km`);
        else if (d > 50) add("warn", "coords_50_120km", `${tag} ${Math.round(d)} km`);
      }
    }
    // near-duplicate names: one name contained in another ("X" and "X Museum" are fine; "X" and "X Old Town" flagged as warn)
    folded.forEach((other, j) => {
      if (j > i && other && folded[i] && (other === folded[i])) add("fail", "duplicate_name", `${tag} = #${j + 1}`);
    });
    if (requeued && job.meta.conflict && CONFLICT_EVERYDAY.test(`${a.type} ${a.name}`)) add("warn", "conflict_zone_everyday_place", `${tag} [${a.type}]`);
  });
  for (const [k, n] of coordKeys) if (n > 1) add("warn", "shared_coordinates", `${n} items at ${k}`);
  if (noCoords) add("warn", "items_without_coords", `${noCoords}/${list.length}`);
  if (g1.soft.includes("rating_spread_narrow") && list.length >= 8) add("warn", "rating_spread_narrow");
  const allText = list.map((a) => `${a.name} ${a.outside_desc} ${a.insider_desc}`).join("\n");
  if (/republic of abkhazia|republic of south ossetia|(abkhazia|south ossetia|tskhinvali|sukhumi)[^.]{0,60}\b(in|of|part of) russia\b/i.test(allText)) add("fail", "georgia_policy");
  return { findings: f, metrics: { items: list.length, no_coords: noCoords } };
}

function runChecks() {
  mkdirSync(REPORT, { recursive: true });
  const jobs: Job[] = JSON.parse(readFileSync(join(DATA, "jobs.json"), "utf8"));
  const guideRows: GuideRow[] = JSON.parse(readFileSync(join(DATA, "guides.json"), "utf8"));
  const listRows: ListRow[] = JSON.parse(readFileSync(join(DATA, "lists.json"), "utf8"));
  const classes: ClassRow[] = JSON.parse(readFileSync(join(DATA, "classifications.json"), "utf8"));
  const trans: TransRow[] = JSON.parse(readFileSync(join(DATA, "translations.json"), "utf8"));

  const guideByKey = new Map(guideRows.map((r) => [`${r.name_normalized}|${r.city_normalized}`, r]));
  const listByQ = new Map(listRows.filter((r) => r.filters_key === "{}").map((r) => [r.query_normalized, r]));
  const classByQ = new Map(classes.map((r) => [r.query_normalized, r]));
  const transByKey = new Map<string, TransRow[]>();
  for (const t of trans) {
    const k = `${t.name_normalized}|${t.city_normalized}`;
    transByKey.set(k, [...(transByKey.get(k) ?? []), t]);
  }

  const findings: Finding[] = [];
  const guideMetrics: any[] = [];
  const listMetrics: any[] = [];
  const conflictCountries = new Set(["Palestine", "Syria", "Yemen", "Sudan", "South Sudan", "Somalia", "Ukraine", "Afghanistan", "Iraq", "Libya", "Central African Republic", "Israel"]);
  const disputed = /sevastopol|simferopol|yalta|kerch|tiraspol|stepanakert|khankendi|donetsk|luhansk|gaza|rafah|khan yunis|hebron|nablus|jenin/i;

  for (const job of jobs) {
    if (job.kind === "guide") {
      const keys = (job.published_keys ?? []) as { name_normalized: string; city_normalized: string }[];
      if (!keys.length) { findings.push({ id: `guide#${job.id}`, severity: "fail", rule: "no_published_keys" }); continue; }
      const rows = keys.map((k) => guideByKey.get(`${k.name_normalized}|${k.city_normalized}`));
      const missing = rows.filter((r) => !r).length;
      if (missing) findings.push({ id: `guide#${job.id}`, severity: "fail", rule: "cache_row_missing", detail: `${missing}/${keys.length}` });
      const present = rows.filter(Boolean) as GuideRow[];
      if (!present.length) continue;
      const payloadStrs = new Set(present.map((r) => JSON.stringify(r.payload)));
      if (payloadStrs.size > 1) findings.push({ id: `guide#${job.id}`, severity: "warn", rule: "keys_disagree", detail: String(payloadStrs.size) });
      // keys must be what the app computes for this place
      const expectName = normalizeName(job.meta.en_title ?? job.name);
      if (!keys.some((k) => k.name_normalized === expectName)) findings.push({ id: `guide#${job.id}`, severity: "fail", rule: "primary_key_missing", detail: expectName });
      const cls = (job.meta.keyNames ?? [job.name]).map((n: string) => classByQ.get(normalizeName(n)));
      const clsMissing = cls.filter((c: ClassRow | undefined) => !c).length;
      if (clsMissing) findings.push({ id: `guide#${job.id}`, severity: "warn", rule: "classification_missing", detail: `${clsMissing}/${cls.length}` });
      const { findings: gf, metrics } = checkGuide(job, present[0].payload);
      findings.push(...gf);
      const translations = keys.flatMap((k) => transByKey.get(`${k.name_normalized}|${k.city_normalized}`) ?? []);
      guideMetrics.push({ job: job.id, rank: job.rank, name: job.name, city: job.city, rows: present.map((r) => r.id), translations: translations.map((t) => `${t.language}:${t.id}`), ...metrics, rules: gf.map((x) => `${x.severity}:${x.rule}`) });
    } else {
      const qs = (job.published_keys ?? []) as string[];
      const rows = qs.map((q) => listByQ.get(q));
      const missing = rows.filter((r) => !r).length;
      if (!qs.length) { findings.push({ id: `list#${job.id}`, severity: "fail", rule: "no_published_keys" }); continue; }
      if (missing) findings.push({ id: `list#${job.id}`, severity: "fail", rule: "cache_row_missing", detail: `${missing}/${qs.length}` });
      const present = rows.filter(Boolean) as ListRow[];
      if (!present.length) continue;
      const list = present[0].payload?.attractions ?? [];
      const requeued = job.meta.cost_before_requeue_2026_10_23 !== undefined;
      const conflict = conflictCountries.has(job.country ?? "") || disputed.test(job.name);
      const { findings: lf, metrics } = checkList({ ...job, meta: { ...job.meta, conflict } }, list, requeued || conflict);
      findings.push(...lf);
      listMetrics.push({ job: job.id, rank: job.rank, name: job.name, country: job.country, rows: present.map((r) => r.id), requeued, conflict, ...metrics, rules: lf.map((x) => `${x.severity}:${x.rule}`) });
    }
  }

  // Summaries
  const byRule = new Map<string, { severity: string; n: number; ids: Set<string> }>();
  for (const x of findings) {
    const k = `${x.id.split("#")[0]}:${x.severity}:${x.rule}`;
    const e = byRule.get(k) ?? { severity: x.severity, n: 0, ids: new Set<string>() };
    e.n++;
    e.ids.add(x.id);
    byRule.set(k, e);
  }
  const summary = [...byRule.entries()].map(([k, v]) => ({ key: k, items: v.ids.size, occurrences: v.n })).sort((a, b) => a.key.localeCompare(b.key));
  const itemsWith = (kind: string, sev: string) => new Set(findings.filter((x) => x.id.startsWith(kind) && x.severity === sev).map((x) => x.id)).size;
  const stats = {
    guides: guideMetrics.length,
    lists: listMetrics.length,
    guide_items_fail: itemsWith("guide", "fail"),
    guide_items_fix: itemsWith("guide", "fix"),
    guide_items_warn: itemsWith("guide", "warn"),
    list_items_fail: itemsWith("list", "fail"),
    list_items_fix: itemsWith("list", "fix"),
    list_items_warn: itemsWith("list", "warn"),
    words: pct(guideMetrics.map((m) => m.words)),
    paragraphs: pct(guideMetrics.map((m) => m.paragraphs)),
    list_items: pct(listMetrics.map((m) => m.items)),
    translations_of_factory_guides: guideMetrics.reduce((s, m) => s + m.translations.length, 0),
  };
  writeFileSync(join(REPORT, "summary.json"), JSON.stringify({ stats, rules: summary }, null, 1));
  writeFileSync(join(REPORT, "findings.json"), JSON.stringify(findings));
  writeFileSync(join(REPORT, "guides.json"), JSON.stringify(guideMetrics));
  writeFileSync(join(REPORT, "lists.json"), JSON.stringify(listMetrics));
  console.log(JSON.stringify(stats, null, 1));
  for (const s of summary) console.log(`${String(s.items).padStart(6)} items  ${String(s.occurrences).padStart(6)}×  ${s.key}`);
}

function pct(xs: number[]) {
  const s = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], p05: q(0.05), p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

const cmd = process.argv[2];
if (cmd === "fetch") await fetchData();
else if (cmd === "check") runChecks();
else console.log("usage: audit.ts fetch|check");
