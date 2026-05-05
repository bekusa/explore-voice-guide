/**
 * Interest catalogue — shared across the app.
 *
 * Used by:
 *  • the attraction page's interest picker (per-place bias for
 *    the narrated guide — n8n /webhook/guide reads the chosen id
 *    and tilts content accordingly: e.g. "photography" → spend more
 *    breath on framing, light, materials than on dates)
 *  • the global interest preference (lib/interestPreference.ts)
 *
 * Adding a new interest:
 *  1. Add a row here.
 *  2. Add `filters.int.<id>` to UI_STRINGS in src/lib/i18n.ts so the
 *     chip label translates.
 *  3. Mention the new id in the n8n /webhook/guide prompt's
 *     interest dictionary block so Claude knows how to bias.
 */
import type { UiKey } from "@/lib/i18n";

export type Interest = {
  id: string;
  key: UiKey;
  emoji: string;
};

export const INTERESTS: Interest[] = [
  // Default — picked first when no preference set. The "Editor's
  // Pick" framing tells the user we'll surface a balanced, magazine-
  // quality narration instead of biasing toward one angle.
  { id: "editors", key: "filters.int.editors", emoji: "✨" },
  { id: "history", key: "filters.int.history", emoji: "🏛️" },
  { id: "photography", key: "filters.int.photography", emoji: "📸" },
  { id: "authentic", key: "filters.int.authentic", emoji: "🎭" },
  { id: "family", key: "filters.int.family", emoji: "👨‍👩‍👧" },
  { id: "romantic", key: "filters.int.romantic", emoji: "💞" },
];

export const INTERESTS_BY_ID = new Map<string, Interest>(INTERESTS.map((x) => [x.id, x]));
export const VALID_INTEREST_IDS = new Set<string>(INTERESTS.map((x) => x.id));

/**
 * Default interest when nothing else is selected. Editor's Pick
 * delegates the angle to Claude — it's the safest "give me the
 * best of this place" signal for first-time visitors.
 *
 * Migration note: legacy IDs like "art", "food", "nature",
 * "architecture", "spirituality", "couples" (replaced by "romantic"),
 * "adventure", "local", "nightlife" no longer exist. Any persisted
 * preference referencing them is normalised back to "editors" via
 * normalizeInterest below.
 */
export const DEFAULT_INTEREST = "editors";

export function isValidInterest(id: string): boolean {
  return VALID_INTEREST_IDS.has(id);
}

export function normalizeInterest(id: string | null | undefined): string {
  if (!id) return DEFAULT_INTEREST;
  return isValidInterest(id) ? id : DEFAULT_INTEREST;
}
