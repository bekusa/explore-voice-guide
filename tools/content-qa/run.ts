/**
 * Content QA runner.
 *
 *   npx tsx tools/content-qa/run.ts seed                      # fill qa_units (idempotent)
 *   npx tsx tools/content-qa/run.ts measure                   # Phase 0 counts, no writes
 *   CF_DRY_RUN=1 npx tsx tools/content-qa/run.ts audit --limit 20          # Phase 1: no writes
 *   CQ_WORKER=qa-1 npx tsx tools/content-qa/run.ts audit --limit 500 --minutes 240 --wave 1
 *
 * Secrets: Supabase via network secret / EXTERNAL_SUPABASE_SERVICE_ROLE_KEY (as the factory);
 * AZURE_SAS for photo writes (optional: without it photos are audited, not written);
 * WIKIMEDIA_TOKEN (optional, raises Commons limits). Never print any of them.
 */
import { hostname } from "node:os";
import { gate1Guide } from "../content-factory/gate1";
import { normalizeGuidePayload } from "@/lib/guidePostprocess";
import { latestLimits, runClaude, type UsageLimits } from "../content-factory/transport";
import { QA_CONFIG } from "./config";
import { backupTable, db, DRY_RUN, deleteWhere, inList, payloadMd5, selectAll } from "./db";
import { buildUnit, seedUnits, type Seed } from "./unit";
import { runAliases } from "./aliases";
import { runPhotos } from "./checks/photos";
import { NEUTRAL_CHECKS, TEXT_CHECKS } from "./checks";
import { changedParts, seoAction, seoLevel, shouldDeleteTranslations, textLevel } from "./severity";
import type { Finding, GuidePayload, Unit } from "./types";

const args = process.argv.slice(2);
const cmd = args[0] ?? "audit";
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const limit = Number(arg("limit", "20"));
const minutes = Number(arg("minutes", "120"));
const wave = Number(arg("wave", "0"));
const worker = `${process.env.CQ_WORKER ?? hostname()}-${process.pid}`;
const SAS = process.env.AZURE_SAS ?? null;
const deadline = Date.now() + minutes * 60_000;
const pct = (x?: number) => (x == null ? "?" : `${Math.round(x * 100)}%`);

// ── usage gating (same as the factory) ────────────────────────────────────────
async function readLimits(): Promise<UsageLimits | null> {
  const r = await runClaude({ system: "Reply with OK.", user: "OK", model: "claude-haiku-4-5", maxBudgetUsd: 0.05, timeoutMs: 90_000 });
  return r.limits ?? latestLimits();
}
async function usageGate(): Promise<"go" | "stop" | number> {
  const L = (await readLimits()) ?? latestLimits();
  if (!L) return "go";
  const now = Date.now() / 1000;
  if (L.sevenDay && L.sevenDay.resetsAt > now && L.sevenDay.utilization >= QA_CONFIG.usage.maxWeekly) return "stop";
  if (L.fiveHour && L.fiveHour.resetsAt > now && L.fiveHour.utilization >= QA_CONFIG.usage.maxFiveHour) return Math.max(60, L.fiveHour.resetsAt - now);
  return "go";
}

// ── one unit ──────────────────────────────────────────────────────────────────
type UnitOutcome = { verdict: "PASS" | "FIXED" | "REGENERATE" | "REVIEW" | "QUARANTINE"; findings: Finding[]; costUsd: number; calls: number; textLevel: number; seoLevel: number };

/** Live stage marker for the dashboard ("ახლა მოწმდება"). Best-effort, never throws. */
const stages = ["unit", "aliases", "text", "geo+photos", "gate1+write", "severity", "handoff", "review"] as const;
async function stage(unitKey: string, name: (typeof stages)[number]) {
  if (DRY_RUN) return;
  await db.update("qa_units", `unit_key=eq.${encodeURIComponent(unitKey)}`, { summary: { stage: name, since: new Date().toISOString() }, updated_at: new Date().toISOString() }).catch(() => null);
}

