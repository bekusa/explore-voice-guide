/**
 * REPAIR (allowed by Beka 2026-10-21): when re-rolls with the app prompt
 * still leave contradicted claims, a copy editor fixes ONLY the flagged
 * sentences/chips from the evidence. Everything else stays as generated.
 * The published row is then marked edited=true in content_audit.
 */
import { parseClaudeJson } from "@/lib/anthropic.server";
import { normalizeGuidePayload } from "@/lib/guidePostprocess";
import { CONFIG } from "./config";
import type { Evidence } from "./evidence";
import { hasGuideScript, type GuidePayload } from "./generate";
import type { Claim } from "./gate3";
import { runClaude } from "./transport";

const SYSTEM = `You are the copy editor for Lokali audio guides. You receive a GUIDE (JSON), a list of PROBLEMS found by a fact-checker, and the EVIDENCE they were checked against.

Fix ONLY the problems:
- CONTRADICTED: rewrite the sentence or chip so it agrees with the evidence. If the evidence gives no exact replacement, make the statement general instead ("in the late twelfth century" instead of a wrong year) or remove the clause.
- LEGEND_AS_FACT: keep the story but frame it as legend ("Legend has it...", "Locals say...").
- PRICE_OR_HOURS: remove the price, fee or opening time; keep the practical advice if it still makes sense.

Leave every other sentence, chip and paragraph break exactly as it is. Keep the same length (do not cut more than a sentence). Keep the guide's writing rules: years as digits, centuries spelled out, no markdown, no parentheses, plain prose for the ear.

Return ONLY the full corrected guide as a single JSON object with the same keys. First character {, last character }.`;

export async function repairGuide(place: string, g: GuidePayload, problems: Claim[], ev: Evidence) {
  // Deterministic part first: markdown emphasis (*il mare*) is never wanted.
  const cleaned: GuidePayload = { ...g, script: g.script.replace(/\*([^*\n]+)\*/g, "$1") };
  const user = `PLACE: ${place}\n\nPROBLEMS:\n${problems
    .map((p) => `- [${p.verdict}] (${p.field}) "${p.text}"${p.correction ? ` → evidence says: ${p.correction}` : ""}${p.evidence_quote ? ` | quote: "${p.evidence_quote}"` : ""}`)
    .join("\n")}\n\nEVIDENCE:\n<<<\n${ev.text.slice(0, CONFIG.evidenceChars)}\n>>>\n\nGUIDE:\n${JSON.stringify(cleaned, null, 1)}`;
  const r = await runClaude({ system: SYSTEM, user, model: CONFIG.repairModel, maxBudgetUsd: CONFIG.maxBudgetPerCallUsd, noCache: true });
  if (!r.ok) return { payload: null, costUsd: r.costUsd, raw: r.text, error: r.error };
  const parsed = normalizeGuidePayload(parseClaudeJson(r.text));
  return { payload: hasGuideScript(parsed) ? (parsed as GuidePayload) : null, costUsd: r.costUsd, raw: r.text };
}
