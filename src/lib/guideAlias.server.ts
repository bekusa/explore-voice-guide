import { callClaude } from "@/lib/anthropic.server";
import { normalizeName } from "@/lib/cacheKey";
import { logNameResolution } from "@/lib/errorLog.server";
import { findGuideCandidates, type GuideKey } from "@/lib/sharedCache.server";

/**
 * "Do we already have this place under another name?" — asked on every
 * guide cache miss, BEFORE paying for a new generation.
 *
 * Beka 2026-11-08: "არ მინდა ყოველ ჯერზე გენერაციები. მანდ ხომ AI-საც
 * ვხმარობთ რომ სწორი ალიასი იპოვოს და მაგან რატო ვერ იპოვა?"
 *
 * Why the existing AI step could not catch it: normalizeToCanonical-
 * English asks the model for a canonical spelling of ONE name, blind. It
 * never sees what is already in the cache, so it cannot know that
 * "perouges" is sitting there. And it only runs for non-English UIs, so
 * the English-UI request for "Medieval City of Perouges" never reached
 * it at all. Two names, nothing comparing them → a second 48-second
 * Sonnet generation for a guide we already had.
 *
 * This compares against what we actually have:
 *   1. pick the request's most distinctive word ("perouges"), ignoring
 *      generic ones ("medieval", "city", "of", "church", "museum"…);
 *   2. fetch up to six English guides whose name contains it, same
 *      interest, same city (or no city) — a database read, free;
 *   3. if there are any, ask Haiku which, if any, is EXACTLY the same
 *      place (~1 s, ~$0.0003 — against ~45 s and the price of a Sonnet
 *      guide when we generate instead).
 * The caller then stores the reused guide under the requested name too,
 * so the next request for that name is a direct cache hit and none of
 * this runs again.
 *
 * Built to fail toward generating: no distinctive word, no candidates,
 * a model error, or any doubt in the answer all return null and the
 * request goes on exactly as before. Reusing the WRONG place's guide is
 * the one outcome worse than paying twice, so the judge is told to
 * answer 0 unless it is sure, and parts / surroundings / namesakes are
 * named explicitly as "not the same".
 */

// Words that describe a KIND of place rather than which place it is.
// They are dropped before choosing the search word, so "Medieval City
// of Pérouges" searches by "perouges", not by "medieval".
const GENERIC = new Set(
  (
    "the of and a an in at on to for de la le les du des del della delle di da do dos das el al " +
    "saint st san santa santo sao sainte old new great grand little upper lower north south east west " +
    "city town village medieval ancient historic historical centre center quarter district " +
    "museum gallery church cathedral basilica chapel mosque temple synagogue shrine monastery abbey " +
    "palace castle fortress fort citadel tower bridge gate wall walls ruins site complex " +
    "park garden gardens square plaza piazza platz place market bazaar street road avenue boulevard " +
    "national royal imperial memorial monument statue house hall library theatre theater opera " +
    "beach lake river mount mountain hill island bay port harbour harbor valley cave falls waterfall"
  ).split(" "),
);

/** The request's most distinctive word, or null when it has none. */
export function distinctiveWord(name: string): string | null {
  const words = normalizeName(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w));
  if (words.length === 0) return null;
  return words.reduce((best, w) => (w.length > best.length ? w : best));
}

const JUDGE_SYSTEM =
  "You decide whether a requested place and a candidate refer to EXACTLY the same real-world place.\n" +
  "SAME: the same site under another name, an official vs. common name, another spelling, another language, " +
  'or the place name with or without a descriptor ("Medieval City of Pérouges" = "Pérouges").\n' +
  "NOT the same: a part of it, a building inside it, a larger area containing it, a nearby place, " +
  "or a different place that shares a word (Louvre vs Louvre Abu Dhabi; St Peter's Basilica vs St Peter's Square).\n" +
  "If the request is ambiguous or you are not sure, answer 0.\n" +
  "Reply with ONE number only: the candidate's number, or 0.";

export type SamePlaceGuide = { name: string; city: string; payload: unknown };

export async function findSamePlaceGuide(
  key: GuideKey,
  displayName: string,
): Promise<SamePlaceGuide | null> {
  const word = distinctiveWord(key.name) ?? distinctiveWord(displayName);
  if (!word) return null;

  const candidates = await findGuideCandidates(key, word);
  if (candidates.length === 0) return null;

  const startedAt = Date.now();
  const user =
    `Requested: "${displayName.trim()}"` +
    (key.city ? ` (city: ${key.city})` : " (city unknown)") +
    "\nCandidates:\n" +
    candidates
      .map((c, i) => `${i + 1}. "${c.name}"` + (c.city ? ` (city: ${c.city})` : ""))
      .join("\n");

  let pick = 0;
  try {
    const answer = await callClaude({
      model: "claude-haiku-4-5",
      system: JUDGE_SYSTEM,
      user,
      maxTokens: 4,
      temperature: 0,
      label: "guide-alias",
    });
    const m = /\d+/.exec(answer);
    pick = m ? Number(m[0]) : 0;
  } catch (err) {
    console.warn("[guideAlias] judge failed — generating instead", err);
    return null;
  }

  const hit = pick >= 1 && pick <= candidates.length ? candidates[pick - 1] : null;
  await logNameResolution({
    input: displayName.trim(),
    resolvedBy: "alias",
    resolvedTo: hit ? hit.name : null,
    durationMs: Date.now() - startedAt,
  });
  return hit;
}
