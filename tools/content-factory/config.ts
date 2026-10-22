/**
 * Content factory settings. Decisions recorded 2026-10-21 (Beka):
 *  - prompt contradiction fixed in src/lib/prompts.ts before running;
 *  - REPAIR of failing items is allowed (marked edited=true);
 *  - 10 attractions per city (first page only);
 *  - unsure categories + town/municipality are NOT in the first wave.
 */
export const CONFIG = {
  /** Must equal the model the live routes call (src/lib/anthropic.server.ts DEFAULT_MODEL / api.attractions.ts). */
  generatorModel: "claude-sonnet-4-5",
  /** Fact-checker and repair do not need to match the app. */
  checkerModel: "claude-haiku-4-5",
  secondOpinionModel: "claude-sonnet-4-5",
  repairModel: "claude-sonnet-4-5",

  attractionsPerCity: 10,
  interest: "editors",

  /** Hard cap per single call — a runaway call cannot eat the budget. */
  maxBudgetPerCallUsd: 0.4,
  /** Lane budgets (client-side list-price estimate, summed from total_cost_usd). */
  laneBudgetUsd: {
    cloud: 230, // $250 promo credit, $20 reserve; expires 2026-11-04
    max: 0, // set per week once the pilot has measured % of the weekly limit per item
  } as Record<string, number>,
  /** Evidence sent to the checker: the article from the top (lead + history usually come first). */
  evidenceChars: 25_000,
  concurrency: 4,
  /** Re-rolls are for contract failures only (unparseable, too short, broken chips).
   *  Fact problems go straight to REPAIR — a fresh sample brings fresh errors. */
  maxRerolls: 2,

  /** Gate 1 contract — guides (src/lib/prompts.ts buildGuideSystem). */
  guide: {
    /** prompt asks for >=900 (aim ~1,050); Beka 2026-06-28: 5-6 min, ~850-950 words is right. Hard floor 800 (re-rolling with the same prompt rarely fixes a systematic 10% shortfall and costs a full generation), 800-899 is a soft flag. */
    minWords: 800,
    targetWords: 900,
    maxWords: 1500,
    minParagraphs: 12,
    maxParagraphs: 14,
    paragraphWords: [75, 110] as [number, number],
    chipCount: [3, 5] as [number, number],
    chipWords: { key_facts: [6, 12], tips: [6, 14], look_for: [6, 12] } as Record<string, [number, number]>,
    maxSentenceWords: 25,
    /** share of sentences allowed over maxSentenceWords before it is flagged */
    longSentenceShare: 0.2,
  },
  /** Gate 1 contract — attraction lists (buildAttractionsSystem). */
  attractions: {
    minItems: 6,
    maxItems: 10,
    outsideWords: [35, 60] as [number, number],
    insiderWords: [20, 40] as [number, number],
    ratingRange: [3.6, 5.0] as [number, number],
    minRatingSpread: 1.0,
    maxTypeWords: 2,
    maxSameTypeRun: 3,
  },
  /** Gate 2 grounding */
  geo: {
    maxKmFromCity: 50,
    maxKmPackaged: 120,
    maxPackagedItems: 2,
  },

  /** Worklist filters (first wave). */
  worklist: {
    excludeGuideCategories: ["volcano", "waterfall", "square", "protected area", "cultural property", "beach", "urban park", "garden"],
    cityPlaceTypes: ["big city", "city", "capital", "urban area", "agglomeration"],
  },
};
