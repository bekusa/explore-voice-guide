/**
 * Content factory runner.
 *
 *   # real run: claims jobs from content_jobs, publishes into cached_*
 *   npx tsx tools/content-factory/run.ts --lane cloud --kind guide --limit 20 --minutes 100
 *   npx tsx tools/content-factory/run.ts --lane cloud --kind attractions --limit 10
 *
 *   # dry run on the local worklist: no database reads or writes of jobs/cache
 *   CF_DRY_RUN=1 npx tsx tools/content-factory/run.ts --local worklist.json --kind guide --limit 5 [--offset 0]
 *
 * Per guide:   evidence → generate (app prompt) → Gate 1 → Gate 2 → Gate 3
 *              → re-roll up to CONFIG.maxRerolls → repair if still flagged
 *              → publish (or mark for review).
 * Per city:    generate (app prompt) → Gate 1 → Gate 2 (drop wrong-place items)
 *              → re-roll if too few remain → publish.
 */
process.env.EXTERNAL_SUPABASE_URL ??= "https://dwyajguhgyjbgkpzjaln.supabase.co";
process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ??= "proxy"; // network-secret setup: the proxy supplies the real key

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { CONFIG } from "./config";
import { db, DRY_RUN } from "./db";
import { EvidenceUnavailable, getEvidence, type Evidence } from "./evidence";
import { generateAttractions, generateGuide, trimChips, type AttractionItem, type GuidePayload } from "./generate";
import { gate1Attractions, gate1Guide } from "./gate1";
import { gate2Attractions, gate2Guide } from "./gate2";
import { factCheck, summarize, type Claim } from "./gate3";
import { publishAttractions, publishGuide } from "./publish";
import { repairGuide } from "./repair";
import { latestLimits, type UsageLimits } from "./transport";

type Job = {
  id: number;
  kind: "guide" | "attractions";
  target_qid: string;
  rank: number;
  name: string;
  city: string;
  country?: string;
  homonym: boolean;
  meta: Record<string, any>;
  attempts?: number;
  cost_usd?: number;
};

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const lane = arg("lane", "cloud")!;
const kind = (arg("kind", "guide") as Job["kind"]);
const limit = Number(arg("limit", "10"));
const minutes = Number(arg("minutes", "100"));
const local = arg("local");
const offset = Number(arg("offset", "0"));
const concurrency = Number(arg("concurrency", String(CONFIG.concurrency)));
// CF_WORKER names the session that runs this (two cloud sessions both report hostname "vm").
const worker = `${process.env.CF_WORKER ?? hostname()}-${process.pid}`;
const deadline = Date.now() + minutes * 60_000;
const outDir = process.env.CF_OUT ?? "cf-out";
mkdirSync(outDir, { recursive: true });

if (local && !DRY_RUN) throw new Error("--local only runs with CF_DRY_RUN=1");

let stopReason = "";
const results: Record<string, number> = {};
const bump = (k: string) => (results[k] = (results[k] ?? 0) + 1);

async function audit(job: Job, attempt: number, stage: string, row: Record<string, unknown>) {
  if (DRY_RUN) {
    appendFileSync(join(outDir, "audit.jsonl"), JSON.stringify({ job: job.name, attempt, stage, ...row }) + "\n");
    return;
  }
  await db.insert("content_audit", [{ job_id: job.id, attempt, stage, ...row }]).catch((e) => console.warn("audit write failed", e.message));
}

/** Close a job. `cost` is this run's spend on it; earlier runs' spend (a job
 *  released after a crash and claimed again) is kept and added to. */
async function finish(job: Job, status: string, cost: number, patch: Record<string, unknown> = {}) {
  bump(status);
  console.log(`  ${status.padEnd(9)} $${cost.toFixed(3)}  ${job.kind} #${job.rank} ${job.name}${patch.last_error ? `  — ${patch.last_error}` : ""}`);
  if (DRY_RUN) return;
  await db.update("content_jobs", `id=eq.${job.id}`, {
    status, updated_at: new Date().toISOString(), cost_usd: (Number(job.cost_usd) || 0) + cost, ...patch,
  });
}

