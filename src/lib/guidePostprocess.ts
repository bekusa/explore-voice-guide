/**
 * Guide post-processing — shared by /api/guide and the offline
 * content factory (tools/content-factory).
 *
 * Moved here from src/routes/api.guide.ts on 2026-10-21 with no
 * behaviour change. Same reason cacheKey.ts exists: the factory must
 * run EXACTLY the code the live route runs, and two copies of a
 * normaliser drift. There is one definition, here.
 */

/* ───────── Post-generation normalisation (bug report 2026-08-08) ─────────
 * Two model-behaviour bugs are cheaper to fix deterministically here
 * than to keep re-prompting for:
 *
 *  BUG 4 — estimated_duration_seconds is written by the model and is
 *    routinely wrong (Sumela: 920 words → real TTS ~370 s, model said
 *    540 s, +45%). The UI shows that number, so it misleads users.
 *    We ignore the model's value and compute from the word count at
 *    the TTS rate the guide prompt itself targets (~150 wpm).
 *
 *  BUG 5 — spelled-out years ("nineteen twenty-three") slip through
 *    despite the prompt banning them. Gemini then translates them
 *    literally and the result is broken in Georgian and other
 *    locales. We rewrite them to digits BEFORE the translation step.
 */

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
/** Century leads that start a spoken year: "nineteen ..." = 19xx. */
const CENTURY: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/** "twenty-three" | "thirty" | "five" | "oh five" → 23 | 30 | 5 | 5 */
function spokenTail(tail: string): number | null {
  const t = tail.toLowerCase().replace(/-/g, " ").trim();
  if (!t) return null;
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    const w = parts[0];
    if (w in TENS) return TENS[w];
    // "nineteen twelve" is a year; "twenty five" is the number 25. A lone
    // single digit never completes a spoken year (that form is "oh five").
    if (w in ONES && ONES[w] >= 10) return ONES[w];
    return null;
  }
  if (parts.length === 2) {
    const [a, b] = parts;
    // "oh five" → 5
    if ((a === "oh" || a === "o") && b in ONES && ONES[b] <= 9) return ONES[b];
    if (a in TENS && b in ONES && ONES[b] <= 9) return TENS[a] + ONES[b];
    return null;
  }
  return null;
}

/**
 * Replace spoken years with digits. Handles "nineteen twenty-three",
 * "eighteen ninety", "nineteen oh five", "twenty ten". Leaves prose
 * that merely starts with a century word ("nineteenth century",
 * "nineteen people") untouched — the tail must parse as a valid
 * year remainder for the rewrite to fire.
 */
export function digitizeSpokenYears(text: string): string {
  const centuryWords = Object.keys(CENTURY).join("|");
  const tailWords =
    Object.keys(TENS).join("|") + "|" + Object.keys(ONES).join("|") + "|oh|o";
  const re = new RegExp(
    // A SPACE after the century word, never a hyphen: "twenty-five" is a
    // cardinal number, not the year 2005 (2026-10-21 fix — the hyphen form
    // was turning "twenty-five tonnes" into "2005 tonnes").
    `\\b(${centuryWords}) ((?:${tailWords})(?:[ -](?:${Object.keys(ONES).join("|")}))?)\\b`,
    "gi",
  );
  return text.replace(re, (match, centuryWord: string, tail: string) => {
    const century = CENTURY[centuryWord.toLowerCase()];
    const rest = spokenTail(tail);
    if (century === undefined || rest === null) return match;
    // "nineteen twenty" → 1920; "nineteen five" is not a real year
    // form, but "nineteen oh five" is — spokenTail already gates it.
    const year = century * 100 + rest;
    if (year < 1000 || year > 2099) return match;
    return String(year);
  });
}

/** Word count of the narration, used for the duration estimate. */
function countWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Apply BUG 4 + BUG 5 fixes to a parsed guide payload. Returns the
 * input untouched when it isn't a guide-shaped object, so callers can
 * pass parseClaudeJson's result straight through.
 */
export function normalizeGuidePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const obj = { ...(payload as Record<string, unknown>) };
  const script = obj.script;
  if (typeof script !== "string" || !script.trim()) return payload;

  // BUG 5 — digits everywhere the user reads or hears text.
  const fixedScript = digitizeSpokenYears(script);
  obj.script = fixedScript;
  for (const field of ["key_facts", "tips", "look_for"]) {
    const arr = obj[field];
    if (Array.isArray(arr)) {
      obj[field] = arr.map((v) => (typeof v === "string" ? digitizeSpokenYears(v) : v));
    }
  }
  if (typeof obj.title === "string") obj.title = digitizeSpokenYears(obj.title);

  // BUG 4 — server-computed duration at ~150 wpm (2.5 words/second),
  // rounded to the nearest 10 s. Overrides whatever the model wrote.
  const seconds = Math.round(countWords(fixedScript) / 2.5 / 10) * 10;
  obj.estimated_duration_seconds = Math.max(30, seconds);

  return obj;
}