async function auditUnit(seed: Seed): Promise<UnitOutcome> {
  await stage(seed.unit_key, "unit");
  const unit = await buildUnit(seed);
  const findings: Finding[] = [];
  let costUsd = 0, calls = 0;
  if (!unit.qid) findings.push({ check: "identity", severity: "hard", detail: "no Wikidata QID could be resolved → REVIEW" });

  // Aliases first: everything else looks the place up by all its names.
  await stage(seed.unit_key, "aliases");
  const al = await runAliases(unit); findings.push(...al.findings); costUsd += al.costUsd; calls += al.calls;

  // Text checks, sequential; patches accumulate.
  await stage(seed.unit_key, "text");
  let payload: GuidePayload = unit.enPayload;
  let verdictHint: UnitOutcome["verdict"] | undefined;
  for (const [, check] of TEXT_CHECKS) {
    const r = await check({ ...unit, enPayload: payload }); findings.push(...r.findings); costUsd += r.costUsd; calls += r.calls;
    if (r.patch) payload = { ...payload, ...r.patch };
    if (r.verdictHint) { verdictHint = r.verdictHint; break; }
  }
  // Language-neutral checks, independent.
  await stage(seed.unit_key, "geo+photos");
  const neutral = await Promise.all(NEUTRAL_CHECKS.map(([, c]) => c(unit)));
  for (const r of neutral) { findings.push(...r.findings); costUsd += r.costUsd; calls += r.calls; }
  const ph = await runPhotos(unit, { sas: SAS, write: !DRY_RUN && !verdictHint }); findings.push(...ph.findings); costUsd += ph.costUsd; calls += ph.calls;

  if (verdictHint === "QUARANTINE" || verdictHint === "REVIEW" || !unit.qid) return { verdict: verdictHint ?? "REVIEW", findings, costUsd, calls, textLevel: 0, seoLevel: 0 };

  // Contract still holds? Then write the payload to every key.
  await stage(seed.unit_key, "gate1+write");
  const changed = JSON.stringify(payload) !== JSON.stringify(unit.enPayload);
  if (changed) {
    const normalized = normalizeGuidePayload(payload) as GuidePayload;
    const g1 = gate1Guide(normalized, unit.name);
    if (g1.hard.length) { findings.push({ check: "consistency", severity: "hard", detail: `gate1 failed after edits: ${g1.hard.join("; ")}` }); return { verdict: "REVIEW", findings, costUsd, calls, textLevel: 0, seoLevel: 0 }; }
    if (!DRY_RUN) {
      const now = new Date().toISOString();
      await db.upsert("cached_guides", unit.enRows.map((r) => ({ name_normalized: r.name_normalized, city_normalized: r.city_normalized, language: "en", interest: "editors", payload: normalized, updated_at: now })), "name_normalized,city_normalized,language,interest");
      for (const f of findings) if (["facts", "style", "look_for", "tips", "identity", "consistency"].includes(f.check) && f.level != null) f.applied = true;
    }
    payload = normalized;
  }
  await stage(seed.unit_key, "severity");
  const tl = textLevel(findings), sl = seoLevel(findings);

  // Translations by level (Beka 2026-11-03: delete at 2 and 3).
  if (changed && !DRY_RUN && shouldDeleteTranslations(tl) && unit.translatedRows.length) {
    if (!pathCheckPassed) findings.push({ check: "consistency", severity: "hard", detail: `translation deletion held: path check not passed this wave (${unit.translatedRows.length} rows)` });
    else {
      await deleteWhere("cached_guides", `id=${inList(unit.translatedRows.map((r) => r.id))}`);
      findings.push({ check: "consistency", severity: "info", level: tl as 0 | 1 | 2 | 3, detail: `deleted ${unit.translatedRows.length} translation row(s): ${[...new Set(unit.translatedRows.map((r) => r.language))].join(",")}`, applied: true });
    }
  }
  if (unit.otherInterestRows.length && tl >= 2) findings.push({ check: "consistency", severity: "soft", detail: `${unit.otherInterestRows.length} EN row(s) with other interests repeat the old text (not deleted: regenerating is paid)` });

  // SEO handoff.
  await stage(seed.unit_key, "handoff");
  const applied = findings.some((f) => f.applied);
  const verdict: UnitOutcome["verdict"] = verdictHint ?? (applied ? "FIXED" : "PASS");
  if (applied && !DRY_RUN) {
    const parts = changedParts(findings);
    await db.insert("qa_changes", [{
      unit_key: unit.unitKey, qid: unit.qid, name: unit.name, city: unit.city, wave,
      severity: tl, seo_severity: sl, changed_parts: parts,
      en_payload_md5_before: unit.enPayloadMd5, en_payload_md5_after: payloadMd5(payload),
      coords_before: unit.coords ? { lat: unit.coords.lat, lng: unit.coords.lng } : null, coords_after: null,
      translations_action: shouldDeleteTranslations(tl) ? (pathCheckPassed ? "deleted" : "held_for_beka") : unit.translatedRows.length ? "kept" : "not_needed",
      translations_deleted: shouldDeleteTranslations(tl) && pathCheckPassed ? [...new Set(unit.translatedRows.map((r) => r.language))] : [],
      aliases: unit.aliases.filter((a) => a.accepted).map((a) => ({ alias: a.alias, language: a.language })),
      explore_pages: [], // filled by the SEO agent / page generator from public/explore (grep sameAs QID)
      maps_query: unit.city ? `${unit.name}, ${unit.city}` : unit.name,
      seo_action: seoAction(parts, verdict),
    }]);
  }
  return { verdict, findings, costUsd, calls, textLevel: tl, seoLevel: sl };
}

