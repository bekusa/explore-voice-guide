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
  { id: "history", key: "filters.int.history", emoji: "🏛️" },
  { id: "art", key: "filters.int.art", emoji: "🎨" },
  { id: "food", key: "filters.int.food", emoji: "🍽️" },
  { id: "nature", key: "filters.int.nature", emoji: "🌿" },
  { id: "architecture", key: "filters.int.architecture", emoji: "🏗️" },
  { id: "spirituality", key: "filters.int.spirituality", emoji: "🕯️" },
  { id: "family", key: "filters.int.family", emoji: "👨‍👩‍👧" },
  { id: "couples", key: "filters.int.couples", emoji: "💞" },
  { id: "photography", key: "filters.int.photography", emoji: "📸" },
  { id: "adventure", key: "filters.int.adventure", emoji: "🧗" },
  { id: "local", key: "filters.int.local", emoji: "🏘️" },
  { id: "nightlife", key: "filters.int.nightlife", emoji: "🌙" },
];

export const INTERESTS_BY_ID = new Map<string, Interest>(INTERESTS.map((x) => [x.id, x]));
export const VALID_INTEREST_IDS = new Set<string>(INTERESTS.map((x) => x.id));

/**
 * Beka's product call: heritage-tourist audience, so the safer
 * fallback is History when nothing else is selected.
 */
export const DEFAULT_INTEREST = "history";

export function isValidInterest(id: string): boolean {
  return VALID_INTEREST_IDS.has(id);
}

export function normalizeInterest(id: string | null | undefined): string {
  if (!id) return DEFAULT_INTEREST;
  return isValidInterest(id) ? id : DEFAULT_INTEREST;
}
