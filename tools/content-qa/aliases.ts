/**
 * aliases.ts — every name of the place, and making the app find it by all of them.
 *
 * Sources (all free): Wikidata labels + aliases, Wikipedia title + redirects, form variants,
 * names already in our DB, what users typed (name_resolution_logs). AI is a JUDGE and a
 * gap-filler, never the source of truth: an alias is written to app tables only when a non-AI
 * check ties it to the same QID (see prompt ALIASES "Where AI fits").
 *
 * Writes (free): qa_aliases, target_guide_aliases, cached_classifications (insert-only, collisions
 * → REVIEW), cached_guides alias keys (never overwrite a different payload), cached_photos alias keys.
 */
import { normalizeName, normalizeLang } from "@/lib/cacheKey";
import { runClaude } from "../content-factory/transport";
import { slugify } from "../content-factory/publish";
import { QA_CONFIG } from "./config";
import { db, DRY_RUN, inList, selectAll } from "./db";
import { wdEntity, wpRedirectsTo, wpSummary, sparql } from "./wiki";
import type { AliasRecord, CheckResult, Finding, Unit } from "./types";

const GENERIC = new Set(["old town", "old city", "cathedral", "castle", "fortress", "church", "mosque", "museum", "palace", "bridge", "tower", "square", "park", "garden", "beach", "market", "bazaar", "monastery", "temple", "lighthouse", "harbour", "harbor", "port", "lake", "river", "waterfall", "mountain", "national park", "city hall", "town hall", "main square", "central park", "botanical garden", "zoo", "aquarium", "opera house", "theatre", "theater", "library", "university", "stadium", "grand bazaar", "sulphur baths", "baths"]);
const TYPE_WORDS = new Set(["the", "church", "cathedral", "basilica", "mosque", "temple", "monastery", "abbey", "chapel", "synagogue", "castle", "fortress", "fort", "citadel", "palace", "museum", "gallery", "bridge", "tower", "square", "park", "garden", "gardens", "beach", "market", "bazaar", "lighthouse", "harbour", "harbor", "port", "lake", "river", "falls", "waterfall", "mountain", "mount", "hill", "island", "cave", "canyon", "valley", "national", "monument", "memorial", "ruins", "site", "complex", "hall", "house", "villa", "zoo", "aquarium", "theatre", "theater", "opera", "stadium", "station", "street", "avenue", "road", "gate", "wall", "walls", "old", "town", "city", "of", "and", "de", "la", "le", "del", "della", "di", "da", "du", "des", "san", "santa", "saint", "st"]);

const stripThe = (s: string) => s.replace(/^the\s+/i, "");
const properWords = (s: string) => normalizeName(stripThe(s)).split(/[^a-z0-9]+/).filter((w) => w && !TYPE_WORDS.has(w));

/** Collect candidate aliases from every free source. */
export async function collectAliases(unit: Unit): Promise<AliasRecord[]> {
  const out = new Map<string, AliasRecord>();
  const add = (alias: string, language: string | null, source: string) => {
    const a = alias.trim();
    if (!a) return;
    const n = normalizeName(a);
    if (!n || out.has(n)) return;
    out.set(n, { alias: a, aliasNormalized: n, language, source, accepted: false, ambiguous: false, reason: null });
  };
  const canonN = normalizeName(unit.name);

  // Wikidata labels and aliases in the chosen languages (+ local language from sitelinks).
  if (unit.qid) {
    const e = await wdEntity(unit.qid);
    if (e) {
      const langs = new Set<string>(QA_CONFIG.aliases.languages);
      if (QA_CONFIG.aliases.includeLocalLanguage) for (const site of Object.keys(e.sitelinks)) if (site.endsWith("wiki") && site.length <= 7) langs.add(site.replace(/wiki$/, ""));
      for (const l of langs) {
        if (e.labels[l]) add(e.labels[l], l, "wikidata_label");
        for (const a of e.aliases[l] ?? []) add(a, l, "wikidata_alias");
      }
      if (e.sitelinks.enwiki) {
        add(e.sitelinks.enwiki, "en", "wp_title");
        for (const r of (await wpRedirectsTo("en", e.sitelinks.enwiki)).slice(0, 40)) add(r, "en", "wp_redirect");
      }
    }
  }
  // Form variants of the canonical name.
  const base = stripThe(unit.name);
  if (base !== unit.name) add(base, "en", "form_variant");
  const words = base.split(/\s+/);
  if (words.length >= 2 && TYPE_WORDS.has(words[words.length - 1].toLowerCase())) add(words.slice(0, -1).join(" "), "en", "form_variant");
  if (unit.city) add(`${base}, ${unit.city}`, "en", "form_variant");
  // Names already in our database.
  for (const n of unit.names) if (n !== canonN) add(n, null, "db_key");
  for (const li of unit.listItems) { if (li.item.name) add(li.item.name, li.language, "db_list"); if (li.item.name_en) add(li.item.name_en, "en", "db_list"); }
  for (const c of unit.classifications) if (c.query_normalized !== canonN) add(c.query_normalized, null, "db_classification");
  // What users typed and the resolver mapped to this place.
  const logs = await selectAll<{ input: string; source_lang: string | null; resolved_to: string | null; resolved_by: string }>(
    "name_resolution_logs",
    `select=input,source_lang,resolved_to,resolved_by&resolved_to=${inList([unit.name, ...(unit.wiki.enTitle ? [unit.wiki.enTitle] : [])])}`,
  );
  for (const l of logs) add(l.input, l.source_lang, "user_log");

  out.delete(canonN);
  return [...out.values()];
}