// ── wave bookkeeping ──────────────────────────────────────────────────────────
let pathCheckPassed = false;
async function wavePrelude() {
  if (DRY_RUN) return;
  for (const t of ["cached_guides", "cached_attractions", "cached_photos", "cached_place_details", "attraction_coords", "cached_classifications"]) console.log("backup:", await backupTable(t, "qa"));
  // Translation path check is a PAID Gemini call on one unit; it is done by hand in Phase 2 per the
  // prompt (WRITING CHANGES) and recorded here via CQ_PATH_CHECK_OK=1 once it passed.
  pathCheckPassed = process.env.CQ_PATH_CHECK_OK === "1";
  if (!pathCheckPassed) console.log("translation path check not confirmed (CQ_PATH_CHECK_OK=1) → translations are held, not deleted");
}

async function factoryIdle(): Promise<boolean> {
  const rows = await db.select<{ jobs: number }>("content_factory_progress", "select=jobs&kind=eq.guide&status=eq.queued");
  return rows.reduce((s, r) => s + Number(r.jobs), 0) === 0;
}

// ── commands ──────────────────────────────────────────────────────────────────
async function measure() {
  const q = async (table: string, filter = "") => Number((await db.select<{ count: number }>(table, `select=count${filter ? "&" + filter : ""}`))[0]?.count ?? 0);
  const out = {
    en_rows: await q("cached_guides", "language=eq.en&interest=eq.editors"),
    translated_rows: await q("cached_guides", "language=neq.en"),
    gallery_rows: await q("cached_photos", "cache_key=like.gallery*"),
    photo_misses: await q("cached_photos", "not_found=eq.true"),
    place_details: await q("cached_place_details"),
    coords_confirmed: await q("attraction_coords", "confidence=eq.confirmed_2_sources"),
    qa_units: await q("qa_units"),
    factory_queued: (await db.select<{ jobs: number }>("content_factory_progress", "select=jobs&kind=eq.guide&status=eq.queued")).reduce((s, r) => s + Number(r.jobs), 0),
    sas: SAS ? "present" : "missing",
    wikimedia_token: process.env.WIKIMEDIA_TOKEN ? "present" : "missing",
  };
  console.log(JSON.stringify(out, null, 2));
}

