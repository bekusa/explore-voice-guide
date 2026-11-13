/**
 * Check modules. Each takes the Unit and returns findings plus an optional payload patch.
 * Implemented: photos (photos.ts), aliases (../aliases.ts).
 * To implement, in this order, each following its section of claude/content-qa-agent-prompt-2026-11-01.md:
 *   identity.ts  (A)  → wpSummary/wdEntity vs title & city; "correction paragraph" regex; destroyed → QUARANTINE
 *   facts.ts     (B)  → getEvidence + factCheck + repairGuide from ../content-factory (tiers 1-3)
 *   style.ts     (C)  → metrics in code (sentence lengths, Flesch, commas, banned words) + paragraph judge
 *   chips.ts     (D,E)→ look_for / tips: evidenced, visible today, no prices/hours
 *   hours.ts     (F)  → place_details match vs coords & OSM opening_hours; blank wrong matches
 *   coords.ts    (G)  → P625 vs OSM(wikidata=QID) vs enwiki vs Google; thresholds by sizeClass
 *   consistency.ts (I)→ title vs list name, city in keys, chip counts, desc word counts
 * Every module must: never call a paid live endpoint; record evidence_url + quote for any change;
 * return patch (never write cached_* itself) — write/ applies patches after gate1 passes.
 */
import type { CheckResult, Unit } from "../types";

export type Check = (unit: Unit) => Promise<CheckResult>;

const notImplemented = (name: string): Check => async () => ({
  findings: [{ check: name as never, severity: "info", detail: `${name}: not implemented yet (see checks/index.ts)` }],
  costUsd: 0,
  calls: 0,
});

export const identity: Check = notImplemented("identity");
export const facts: Check = notImplemented("facts");
export const style: Check = notImplemented("style");
export const chips: Check = notImplemented("look_for");
export const hours: Check = notImplemented("hours");
export const coords: Check = notImplemented("coords");
export const consistency: Check = notImplemented("consistency");

/** Text checks run in order; each may depend on the previous patch. */
export const TEXT_CHECKS: Array<[string, Check]> = [["identity", identity], ["facts", facts], ["chips", chips], ["style", style], ["consistency", consistency]];
/** Language-neutral checks are independent of the text and of each other. */
export const NEUTRAL_CHECKS: Array<[string, Check]> = [["coords", coords], ["hours", hours]];
