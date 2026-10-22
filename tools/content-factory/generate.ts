/**
 * Generation = the app's own code path with a different transport.
 *
 * Every function imported here is the one the live Cloudflare routes
 * run (src/routes/api.guide.ts, src/routes/api.attractions.ts). Do not
 * copy prompt text or normalisers into this folder — import them, so
 * a prompt change in the app reaches the factory automatically.
 */
import { buildAttractionsSystem, buildAttractionsUser, buildGuideSystem, buildGuideUser } from "@/lib/prompts";
import { parseClaudeJson } from "@/lib/anthropic.server";
import { normalizeGuidePayload } from "@/lib/guidePostprocess";
import { resolveCoords } from "@/lib/resolveCoords.server";
import { CONFIG } from "./config";
import { runClaude, type ClaudeResult } from "./transport";

export type GuidePayload = {
  title: string;
  script: string;
  estimated_duration_seconds: number;
  key_facts: string[];
  tips: string[];
  look_for: string[];
};

export type GenResult<T> = {
  payload: T | null;
  call: ClaudeResult;
};

/** Mirror of api.guide.ts → hasGuideScript. */
export function hasGuideScript(payload: unknown): payload is GuidePayload {
  if (!payload || typeof payload !== "object") return false;
  const script = (payload as { script?: unknown }).script;
  return typeof script === "string" && script.trim().length > 0;
}

/** Mirror of api.guide.ts cache-miss branch: English baseline, given interest. */
export async function generateGuide(args: { name: string; city?: string; interest?: string }): Promise<GenResult<GuidePayload>> {
  const system = buildGuideSystem();
  const user = buildGuideUser({
    name: args.name,
    city: args.city,
    language: "en",
    interest: args.interest ?? "editors",
  });
  const call = await runClaude({
    system,
    user,
    model: CONFIG.guideModel,
    maxBudgetUsd: CONFIG.maxBudgetPerCallUsd,
  });
  if (!call.ok) return { payload: null, call };
  const parsed = normalizeGuidePayload(parseClaudeJson(call.text));
  return { payload: hasGuideScript(parsed) ? parsed : null, call };
}

/** Opus sometimes writes 6 chips where the prompt asks for 3-5. The UI shows
 *  them as one-line pills, so keep the first 5 instead of paying for a re-roll. */
export function trimChips(g: GuidePayload, max = 5): { payload: GuidePayload; trimmed: boolean } {
  let trimmed = false;
  const out: GuidePayload = { ...g };
  for (const k of ["key_facts", "tips", "look_for"] as const) {
    if (Array.isArray(out[k]) && out[k].length > max) {
      out[k] = out[k].slice(0, max);
      trimmed = true;
    }
  }
  return { payload: out, trimmed };
}

export type AttractionItem = {
  name: string;
  type?: string;
  outside_desc?: string;
  insider_desc?: string;
  rating?: number;
  duration?: string;
  category?: string;
  lat?: number | null;
  lng?: number | null;
};

/** Mirror of api.attractions.ts → extractAttractionsArray. */
export function extractAttractionsArray(payload: unknown): AttractionItem[] {
  if (Array.isArray(payload)) return payload.filter((x) => !!x && typeof x === "object");
  if (!payload || typeof payload !== "object") return [];
  const arr = (payload as { attractions?: unknown }).attractions;
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => !!x && typeof x === "object");
}

/** Mirror of api.attractions.ts first-page branch: count 10, no interest bias. */
export async function generateAttractions(args: { query: string }): Promise<GenResult<{ attractions: AttractionItem[] }>> {
  const system = buildAttractionsSystem();
  const user = buildAttractionsUser({ query: args.query, language: "en", count: CONFIG.attractionsPerCity, interests: [] });
  const call = await runClaude({
    system,
    user,
    model: CONFIG.attractionsModel,
    maxBudgetUsd: CONFIG.maxBudgetPerCallUsd,
  });
  if (!call.ok) return { payload: null, call };
  const rawArr = extractAttractionsArray(parseClaudeJson(call.text));
  if (rawArr.length === 0) return { payload: null, call };
  // Coordinates never come from the model — same as the live route.
  const attractions = (await resolveCoords(rawArr as Record<string, unknown>[], args.query)) as AttractionItem[];
  return { payload: { attractions }, call };
}
