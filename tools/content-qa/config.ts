/**
 * Content QA agent — configuration.
 *
 * Every value here is a decision Beka made on 2026-11-03 (chat) or a default he
 * accepted. The agent reads this file instead of asking. Change a value here,
 * not in the code, and note the date.
 */
export const QA_CONFIG = {
  /** Beka 2026-11-03: run AFTER the content factory queue is empty, then use the plan fully.
   *  The runner refuses to start while content_jobs still has queued guide jobs unless
   *  CQ_FORCE=1 is set. */
  waitForFactory: true,
  usage: {
    /** Weekly window ceiling (Beka 2026-11-03: "factory-ს შემდეგ, 100%-მდე"). Leaves nothing for
     *  his own chats, so the runner also stops when the 5-hour window passes maxFiveHour. */
    maxWeekly: 1.0,
    maxFiveHour: 0.9,
    /** Re-read the plan windows at least this often (units). */
    checkEvery: 50,
  },

  /** Beka 2026-11-03: all units, in factory rank order (content_jobs.rank; app-born guides after
   *  the ranked ones, by hit_count). */
  scope: "all" as "all" | "top2000",
  orderBy: "rank" as "rank" | "hits",

  /** Change severity → translations. Beka 2026-11-03: delete at 2 and 3, keep at 0 and 1.
   *  Translated city lists: patch coordinates in place; delete a translated list row only
   *  for a level-3 change of the unit inside it. */
  translations: {
    deleteAtLevel: 2,
    translatedListsDeleteAtLevel: 3,
    /** The translation-path check must pass once per wave before any deletion. */
    requirePathCheck: true,
    pathCheckLanguage: "ka",
  },

  photos: {
    targetCount: { min: 3, max: 5 },
    /** Same method as the October 2026 shrink-blobs pass. */
    shrink: { targetWidth: 1280, minBytes: 400_000 },
    minWidth: { wikimedia: 800, preferred: 1200 },
    /** Reject photos taken before this year (metadata date). Stricter than the app's 1940 cut. */
    minYear: 1990,
    preferredMinYear: 2000,
    /** Beka 2026-11-03 ("1 და 2"): Wikimedia first; Openverse only when < min remain after it. */
    externalSources: ["openverse"] as Array<"openverse" | "flickr" | "mapillary" | "pixabay">,
    /** Geosearch radius for places without a Commons category. */
    geoRadiusM: { building: 200, site: 1000 },
    visionModel: "claude-haiku-4-5",
    visionSecondOpinion: "claude-sonnet-4-5",
  },

  hours: {
    /** Beka 2026-11-03 ("1, 2 და 4"): verify the existing rows; fetch Google for the top N by
     *  hits (paid, ≈ $0.035 each); fill the rest from OpenStreetMap opening_hours (free). */
    verifyExisting: true,
    googleFetchTopN: 1000,
    googleCostPerCallUsd: 0.035,
    osmForRest: true,
    /** Google match must lie within this distance of the verified coordinates. */
    maxMatchDistanceM: { building: 250, site: 1000, district: 2000, nature: 10_000 },
  },

  coords: {
    thresholdM: { building: 250, site: 1000, district: 2000, nature: 10_000 },
    /** Two agreeing sources are required to move or fill a coordinate. */
    requireSources: 2,
  },

  facts: {
    /** Default accepted 2026-11-03: official-site check (tier 3) on every unit, ≤3 fetches. */
    tier3Official: true,
    tier3MaxFetches: 3,
    checkerModel: "claude-haiku-4-5",
    secondOpinionModel: "claude-sonnet-4-5",
    repairModel: "claude-opus-5-5",
  },

  style: {
    maxSentenceWords: 30, // hard
    longSentenceWords: 22,
    maxLongSentenceShare: 0.1,
    medianSentenceWords: [10, 18] as [number, number],
    minFlesch: 60, // signal, not gate
    maxCommasPerSentence: 2,
    /** More than this share of paragraphs failing → REGENERATE instead of rewrite. */
    regenerateAboveShare: 0.3,
    judgeModel: "claude-haiku-4-5",
    rewriteModel: "claude-opus-5-5",
  },

  aliases: {
    /** Default accepted 2026-11-03: English + the place's local language + the 17 core UI
     *  languages used for the Turkish rollout translations. Georgian always. */
    languages: ["en", "ka", "tr", "ru", "de", "fr", "es", "it", "pt", "ar", "zh", "ja", "ko", "hi", "pl", "uk", "he", "fa", "az"],
    includeLocalLanguage: true,
    judgeModel: "claude-haiku-4-5",
    judgeSecondOpinion: "claude-sonnet-4-5",
    minLength: 4,
  },

  /** Default accepted 2026-11-03: stop for Beka only after the 20-unit pilot (Phase 1 → 2).
   *  Everything after runs on its own and is reported per wave. */
  stopAfterPilot: true,
  pilotSize: 20,
  waveSize: 500,
  concurrency: 4,
  staleClaimMinutes: 30,

  /** Rule 10: pause the wave when one defect pattern exceeds this share of units. */
  patternPauseShare: 0.05,
  errorPauseShare: 0.05,

  /** Hard cap per model call (client-side list price). */
  maxBudgetPerCallUsd: 0.4,
  /** Hard cap per unit across all sub-agents; exceeded → REVIEW (agents/ORCHESTRATION.md). */
  maxBudgetPerUnitUsd: 1.5,
  /** Google Maps links must be by NAME, never by coordinates (Beka 2026-11-08). */
  mapsLink: (name: string, city: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city ? `${name}, ${city}` : name)}`,

  userAgent: "Lokali-content-qa/1.0 (contact@lokali.travel)",
  liveBase: "https://lokali.travel",
  azure: { account: "lokaliphotos", container: "attractions" },
} as const;

export type SizeClass = keyof typeof QA_CONFIG.coords.thresholdM;