async function audit() {
  if (QA_CONFIG.waitForFactory && process.env.CQ_FORCE !== "1" && !(await factoryIdle())) { console.log("content factory still has queued guides; Beka 2026-11-03: run after it. Set CQ_FORCE=1 to override."); return; }
  await wavePrelude();
  if (!DRY_RUN) await db.rpc("qa_release_stale", { p_minutes: QA_CONFIG.staleClaimMinutes }).catch(() => null);
  let done = 0, stop = "";
  const tally: Record<string, number> = {};
  const patterns: Record<string, number> = {};
  while (done < limit && !stop && Date.now() < deadline) {
    if (done % QA_CONFIG.usage.checkEvery === 0) {
      const g = await usageGate();
      if (g === "stop") { stop = "weekly usage ceiling"; break; }
      if (typeof g === "number") { console.log(`5h window full, waiting ${Math.round(g / 60)} min`); await new Promise((r) => setTimeout(r, Math.min(g, 3600) * 1000)); continue; }
    }
    const batch: Seed[] = DRY_RUN
      ? (await selectAll<Seed & { status: string }>("qa_units", `select=*&status=eq.queued&order=priority.nullslast,hits.desc&limit=${Math.min(QA_CONFIG.concurrency, limit - done)}&offset=${done}`))
      : await db.rpc<Seed[]>("qa_claim_units", { p_worker: worker, p_limit: Math.min(QA_CONFIG.concurrency, limit - done) });
    if (!batch.length) { stop = "queue empty"; break; }
    const results = await Promise.allSettled(batch.map((s) => auditUnit(s)));
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i], r = results[i];
      if (r.status === "rejected") {
        tally.failed = (tally.failed ?? 0) + 1;
        if (!DRY_RUN) await db.update("qa_units", `unit_key=eq.${encodeURIComponent(s.unit_key)}`, { status: "failed", last_error: String(r.reason).slice(0, 500), updated_at: new Date().toISOString() });
        console.log(`✗ ${s.name}: ${String(r.reason).slice(0, 200)}`);
        continue;
      }
      const o = r.value;
      tally[o.verdict] = (tally[o.verdict] ?? 0) + 1;
      for (const f of o.findings.filter((x) => x.severity === "hard")) patterns[`${f.check}:${f.detail.split(":")[0]}`] = (patterns[`${f.check}:${f.detail.split(":")[0]}`] ?? 0) + 1;
      if (!DRY_RUN) {
        await db.insert("qa_findings", o.findings.map((f) => ({ unit_key: s.unit_key, check: f.check, severity: f.severity, level: f.level ?? null, detail: f.detail, before: f.before ?? null, after: f.after ?? null, evidence_url: f.evidenceUrl ?? null, quote: f.quote ?? null, model: f.model ?? null, applied: f.applied ?? false })));
        const status = o.verdict === "REVIEW" ? "review" : o.verdict === "QUARANTINE" ? "quarantine" : "done";
        await db.update("qa_units", `unit_key=eq.${encodeURIComponent(s.unit_key)}`, { status, verdict: o.verdict, text_level: o.textLevel, seo_level: o.seoLevel, wave, audited_at: status === "done" ? new Date().toISOString() : null, usage: { calls: o.calls, costUsdEstimate: o.costUsd }, updated_at: new Date().toISOString() });
      }
      console.log(`${o.verdict.padEnd(10)} L${o.textLevel}/${o.seoLevel} ${s.name} (${s.city}) · ${o.findings.length} findings · $${o.costUsd.toFixed(3)}`);
    }
    done += batch.length;
    // Rule 10: a repeated defect pattern pauses the wave.
    const top = Object.entries(patterns).sort((a, b) => b[1] - a[1])[0];
    if (top && done >= 40 && top[1] / done > QA_CONFIG.patternPauseShare) { stop = `pattern pause: ${top[0]} in ${top[1]}/${done} units — report root cause before continuing`; }
    if ((tally.failed ?? 0) / Math.max(done, 1) > QA_CONFIG.errorPauseShare && done >= 20) stop = "error rate above 5%";
    const L = latestLimits();
    console.log(`[${new Date().toISOString()}] ${done}/${limit} · 5h ${pct(L?.fiveHour?.utilization)} · 7d ${pct(L?.sevenDay?.utilization)} · ${JSON.stringify(tally)}`);
  }
  console.log(`finished: ${stop || "limit reached"} · ${JSON.stringify(tally)}`);
  if (Object.keys(patterns).length) console.log("hard-finding patterns:", JSON.stringify(Object.fromEntries(Object.entries(patterns).sort((a, b) => b[1] - a[1]).slice(0, 10))));
}

if (cmd === "seed") console.log(await seedUnits());
else if (cmd === "measure") await measure();
else if (cmd === "audit") await audit();
else console.log("commands: seed | measure | audit [--limit N --minutes M --wave W]");
