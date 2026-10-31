/**
 * Re-generate already-published guides that failed the post-publication audit
 * (wrong city anchor, text about the wrong town, under 900 words), and
 * overwrite their cache rows in place.
 *
 *   npx tsx tools/content-factory/regen.ts <plan.json> [--limit N] [--concurrency 4]
 *
 * plan.json: { "<job id>": { "reason": "...", "new_city": "Madrid", "old_city": "Leganés" }, ... }
 *
 * Same generation path as run.ts (the app's prompt, model and normaliser),
 * stricter acceptance: Gate 1 clean, at least 900 words (the prompt's hard
 * minimum), 10-15 paragraphs. Unlike publish.ts this DOES overwrite: these
 * rows were written by the factory and are being replaced on purpose.
 * A backup of every factory row exists (cached_guides_backup_20261029_audit).
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { normalizeName, normalizeLang } from "@/lib/cacheKey";
import { CONFIG } from "./config";
import { db, DRY_RUN, inList } from "./db";
import { gate1Guide } from "./gate1";
import { generateGuide, trimChips, type GuidePayload } from "./generate";

const [planPath, ...rest] = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : d;
};
const limit = Number(arg("limit", "100000"));
const concurrency = Number(arg("concurrency", "4"));
const plan: Record<string, { reason: string; new_city: string; old_city: string }> = JSON.parse(readFileSync(planPath, "utf8"));
const logPath = planPath.replace(/\.json$/, ".log.jsonl");
const doneIds = new Set<string>(
  existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.status === "published").map((x) => String(x.job)) : [],
);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const WINDOW_FROM = "2026-10-22T18:00:00Z";

type Job = { id: number; name: string; city: string; published_keys: { name_normalized: string; city_normalized: string }[]; meta: Record<string, any>; cost_usd: number };

async function one(id: string) {
  const p = plan[id];
  const [job] = await db.select<Job>("content_jobs", `select=id,name,city,published_keys,meta,cost_usd&id=eq.${id}`);
  if (!job) return { job: id, status: "missing_job" };
  const name = job.meta.en_title ?? job.name;
  const newCity = (p.new_city ?? job.city).trim();
  let best: GuidePayload | null = null;
  let cost = 0;
  let attempts = 0;
  for (attempts = 1; attempts <= 3; attempts++) {
    const gen = await generateGuide({ name, city: newCity || undefined, interest: CONFIG.interest });
    cost += gen.call.costUsd;
    if (!gen.payload) continue;
    const g = trimChips(gen.payload).payload;
    const g1 = gate1Guide(g, name);
    const paras = g.script.split(/\n\s*\n/).filter((x) => x.trim()).length;
    if (g1.hard.length === 0 && words(g.script) >= 900 && paras >= 10 && paras <= 15) {
      best = g;
      break;
    }
  }
  if (!best) return { job: id, status: "failed", cost, attempts };
  if (DRY_RUN) return { job: id, status: "dry_run", cost, words: words(best.script), city: newCity };

  const now = new Date().toISOString();
  // 1. overwrite every cache row this guide was published under
  const keys = job.published_keys ?? [];
  const names = [...new Set(keys.map((k) => k.name_normalized))];
  const rows = await db.select<{ id: string; city_normalized: string; name_normalized: string }>(
    "cached_guides",
    `select=id,name_normalized,city_normalized&language=eq.en&interest=eq.${CONFIG.interest}&name_normalized=${inList(names)}&created_at=gte.${WINDOW_FROM}`,
  );
  const wanted = new Set(keys.map((k) => `${k.name_normalized}|${k.city_normalized}`));
  const ids = rows.filter((r) => wanted.has(`${r.name_normalized}|${r.city_normalized}`)).map((r) => r.id);
  if (ids.length) await db.update("cached_guides", `id=${inList(ids)}`, { payload: best, updated_at: now });
  // stale translations of the old text
  if (names.length) {
    await fetchDelete(`cached_guides?language=neq.en&name_normalized=${inList(names)}&created_at=gte.${WINDOW_FROM}`);
  }
  // 2. the city the app will now pass: add keys (insert-if-absent)
  const cityChanged = normalizeName(newCity) !== normalizeName(job.city);
  const keyNames: string[] = job.meta.keyNames ?? [name];
  if (cityChanged && newCity) {
    const fresh = keyNames.map((n) => ({ name_normalized: normalizeName(n), city_normalized: normalizeName(newCity), language: normalizeLang("en"), interest: CONFIG.interest, payload: best, updated_at: now }));
    await db.insertIgnore("cached_guides", fresh, "name_normalized,city_normalized,language,interest");
    // 3. direct search → attraction page with the right city (only the rows the factory wrote)
    const qs = [...new Set(keyNames.map((n) => normalizeName(n)))];
    await db.update("cached_classifications", `query_normalized=${inList(qs)}&city=eq.${encodeURIComponent(job.city)}&created_at=gte.${WINDOW_FROM}`, { city: newCity, updated_at: now });
  }
  // 4. job bookkeeping + audit trail
  const allKeys = [...keys, ...(cityChanged && newCity ? keyNames.map((n) => ({ name_normalized: normalizeName(n), city_normalized: normalizeName(newCity) })) : [])];
  await db.update("content_jobs", `id=eq.${id}`, {
    city: newCity,
    cost_usd: Number(job.cost_usd || 0) + cost,
    published_keys: dedupeKeys(allKeys),
    meta: { ...job.meta, audit_2026_10_29: { reason: p.reason, city_before: job.city } },
    updated_at: now,
  });
  await db.insert("content_audit", [{ job_id: Number(id), attempt: attempts, stage: "publish", verdict: "audit_regen", model: CONFIG.guideModel, cost_usd: cost, findings: { reason: p.reason, city_before: job.city, city_after: newCity, words: words(best.script), rows_overwritten: ids.length }, payload: best, edited: true }]);
  return { job: id, status: "published", cost, attempts, words: words(best.script), rows: ids.length, city: newCity };
}

function dedupeKeys(keys: { name_normalized: string; city_normalized: string }[]) {
  const m = new Map(keys.map((k) => [`${k.name_normalized}|${k.city_normalized}`, k]));
  return [...m.values()];
}

async function fetchDelete(path: string) {
  const url = (process.env.EXTERNAL_SUPABASE_URL ?? "https://dwyajguhgyjbgkpzjaln.supabase.co").replace(/\/+$/, "");
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ?? "proxy";
  const res = await fetch(`${url}/rest/v1/${path}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" } });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

const queue = Object.keys(plan).filter((id) => !doneIds.has(id)).slice(0, limit);
console.log(`regenerating ${queue.length} guides (already done ${doneIds.size})`);
let n = 0;
let spent = 0;
async function worker() {
  while (queue.length) {
    const id = queue.shift()!;
    let r: any;
    try {
      r = await one(id);
    } catch (e: any) {
      r = { job: id, status: "error", error: String(e?.message ?? e).slice(0, 300) };
    }
    spent += r.cost ?? 0;
    appendFileSync(logPath, JSON.stringify(r) + "\n");
    console.log(`${++n} ${r.status} #${id} ${plan[id].reason} → ${r.city ?? ""} ${r.words ?? ""}w $${(r.cost ?? 0).toFixed(3)} · total $${spent.toFixed(2)}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
