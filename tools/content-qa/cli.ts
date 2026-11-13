/**
 * cli.ts — the commands the sub-agents call (see agents/ORCHESTRATION.md).
 *
 *   npx tsx tools/content-qa/cli.ts unit <unit_key>                 → scratch/<unit_key>/unit.json
 *   npx tsx tools/content-qa/cli.ts aliases <unit_key>              → aliases.json (writes qa_aliases, classifications, keys)
 *   npx tsx tools/content-qa/cli.ts photos <unit_key> [--write] [--overrides f.json] → photos.json
 *   npx tsx tools/content-qa/cli.ts evidence <unit_key>             → evidence.json (factory evidence.ts)
 *   npx tsx tools/content-qa/cli.ts factcheck <unit_key>            → factcheck.json (factory gate3)
 *   npx tsx tools/content-qa/cli.ts style <unit_key>                → style.json (metrics only)
 *   npx tsx tools/content-qa/cli.ts gate1 <payload.json> [name]     → gate1 result
 *   npx tsx tools/content-qa/cli.ts coords <unit_key> | hours <unit_key>   → TODO (checks/index.ts stubs)
 *
 * Output files land in $QA_SCRATCH (default ./.qa-scratch/<unit_key>/) and are also printed as JSON.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gate1Guide } from "../content-factory/gate1";
import { getEvidence } from "../content-factory/evidence";
import { factCheck } from "../content-factory/gate3";
import { db } from "./db";
import { buildUnit, type Seed } from "./unit";
import { runAliases } from "./aliases";
import { runPhotos } from "./checks/photos";
import { QA_CONFIG } from "./config";
import type { Unit } from "./types";

const [cmd, key, ...rest] = process.argv.slice(2);
const flag = (f: string) => rest.includes(f);
const opt = (f: string) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
const scratch = join(process.env.QA_SCRATCH ?? ".qa-scratch", (key ?? "x").replace(/[^a-z0-9|_-]/gi, "_"));
mkdirSync(scratch, { recursive: true });
const out = (name: string, data: unknown) => { writeFileSync(join(scratch, name), JSON.stringify(data, null, 1)); console.log(JSON.stringify({ file: join(scratch, name), ...(typeof data === "object" && data ? { summary: summarize(data) } : {}) })); };
const summarize = (d: any) => (Array.isArray(d) ? { items: d.length } : Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v !== "object" || v === null).slice(0, 12)));

async function loadUnit(): Promise<Unit> {
  const cached = join(scratch, "unit.json");
  try { return JSON.parse(readFileSync(cached, "utf8")); } catch { /* build */ }
  const seed = (await db.select<Seed>("qa_units", `select=unit_key,qid,name,city,country,source,priority,hits&unit_key=eq.${encodeURIComponent(key)}`))[0];
  if (!seed) throw new Error(`qa_units has no ${key} — run run.ts seed`);
  const u = await buildUnit(seed);
  writeFileSync(cached, JSON.stringify(u));
  return u;
}

// Sentence metrics (section C) — pure code, no model.
export function styleMetrics(script: string) {
  const paragraphs = script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sentences = script.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const lens = sentences.map(words).sort((a, b) => a - b);
  const syll = (w: string) => Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) ?? []).length);
  const totalWords = lens.reduce((a, b) => a + b, 0);
  const totalSyll = script.split(/\s+/).filter(Boolean).reduce((a, w) => a + syll(w), 0);
  const flesch = 206.835 - 1.015 * (totalWords / Math.max(sentences.length, 1)) - 84.6 * (totalSyll / Math.max(totalWords, 1));
  const banned = ["must-see", "iconic", "hidden gem", "world-famous", "breathtaking", "nestled", "boasts", "vibrant", "stunning", "whispers", "breathes", "embodies"].filter((b) => script.toLowerCase().includes(b));
  return {
    words: totalWords, paragraphs: paragraphs.length, sentences: sentences.length,
    medianSentence: lens[Math.floor(lens.length / 2)] ?? 0,
    over30: sentences.filter((s) => words(s) > QA_CONFIG.style.maxSentenceWords).map((s) => s.slice(0, 120)),
    shareOver22: sentences.filter((s) => words(s) > QA_CONFIG.style.longSentenceWords).length / Math.max(sentences.length, 1),
    commasPerSentence: (script.match(/,/g) ?? []).length / Math.max(sentences.length, 1),
    flesch: Math.round(flesch), banned,
    paragraphWords: paragraphs.map(words),
    nameRepeats: paragraphs.slice(1).map((p) => (p.match(/\b[A-Z][a-z]+\b/g) ?? []).length),
  };
}

const unitFromArgs = async () => loadUnit();

switch (cmd) {
  case "unit": out("unit.json", await unitFromArgs()); break;
  case "aliases": { const u = await unitFromArgs(); const r = await runAliases(u); writeFileSync(join(scratch, "unit.json"), JSON.stringify(u)); out("aliases.json", { accepted: u.aliases.filter((a) => a.accepted), rejected: u.aliases.filter((a) => !a.accepted), findings: r.findings, costUsd: r.costUsd }); break; }
  case "photos": {
    const u = await unitFromArgs();
    const overrides = opt("--overrides") ? JSON.parse(readFileSync(opt("--overrides")!, "utf8")) : null;
    if (overrides) (u as any).photoOverrides = overrides; // honoured by checks/photos.ts when present (TODO wire)
    const r = await runPhotos(u, { sas: process.env.AZURE_SAS ?? null, write: flag("--write") });
    out("photos.json", { slides: r.audit.slides.map((s) => ({ ...s, info: s.info ? { file: s.info.file, width: s.info.width, height: s.info.height, date: s.info.date, author: s.info.author, licence: s.info.licence, categories: s.info.categories.slice(0, 8) } : undefined })), findings: r.findings, written: r.audit.written, shortage: r.audit.shortage, costUsd: r.costUsd });
    break;
  }
  case "evidence": { const u = await unitFromArgs(); if (!u.qid) throw new Error("no QID"); out("evidence.json", await getEvidence(u.qid, u.wiki.enTitle ?? u.name)); break; }
  case "factcheck": { const u = await unitFromArgs(); if (!u.qid) throw new Error("no QID"); const ev = await getEvidence(u.qid, u.wiki.enTitle ?? u.name); if (!ev) throw new Error("no evidence"); out("factcheck.json", await factCheck(u.name, u.city, u.enPayload, ev)); break; }
  case "style": { const u = await unitFromArgs(); out("style.json", styleMetrics(u.enPayload.script)); break; }
  case "gate1": { const payload = JSON.parse(readFileSync(key, "utf8")); console.log(JSON.stringify(gate1Guide(payload, rest[0] ?? payload.title ?? ""), null, 1)); break; }
  case "coords": case "hours": console.log(JSON.stringify({ todo: `${cmd}: implement checks/${cmd}.ts per prompt section ${cmd === "coords" ? "G" : "F"}; see checks/index.ts` })); break;
  default: console.log("commands: unit | aliases | photos [--write] [--overrides f] | evidence | factcheck | style | gate1 <payload.json> [name] | coords | hours");
}
