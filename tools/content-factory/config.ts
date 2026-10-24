/**
 * Content factory settings. Decisions recorded 2026-10-21 (Beka):
 *  - prompt contradiction fixed in src/lib/prompts.ts before running;
 *  - REPAIR of failing items is allowed (marked edited=true);
 *  - 10 attractions per city (first page only);
 *  - unsure categories + town/municipality are NOT in the first wave.
 */
export const CONFIG = {
  /** Beka 2026-10-22, after the 5-place comparison: guides with Opus 5.5
   *  (fewer invented facts, meets the length contract), city lists with the
   *  app's own Sonnet 4.5. The live app still generates new guides with
   *  Sonnet unless src/lib/anthropic.server.ts DEFAULT_MODEL is changed. */
  guideModel: "claude-opus-5-5",
  attractionsModel: "claude-sonnet-4-5",
  /** Beka 2026-10-22: no fact-check / repair in the credit run (cost). Gates 1-2 (code) stay. */
  factCheck: false,
  /** Fact-checker and repair do not need to match the app. */
  checkerModel: "claude-haiku-4-5",
  secondOpinionModel: "claude-sonnet-4-5",
  repairModel: "claude-sonnet-4-5",

  attractionsPerCity: 10,
  interest: "editors",

  /** Hard cap per single call — a runaway call cannot eat the budget. */
  maxBudgetPerCallUsd: 0.4,
  /** Budgets per lane and kind (client-side list-price estimate, summed from content_jobs.cost_usd).
   *  NOTE (2026-10-22): `claude -p` logs in with the subscription (apiKeySource "none"), so these
   *  calls count against the Max plan's 5-hour and weekly windows — the $250 cloud credit counter
   *  did not move. Overage is disabled for the org, so no money is charged; the real limit is
   *  `usage` below. These dollar caps stay as a second brake. */
  budgetUsd: {
    "cloud:guide": 2000, // Max plan. Not money (overage is off): the weekly cap below is the real brake. Beka 2026-10-22 lifted it from $175.
    "cloud:attractions": 200, // Beka 2026-10-23: continue past 1,000 cities
    // Cloud-session credit ($250, expires 2026-11-04 23:59 PT). Run with CF_CREDIT_MODE=1 from a
    // session outside any Project; ~$25 stays for that session's own conversation.
    "credit:guide": 200,
    "credit:attractions": 25, // ~475 cities: 249 never tried + 226 re-queued after the 2026-10-23 prompt fix
    "max:guide": 0, // set once the weekly-limit share per item is measured
    "max:attractions": 0,
  } as Record<string, number>,
  /** Max-plan usage windows (0..1), read from every call. The factory shares them with Beka's
   *  own Claude use, so it leaves room: when the 5-hour window passes `maxFiveHour` the runner
   *  sleeps until it resets; when the weekly window passes `maxWeekly` it stops (Beka: 80%, the rest stays for his own use). */
  usage: {
    maxFiveHour: 0.9,
    maxWeekly: 0.9, // Beka 2026-10-22: 80%; raised to 90% on 2026-10-24
  },
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
    minItems: 3, // Beka 2026-10-23: the app shows and caches lists of 3-5 for small cities too
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
