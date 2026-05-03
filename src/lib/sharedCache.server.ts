/**
 * Shared (server-side) cache for AI-generated content. Backed by
 * Supabase tables — see `supabase/migrations/*_cached_guides.sql`.
 *
 * Why this exists: the frontend localStorage cache is per-user, so
 * 1000 visitors looking up "Narikala Fortress" historically meant
 * 1000 Claude calls. With this cache, the first visitor pays the
 * Claude bill and saves the response into Supabase; every subsequent
 * visitor (on any device, any browser) gets the cached payload
 * straight from Postgres in ~50ms.
 *
 * Usage pattern in a server route:
 *
 *   const key = guideKey(name, language, interest);
 *   const hit = await getCachedGuide(key);
 *   if (hit) return Response.json(hit);
 *   const fresh = await callN8n(...);
 *   void putCachedGuide(key, fresh);   // fire and forget
 *   return Response.json(fresh);
 *
 * The fire-and-forget write keeps the user's response time tight —
 * the cache miss already paid the Claude latency, no point waiting
 * on a Postgres round-trip too. A failed write is logged and
 * swallowed: the cache is an optimization, not a source of truth.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The auto-generated `Database` type lives in supabase/types.ts and
// is regenerated whenever Lovable syncs schema. Until that file
// learns about the cached_* tables this migration adds, we read the
// admin client through a permissive view so TypeScript doesn't trip.
// Behaviour is unchanged — this is purely a type hatch.
type AnyTable = {
  select: (cols: string) => {
    eq: (
      col: string,
      val: string,
    ) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  upsert: (
    row: Record<string, unknown>,
    opts?: { onConflict?: string },
  ) => Promise<{ error: { message: string } | null }>;
  update: (patch: Record<string, unknown>) => {
    eq: (
      col: string,
      val: string,
    ) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};
type DbWithCache = {
  from: (table: "cached_guides" | "cached_attractions") => AnyTable;
};
const db = supabaseAdmin as unknown as DbWithCache;

/* ─── Key normalization ─── */

/**
 * Canonicalize a free-form place name so trivial whitespace / case
 * drift collapses to one cache row. Same shape the frontend
 * `attractionSlug()` uses (modulo the dash separator), so we can
 * cross-reference if needed.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable string key for the `filters` argument to /attractions —
 * empty filters collapse to "{}" so "no preference" hits a single
 * shared row regardless of how the client serialized them.
 */
export function filtersKey(filters: { interests?: string[]; duration?: string }): string {
  const interests = (filters.interests ?? []).map((s) => s.trim().toLowerCase()).sort();
  const duration = (filters.duration ?? "").trim().toLowerCase();
  if (interests.length === 0 && !duration) return "{}";
  return JSON.stringify({ interests, duration });
}

/* ─── Guides ─── */

export type GuideKey = {
  name: string;
  language: string;
  interest: string;
};

export async function getCachedGuide(key: GuideKey): Promise<unknown | null> {
  try {
    const { data, error } = await db
      .from("cached_guides")
      .select("payload")
      .eq("name_normalized", normalizeName(key.name))
      .eq("language", key.language)
      .eq("interest", key.interest)
      .maybeSingle();
    if (error) {
      console.warn("[sharedCache] getCachedGuide error", error.message);
      return null;
    }
    if (!data) return null;
    // Bump hit count + updated_at without blocking the response.
    void bumpGuideHit(key);
    return data.payload;
  } catch (err) {
    console.warn("[sharedCache] getCachedGuide threw", err);
    return null;
  }
}

export async function putCachedGuide(key: GuideKey, payload: unknown): Promise<void> {
  try {
    const { error } = await db.from("cached_guides").upsert(
      {
        name_normalized: normalizeName(key.name),
        language: key.language,
        interest: key.interest,
        payload: payload as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name_normalized,language,interest" },
    );
    if (error) console.warn("[sharedCache] putCachedGuide error", error.message);
  } catch (err) {
    console.warn("[sharedCache] putCachedGuide threw", err);
  }
}

async function bumpGuideHit(key: GuideKey): Promise<void> {
  try {
    // PostgREST doesn't expose `hit_count = hit_count + 1` directly,
    // so do a small read-then-write. Race conditions here just mean a
    // hit gets undercounted by one — acceptable for an analytics field.
    const { data } = await db
      .from("cached_guides")
      .select("hit_count")
      .eq("name_normalized", normalizeName(key.name))
      .eq("language", key.language)
      .eq("interest", key.interest)
      .maybeSingle();
    if (!data) return;
    const current = typeof data.hit_count === "number" ? data.hit_count : 0;
    await db
      .from("cached_guides")
      .update({ hit_count: current + 1 })
      .eq("name_normalized", normalizeName(key.name))
      .eq("language", key.language)
      .eq("interest", key.interest);
  } catch {
    /* hit_count is analytics, never block on it */
  }
}

/* ─── Attractions ─── */

export type AttractionsKey = {
  query: string;
  language: string;
  filters: { interests?: string[]; duration?: string };
};

export async function getCachedAttractions(key: AttractionsKey): Promise<unknown | null> {
  try {
    const { data, error } = await db
      .from("cached_attractions")
      .select("payload")
      .eq("query_normalized", normalizeName(key.query))
      .eq("language", key.language)
      .eq("filters_key", filtersKey(key.filters))
      .maybeSingle();
    if (error) {
      console.warn("[sharedCache] getCachedAttractions error", error.message);
      return null;
    }
    if (!data) return null;
    void bumpAttractionsHit(key);
    return data.payload;
  } catch (err) {
    console.warn("[sharedCache] getCachedAttractions threw", err);
    return null;
  }
}

export async function putCachedAttractions(key: AttractionsKey, payload: unknown): Promise<void> {
  try {
    const { error } = await db.from("cached_attractions").upsert(
      {
        query_normalized: normalizeName(key.query),
        language: key.language,
        filters_key: filtersKey(key.filters),
        payload: payload as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "query_normalized,language,filters_key" },
    );
    if (error) console.warn("[sharedCache] putCachedAttractions error", error.message);
  } catch (err) {
    console.warn("[sharedCache] putCachedAttractions threw", err);
  }
}

async function bumpAttractionsHit(key: AttractionsKey): Promise<void> {
  try {
    const { data } = await db
      .from("cached_attractions")
      .select("hit_count")
      .eq("query_normalized", normalizeName(key.query))
      .eq("language", key.language)
      .eq("filters_key", filtersKey(key.filters))
      .maybeSingle();
    if (!data) return;
    const current = typeof data.hit_count === "number" ? data.hit_count : 0;
    await db
      .from("cached_attractions")
      .update({ hit_count: current + 1 })
      .eq("query_normalized", normalizeName(key.query))
      .eq("language", key.language)
      .eq("filters_key", filtersKey(key.filters));
  } catch {
    /* analytics-only */
  }
}