/** Usage limit hit mid-job: give the job back to the queue, keep the spend. */
async function requeue(job: Job, cost: number) {
  bump("requeued");
  console.log(`  requeued  ${job.kind} #${job.rank} ${job.name}`);
  if (DRY_RUN) return;
  await db.update("content_jobs", `id=eq.${job.id}`, { status: "queued", claimed_by: null, cost_usd: (Number(job.cost_usd) || 0) + cost });
}

function stopOn(errorKind?: string) {
  if (errorKind === "usage_limit" || errorKind === "auth") stopReason = `stopped: ${errorKind}`;
}

/** Short-lived API pushback (429 / overloaded): not the job's fault, so the job goes back
 *  to the queue untouched and the whole runner pauses for a couple of minutes. */
let pauseUntil = 0;
const isTransient = (k?: string) => k === "rate_limit" || k === "overloaded";
function pauseFor(ms: number) {
  pauseUntil = Math.max(pauseUntil, Date.now() + ms);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (x?: number) => (x == null ? "?" : `${Math.round(x * 100)}%`);
const at = (t?: number) => (t ? new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ") + " UTC" : "?");
const limitsFile = () => join(outDir, "..", "usage-limits.json");
function limitsLine(L: UsageLimits | null) {
  return L ? `5h ${pct(L.fiveHour?.utilization)} · 7d ${pct(L.sevenDay?.utilization)}` : "5h ? · 7d ?";
}
/** Decide what the plan's usage windows allow next: "go", "stop" (weekly cap) or a wait. */
async function respectUsage(L: UsageLimits | null): Promise<void> {
  if (!L) return;
  try {
    writeFileSync(limitsFile(), JSON.stringify({ seen_at: new Date().toISOString(), ...L }));
  } catch {
    /* best effort */
  }
  const now = Date.now() / 1000;
  if (L.sevenDay && L.sevenDay.resetsAt > now && L.sevenDay.utilization >= CONFIG.usage.maxWeekly) {
    stopReason = `weekly usage cap: ${pct(L.sevenDay.utilization)} ≥ ${pct(CONFIG.usage.maxWeekly)} (resets ${at(L.sevenDay.resetsAt)})`;
    return;
  }
  if (L.fiveHour && L.fiveHour.resetsAt > now && L.fiveHour.utilization >= CONFIG.usage.maxFiveHour) {
    const wakeMs = L.fiveHour.resetsAt * 1000 + 90_000;
    if (wakeMs > deadline) {
      stopReason = `5-hour window at ${pct(L.fiveHour.utilization)} (resets ${at(L.fiveHour.resetsAt)})`;
      return;
    }
    console.log(`  waiting   5-hour window at ${pct(L.fiveHour.utilization)} — sleeping until ${at(L.fiveHour.resetsAt)}`);
    await sleep(wakeMs - Date.now());
  }
}

const problemsOf = (fc: ReturnType<typeof summarize>): Claim[] => [...fc.contradicted, ...fc.legend_as_fact, ...fc.price_or_hours];

async function processGuide(job: Job) {
  let cost = 0;
  let ev: Evidence | null = null;
  if (CONFIG.factCheck) {
    try {
      ev = await getEvidence(job.target_qid, job.meta.en_title ?? job.name);
    } catch (e) {
      // Evidence temporarily unavailable (rate limit): retry this job later instead of publishing it unchecked.
      if (e instanceof EvidenceUnavailable) return requeue(job, 0);
      ev = null;
    }
  }
  type Cand = { payload: GuidePayload; g1: ReturnType<typeof gate1Guide>; g2: ReturnType<typeof gate2Guide>; fc: ReturnType<typeof summarize> | null; attempt: number };
  const cands: Cand[] = [];
  for (let attempt = 1; attempt <= 1 + CONFIG.maxRerolls; attempt++) {
    const gen = await generateGuide({ name: job.name, city: job.city || undefined, interest: CONFIG.interest });
    cost += gen.call.costUsd;
    if (!gen.call.ok) {
      stopOn(gen.call.errorKind);
      await audit(job, attempt, "generate", { verdict: "error", model: gen.call.model, cost_usd: gen.call.costUsd, duration_ms: gen.call.durationMs, findings: { error: gen.call.error, kind: gen.call.errorKind } });
      if (isTransient(gen.call.errorKind)) {
        pauseFor(120_000);
        if (cands.length === 0) return requeue(job, cost);
        break;
      }
      if (stopReason) break;
      continue;
    }
    if (!gen.payload) {
      await audit(job, attempt, "generate", { verdict: "reroll", model: gen.call.model, cost_usd: gen.call.costUsd, duration_ms: gen.call.durationMs, findings: { error: "unparseable_or_empty" }, raw_output: gen.call.text.slice(0, 20000) });
      continue;
    }
    const chips = trimChips(gen.payload);
    if (chips.trimmed) gen.payload = chips.payload;
    const g1 = gate1Guide(gen.payload, job.name);
    if (chips.trimmed) g1.soft.push("chips_trimmed_to_5");
    const g2 = gate2Guide(gen.payload, ev);
    let fc: ReturnType<typeof summarize> | null = null;
    let checkFailed = false;
    if (g1.hard.length === 0 && ev?.text) {
      let r = await factCheck(job.name, job.city, gen.payload, ev);
      cost += r.costUsd;
      if (!r.ok) {
        console.warn(`  fact-check failed for ${job.name}: ${r.error?.slice(0, 200)} — retrying once`);
        r = await factCheck(job.name, job.city, gen.payload, ev);
        cost += r.costUsd;
      }
      fc = r.ok ? summarize(r) : null;
      checkFailed = !r.ok;
    }
    // No evidence at all (no article): the guide can only be checked by Gates 1-2, like the app's own output.
    const clean = g1.hard.length === 0 && !checkFailed && (!fc || problemsOf(fc).length === 0);
    await audit(job, attempt, "generate", {
      verdict: clean ? "pass" : g1.hard.length ? "reroll" : "flagged",
      model: gen.call.model, cost_usd: gen.call.costUsd, duration_ms: gen.call.durationMs,
      findings: { gate1: g1, gate2: { soft: g2.soft, metrics: g2.metrics }, gate3: fc, gate3_failed: checkFailed, evidence: !!ev?.text }, payload: gen.payload,
    });
    if (g1.hard.length) console.log(`  reroll    ${job.name} attempt ${attempt}: ${g1.hard.join(";")}`);
    else if (fc && problemsOf(fc).length) console.log(`  flagged   ${job.name} attempt ${attempt}: ${problemsOf(fc).map((p) => `${p.verdict}: ${p.text}`).join(" | ").slice(0, 300)}`);
    if (g1.hard.length === 0 && !checkFailed) cands.push({ payload: gen.payload, g1, g2, fc, attempt });
    if (clean) break;
    // Gate 1 passed and the fact-check ran: stop here — fact problems go to REPAIR.
    if (g1.hard.length === 0 && !checkFailed) break;
  }
  if (stopReason && cands.length === 0) return requeue(job, cost);
  if (cands.length === 0) return finish(job, "review", cost, { last_error: "no candidate passed gate 1 / fact-check" });

  // Best candidate: fewest problems, then closest to the length target.
  cands.sort((a, b) => (a.fc ? problemsOf(a.fc).length : 0) - (b.fc ? problemsOf(b.fc).length : 0) || a.g1.soft.length - b.g1.soft.length);
  let best = cands[0];
  let edited = false;
  const problems = best.fc ? problemsOf(best.fc) : [];
  if (problems.length && ev) {
    const rep = await repairGuide(job.name, best.payload, problems, ev);
    cost += rep.costUsd;
    let ok = false;
    if (rep.payload) {
      const g1 = gate1Guide(rep.payload, job.name);
      const r = g1.hard.length === 0 ? await factCheck(job.name, job.city, rep.payload, ev) : null;
      if (r) cost += r.costUsd;
      const fc = r?.ok ? summarize(r) : null;
      ok = g1.hard.length === 0 && !!fc && problemsOf(fc).length === 0;
      await audit(job, best.attempt, "repair", { verdict: ok ? "pass" : "review", model: CONFIG.repairModel, cost_usd: rep.costUsd, findings: { problems, gate1: g1, gate3: fc }, payload: rep.payload, edited: true });
      if (ok) { best = { ...best, payload: rep.payload, g1, fc }; edited = true; }
    } else {
      await audit(job, best.attempt, "repair", { verdict: "error", model: CONFIG.repairModel, cost_usd: rep.costUsd, raw_output: (rep.raw ?? "").slice(0, 20000) });
    }
    if (!ok) return finish(job, "review", cost, { last_error: `unresolved: ${problems.map((p) => p.verdict).join(",")}` });
  }

  const target = {
    name: job.name,
    keyNames: job.meta.keyNames ?? [job.name],
    city: job.city,
    cityAliases: job.meta.cityAliases ?? [],
    country: job.country,
    bucketlessNames: job.homonym ? [] : (job.meta.bucketlessNames ?? []),
  };
  edited = edited || best.g1.soft.includes("chips_trimmed_to_5");
  writeFileSync(join(outDir, `guide-${job.target_qid}.json`), JSON.stringify({ job, edited, payload: best.payload, gate1: best.g1, gate3: best.fc }, null, 1));
  const pub = await publishGuide(target, best.payload, CONFIG.interest);
  await audit(job, best.attempt, "publish", { verdict: "published", edited, findings: pub, payload: best.payload });
  return finish(job, "published", cost, { published_keys: pub.written });
}

async function processCity(job: Job) {
  let cost = 0;
  const center = Number.isFinite(job.meta.lat) && Number.isFinite(job.meta.lng) ? { lat: job.meta.lat, lng: job.meta.lng } : null;
  for (let attempt = 1; attempt <= 1 + CONFIG.maxRerolls; attempt++) {
    const gen = await generateAttractions({ query: job.name });
    cost += gen.call.costUsd;
    if (!gen.call.ok) {
      stopOn(gen.call.errorKind);
      await audit(job, attempt, "generate", { verdict: "error", model: gen.call.model, cost_usd: gen.call.costUsd, findings: { error: gen.call.error, kind: gen.call.errorKind } });
      if (isTransient(gen.call.errorKind)) {
        pauseFor(120_000);
        return requeue(job, cost);
      }
      if (stopReason) break;
      continue;
    }
    const list = gen.payload?.attractions ?? [];
    const g1 = gate1Attractions(list);
    // The model sometimes declines a city in prose (Damascus, first try at Pyongyang).
    // The app shows nothing in that case; give it one more try, then skip.
    const declined = !gen.payload && !/[{[]/.test(gen.call.text.slice(0, 200));
    if (declined && attempt >= 2) {
      await audit(job, attempt, "generate", { verdict: "skipped", model: gen.call.model, cost_usd: gen.call.costUsd, findings: { declined: true }, raw_output: gen.call.text.slice(0, 20000) });
      return finish(job, "skipped", cost, { last_error: "model declined to list this city (app would show an empty list too)" });
    }
    if (!gen.payload || g1.hard.length) {
      await audit(job, attempt, "generate", { verdict: "reroll", model: gen.call.model, cost_usd: gen.call.costUsd, findings: { gate1: g1 }, payload: gen.payload, raw_output: gen.payload ? null : gen.call.text.slice(0, 20000) });
      continue;
    }
    const g2 = await gate2Attractions(list, center, job.name);
    const edited = g2.dropped.length > 0 || g2.fixedCoords.length > 0;
    await audit(job, attempt, "generate", { verdict: g2.hard.length ? "reroll" : "pass", model: gen.call.model, cost_usd: gen.call.costUsd, findings: { gate1: g1, gate2: { soft: g2.soft, dropped: g2.dropped } }, payload: gen.payload, edited });
    if (g2.hard.length) continue;
    const kept: AttractionItem[] = g2.kept;
    writeFileSync(join(outDir, `city-${job.target_qid}.json`), JSON.stringify({ job, edited, list: kept, gate1: g1, gate2: g2 }, null, 1));
    const pub = await publishAttractions(job.meta.queries ?? [job.name], kept);
    await audit(job, attempt, "publish", { verdict: "published", edited, findings: pub });
    return finish(job, "published", cost, { published_keys: pub.written });
  }
  if (stopReason) return requeue(job, cost);
  return finish(job, "review", cost, { last_error: "no list passed the gates" });
}

async function laneSpent(): Promise<number> {
  if (DRY_RUN) return 0;
  // Sum from the aggregate view: PostgREST returns at most 1,000 rows, so summing
  // content_jobs rows client-side stopped counting after the 1,000th job.
  const rows = await db.select<{ cost_usd: number | null }>("content_factory_progress", `select=cost_usd&lane=eq.${lane}&kind=eq.${kind}`);
  return rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
}

async function claim(n: number): Promise<Job[]> {
  if (local) {
    const w = JSON.parse(readFileSync(local, "utf8"));
    const list = (kind === "guide" ? w.guideJobs : w.cityJobs) as Job[];
    return list.slice(offset, offset + n).map((j, i) => ({ ...j, id: -(i + 1) }));
  }
  return db.rpc<Job[]>("factory_claim_jobs", { p_kind: kind, p_lane: lane, p_worker: worker, p_limit: n });
}

async function main() {
  if (!DRY_RUN) await db.rpc("factory_release_stale", { p_minutes: 120 }).catch(() => null);
  const budget = CONFIG.budgetUsd[`${lane}:${kind}`] ?? 0;
  const spentBefore = await laneSpent();
  if (!local && spentBefore >= budget) {
    console.log(`lane ${lane} budget reached: $${spentBefore.toFixed(2)} of $${budget}`);
    return;
  }
  // Preflight: the other runner (or the previous block) may already have seen a full window.
  if (!local) {
    try {
      const prev = JSON.parse(readFileSync(limitsFile(), "utf8")) as UsageLimits;
      await respectUsage(prev);
      if (stopReason) {
        console.log(`finished: ${stopReason}`);
        return;
      }
    } catch {
      /* no file yet */
    }
  }
  let done = 0;
  while (done < limit && !stopReason && Date.now() < deadline) {
    if (pauseUntil > Date.now()) {
      console.log(`  pausing   ${Math.round((pauseUntil - Date.now()) / 1000)}s after API pushback`);
      await sleep(pauseUntil - Date.now());
    }
    const batch = await claim(Math.min(concurrency, limit - done));
    if (!batch.length) { stopReason = "queue empty"; break; }
    const before = Date.now();
    await Promise.all(
      batch.map(async (job) => {
        try {
          if (job.kind === "guide") await processGuide(job);
          else await processCity(job);
        } catch (e: any) {
          console.warn(`job ${job.id} ${job.name} failed:`, e?.message);
          await finish(job, "failed", 0, { last_error: String(e?.message ?? e).slice(0, 500) }).catch(() => null);
        }
      }),
    );
    done += batch.length;
    const spent = local ? 0 : await laneSpent();
    console.log(`[${new Date().toISOString()}] ${done}/${limit} done · ${Math.round((Date.now() - before) / 1000)}s batch · lane $${spent.toFixed(2)}/${budget} · ${limitsLine(latestLimits())} · ${JSON.stringify(results)}`);
    if (!local && spent >= budget) stopReason = "lane budget reached";
    if (!stopReason && !local) await respectUsage(latestLimits());
    if (local) break;
  }
  console.log(`finished: ${stopReason || "limit reached"} · ${JSON.stringify(results)}`);
}

await main();