/** Non-AI filters, then homonym detection through Wikidata, then the AI judge. */
export async function judgeAliases(unit: Unit, cands: AliasRecord[]): Promise<{ aliases: AliasRecord[]; costUsd: number; calls: number }> {
  let costUsd = 0, calls = 0;
  const cityN = normalizeName(unit.city);
  for (const a of cands) {
    if (a.aliasNormalized.length < QA_CONFIG.aliases.minLength) { a.reason = "too short"; continue; }
    if (a.aliasNormalized === cityN) { a.reason = "equals city"; continue; }
    if (GENERIC.has(a.aliasNormalized) || properWords(a.alias).length === 0) { a.ambiguous = true; a.reason = "generic type words only"; }
  }
  // Homonyms: does another real place carry this label/alias? One SPARQL for all English-script candidates.
  const latin = cands.filter((a) => !a.reason && /^[a-z0-9 ,.'-]+$/i.test(a.alias));
  if (latin.length && unit.qid) {
    const values = latin.map((a) => `"${a.alias.replace(/"/g, '\\"')}"@en`).join(" ");
    const rows = await sparql<{ name: string; item: string }>(
      `SELECT ?name ?item WHERE { VALUES ?name { ${values} } ?item rdfs:label|skos:altLabel ?name . ?item wdt:P625 ?c . FILTER(?item != wd:${unit.qid}) } LIMIT 500`,
    );
    const taken = new Set(rows.map((r) => normalizeName(r.name)));
    for (const a of latin) if (taken.has(a.aliasNormalized)) { a.ambiguous = true; a.reason = (a.reason ? a.reason + "; " : "") + "also names another place"; }
  }
  // AI judge: same item? not a part/parent/other place? Haiku first, Sonnet on reject/unsure.
  const toJudge = cands.filter((a) => !a.reason || a.ambiguous);
  if (toJudge.length) {
    const system = "You judge whether each candidate name refers to EXACTLY the same place as the reference (same Wikidata item): not a part of it, not its parent complex or city, not a namesake elsewhere. Answer strictly in JSON.";
    const user = JSON.stringify({ reference: { qid: unit.qid, name: unit.name, city: unit.city, description: unit.wiki.description, enTitle: unit.wiki.enTitle }, candidates: toJudge.map((a) => ({ alias: a.alias, language: a.language, source: a.source })) });
    const schema = { type: "object", properties: { verdicts: { type: "array", items: { type: "object", properties: { alias: { type: "string" }, same_place: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } }, required: ["alias", "same_place", "confidence"] } } }, required: ["verdicts"] };
    const judge = async (model: string) => { const r = await runClaude({ system, user, model, jsonSchema: schema, maxBudgetUsd: QA_CONFIG.maxBudgetPerCallUsd, noCache: true, timeoutMs: 120_000 }); costUsd += r.costUsd; calls++; return (r.structured as any)?.verdicts ?? []; };
    const first: any[] = await judge(QA_CONFIG.aliases.judgeModel);
    const byAlias = new Map(first.map((v) => [normalizeName(v.alias), v]));
    const unsure = toJudge.filter((a) => { const v = byAlias.get(a.aliasNormalized); return !v || !v.same_place || v.confidence < 0.8; });
    if (unsure.length) {
      const second: any[] = await judge(QA_CONFIG.aliases.judgeSecondOpinion);
      for (const v of second) byAlias.set(normalizeName(v.alias), v);
    }
    for (const a of toJudge) {
      const v = byAlias.get(a.aliasNormalized);
      if (v?.same_place && v.confidence >= 0.8) { a.accepted = true; a.reason = a.reason ?? null; }
      else { a.accepted = false; a.reason = `judge: ${v?.reason ?? "no verdict"}`; }
    }
  }
  // Non-AI tie for anything the judge accepted that did not come from Wikidata/our DB: the alias must
  // resolve (title or redirect) to the QID's article in its language, else it stays a proposal.
  for (const a of cands.filter((c) => c.accepted && ["user_log", "ai_proposal", "form_variant"].includes(c.source) && c.language)) {
    const lang = a.language!.split("-")[0];
    const s = await wpSummary(lang, a.alias).catch(() => null);
    if (!(s?.wikibase_item === unit.qid)) {
      // Form variants of our own canonical name are inherently tied; others need the check.
      if (a.source !== "form_variant") { a.accepted = false; a.reason = `not tied to ${unit.qid} on ${lang}.wikipedia`; }
    }
  }
  return { aliases: cands, costUsd, calls };
}

/** Write accepted aliases so the app finds the place by them. Returns findings for the report. */
export async function writeAliases(unit: Unit, aliases: AliasRecord[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const accepted = aliases.filter((a) => a.accepted);
  const now = new Date().toISOString();
  const cityN = normalizeName(unit.city);

  // 1. Records.
  await db.upsert("qa_aliases", aliases.map((a) => ({ unit_key: unit.unitKey, qid: unit.qid, alias: a.alias, alias_normalized: a.aliasNormalized, language: a.language, source: a.source, accepted: a.accepted, ambiguous: a.ambiguous, reason: a.reason })), "unit_key,alias_normalized");
  if (unit.qid) await db.insertIgnore("target_guide_aliases", accepted.map((a) => ({ qid: unit.qid, alias: a.alias, alias_normalized: a.aliasNormalized })), "qid,alias_normalized");

  // 2. Search: cached_classifications, insert-only; a row pointing elsewhere is a collision → REVIEW.
  const existing = await db.select<{ query_normalized: string; name: string; city: string | null }>("cached_classifications", `select=query_normalized,name,city&query_normalized=${inList(accepted.map((a) => a.aliasNormalized))}`);
  const existingMap = new Map(existing.map((e) => [e.query_normalized, e]));
  const clsRows = [];
  for (const a of accepted) {
    const e = existingMap.get(a.aliasNormalized);
    if (e) {
      if (normalizeName(e.name) !== normalizeName(unit.name)) findings.push({ check: "aliases", severity: "soft", detail: `classification collision: "${a.alias}" → ${e.name} (${e.city ?? ""}), not ${unit.name}`, applied: false });
      continue;
    }
    if (a.ambiguous) continue; // ambiguous names are never routed bare
    clsRows.push({ query_normalized: a.aliasNormalized, kind: "attraction", name: unit.name, city: unit.city || null, country: unit.country, slug: slugify(unit.name), updated_at: now });
  }
  await db.insertIgnore("cached_classifications", clsRows, "query_normalized");

  // 3. Guide alias keys: EN payload under (alias, city) always, (alias, '') only if unambiguous.
  //    Never overwrite a row with a different payload (duplicate guide → finding).
  const latinAccepted = accepted.filter((a) => /^[a-z0-9 ,.'-]+$/.test(a.aliasNormalized));
  const keyRows = [];
  for (const a of latinAccepted) {
    if (cityN) keyRows.push({ name_normalized: a.aliasNormalized, city_normalized: cityN });
    if (!a.ambiguous) keyRows.push({ name_normalized: a.aliasNormalized, city_normalized: "" });
  }
  if (keyRows.length) {
    const have = await db.select<{ name_normalized: string; city_normalized: string; payload: unknown }>("cached_guides", `select=name_normalized,city_normalized,payload&language=eq.en&interest=eq.editors&name_normalized=${inList([...new Set(keyRows.map((k) => k.name_normalized))])}`);
    const haveSet = new Set(have.map((h) => `${h.name_normalized}|${h.city_normalized}`));
    for (const h of have) if (JSON.stringify(h.payload) !== JSON.stringify(unit.enPayload)) findings.push({ check: "aliases", severity: "hard", detail: `duplicate guide under alias key ${h.name_normalized}|${h.city_normalized}: different payload — audit both, keep the better one (ALIASES §2)`, applied: false });
    const fresh = keyRows.filter((k) => !haveSet.has(`${k.name_normalized}|${k.city_normalized}`)).map((k) => ({ ...k, language: normalizeLang("en"), interest: "editors", payload: unit.enPayload, updated_at: now }));
    await db.insertIgnore("cached_guides", fresh, "name_normalized,city_normalized,language,interest");
    findings.push({ check: "aliases", severity: "info", detail: `aliases: ${accepted.length} accepted (${aliases.length - accepted.length} rejected); ${clsRows.length} classification rows, ${fresh.length} guide alias keys written`, applied: !DRY_RUN });
  }
  // 4. Photo alias keys are written by checks/photos.ts (it owns the final slide list).
  return findings;
}

export async function runAliases(unit: Unit): Promise<CheckResult> {
  const cands = await collectAliases(unit);
  const { aliases, costUsd, calls } = await judgeAliases(unit, cands);
  unit.aliases = aliases;
  const findings = await writeAliases(unit, aliases);
  const dups = (unit as Unit & { duplicates?: unknown[] }).duplicates ?? [];
  if (dups.length) findings.push({ check: "aliases", severity: "hard", detail: `${dups.length} EN editors row(s) under this unit's names carry a different payload (duplicate guide)`, applied: false });
  return { findings, costUsd, calls };
}
