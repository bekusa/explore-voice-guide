/**
 * Gate 3 — fact-check against the evidence pack (never against the
 * checker's own memory: a memory-based checker hallucinates too).
 *
 * One `claude -p` call with --json-schema → claims with verdicts.
 * CONTRADICTED claims get a second opinion from a stronger model
 * before they count, to keep false positives from triggering re-rolls.
 */
import { CONFIG } from "./config";
import type { Evidence } from "./evidence";
import type { GuidePayload } from "./generate";
import { runClaude } from "./transport";

export type Verdict = "SUPPORTED" | "NOT_IN_EVIDENCE" | "CONTRADICTED" | "LEGEND_AS_FACT" | "PRICE_OR_HOURS";
export type Claim = { text: string; field: string; verdict: Verdict; evidence_quote: string; correction: string };
export type FactCheck = { claims: Claim[]; costUsd: number; ok: boolean; error?: string };

const SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "the claim, quoted or closely paraphrased from the guide" },
          field: { type: "string", enum: ["title", "script", "key_facts", "tips", "look_for"] },
          verdict: { type: "string", enum: ["SUPPORTED", "NOT_IN_EVIDENCE", "CONTRADICTED", "LEGEND_AS_FACT", "PRICE_OR_HOURS"] },
          evidence_quote: { type: "string", description: "verbatim evidence, max 30 words; empty for NOT_IN_EVIDENCE" },
          correction: { type: "string", description: "for CONTRADICTED: what the evidence says instead; else empty" },
        },
        required: ["text", "field", "verdict", "evidence_quote", "correction"],
      },
    },
  },
  required: ["claims"],
};

const SYSTEM = `You are a strict fact-checker for travel audio guides written for Lokali. You receive EVIDENCE about one place (English Wikipedia article text and Wikidata facts) and a GUIDE (JSON with title, script and three chip lists).

Extract every specific, checkable claim in the guide: years, dates and centuries; numbers and measurements; names of people; attributions (who built, designed, commissioned, painted); historical events and their sequence; superlatives ("largest", "oldest", "first"); and statements about the place's current status ("still used as a mosque", "the liturgy is no longer sung"). Skip pure atmosphere, sensory description and generic visitor advice.

Judge each claim using ONLY the evidence, never your own memory:
- SUPPORTED: the evidence states it or directly implies it.
- NOT_IN_EVIDENCE: the evidence does not address it either way.
- CONTRADICTED: the evidence states something incompatible (another year, person, number, place or status). Use this ONLY when you can quote the conflicting evidence. When the evidence presents a matter as debated or uncertain (scholars disagree on the date, estimates range from X to Y), a guide that states one side as plain fact is CONTRADICTED and the correction is to frame it as debated; a guide that already frames it as debated, or gives a figure inside the evidence's range ("at least 140" when estimates run from 140 upward), is SUPPORTED.
Also flag:
- LEGEND_AS_FACT: folklore or a legend stated as documented history, without framing such as "legend has it" or "locals say".
- PRICE_OR_HOURS: any price, fee, "free entry", or opening time.

Quote evidence verbatim, at most 30 words. Return one entry per claim.`;

function evidenceBlock(ev: Evidence): string {
  return `${ev.text.slice(0, CONFIG.evidenceChars)}\n\nWIKIDATA: ${JSON.stringify(ev.wikidata).slice(0, 4000)}`;
}

export async function factCheck(place: string, city: string, g: GuidePayload, ev: Evidence): Promise<FactCheck> {
  const user = `PLACE: ${place}\nCITY: ${city}\n\nEVIDENCE:\n<<<\n${evidenceBlock(ev)}\n>>>\n\nGUIDE:\n<<<\n${JSON.stringify(g, null, 1)}\n>>>`;
  const r = await runClaude({ system: SYSTEM, user, model: CONFIG.checkerModel, jsonSchema: SCHEMA, maxBudgetUsd: CONFIG.maxBudgetPerCallUsd, noCache: true });
  const claims = ((r.structured as { claims?: Claim[] } | undefined)?.claims ?? []) as Claim[];
  if (!r.ok || !Array.isArray(claims)) return { claims: [], costUsd: r.costUsd, ok: false, error: r.error ?? "no structured output" };
  let cost = r.costUsd;
  const contradicted = claims.filter((c) => c.verdict === "CONTRADICTED");
  if (contradicted.length && CONFIG.secondOpinionModel) {
    const second = await secondOpinion(place, ev, contradicted);
    cost += second.costUsd;
    for (const c of contradicted) {
      const v = second.verdicts.get(c.text);
      if (v && v !== "CONTRADICTED") c.verdict = v;
    }
  }
  return { claims, costUsd: cost, ok: true };
}

const SECOND_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          verdict: { type: "string", enum: ["SUPPORTED", "NOT_IN_EVIDENCE", "CONTRADICTED"] },
        },
        required: ["text", "verdict"],
      },
    },
  },
  required: ["results"],
};

async function secondOpinion(place: string, ev: Evidence, claims: Claim[]) {
  const system = `You double-check fact-check results. For each claim about ${place}, decide from the EVIDENCE alone whether it is SUPPORTED, NOT_IN_EVIDENCE or CONTRADICTED. CONTRADICTED requires evidence that is clearly incompatible with the claim; a merely different level of detail is NOT a contradiction. Echo each claim's text exactly.`;
  const user = `EVIDENCE:\n<<<\n${evidenceBlock(ev)}\n>>>\n\nCLAIMS:\n${claims.map((c) => `- ${c.text}  [first checker quoted: "${c.evidence_quote}"]`).join("\n")}`;
  const r = await runClaude({ system, user, model: CONFIG.secondOpinionModel, jsonSchema: SECOND_SCHEMA, maxBudgetUsd: CONFIG.maxBudgetPerCallUsd, noCache: true });
  const verdicts = new Map<string, Verdict>();
  for (const x of ((r.structured as { results?: { text: string; verdict: Verdict }[] })?.results ?? [])) verdicts.set(x.text, x.verdict);
  return { verdicts, costUsd: r.costUsd };
}

export function summarize(fc: FactCheck) {
  const by = (v: Verdict) => fc.claims.filter((c) => c.verdict === v);
  return {
    claims: fc.claims.length,
    supported: by("SUPPORTED").length,
    not_in_evidence: by("NOT_IN_EVIDENCE").length,
    contradicted: by("CONTRADICTED"),
    legend_as_fact: by("LEGEND_AS_FACT"),
    price_or_hours: by("PRICE_OR_HOURS"),
  };
}
