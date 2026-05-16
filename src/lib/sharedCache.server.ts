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
import { createClient } from "@supabase/supabase-js";

// We deliberately don't reuse `supabaseAdmin` here. Lovable Cloud
// auto-manages the SUPABASE_* prefixed env vars and points them at
// its own provisioned project, which Beka can't reach to apply
// migrations. The cache lives in a separate Beka-owned project, so
// we read its credentials from EXTERNAL_SUPABASE_* env vars instead
// (Lovable explicitly allows non-SUPABASE_-prefixed names).
//
// Required env vars (set in Lovable Project Secrets):
//   EXTERNAL_SUPABASE_URL              → https://<project>.supabase.co
//   EXTERNAL_SUPABASE_SERVICE_ROLE_KEY → service_role key from
//                                        Supabase Dashboard → Project
//                                        Settings → API
//
// If either is missing the cache silently no-ops and every request
// falls through to n8n — same behaviour as before this file existed.

// Recursive chain type — every .eq() returns another chain that
// itself supports .eq() AND .maybeSingle(). This way 2-key tables
// (museum highlights) and 3-key tables (guides, attractions) share
// one type definition. Same idea for update — chained .eq() ends
// in a thenable when the chain is complete.
type SelectChain = {
  eq: (col: string, val: string) => SelectChain;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
};
type UpdateChain = {
  eq: (col: string, val: string) => UpdateChain;
  then: (onResolved: (value: { error: { message: string } | null }) => unknown) => Promise<unknown>;
};
type AnyTable = {
  select: (cols: string) => SelectChain;
  upsert: (
    row: Record<string, unknown>,
    opts?: { onConflict?: string },
  ) => Promise<{ error: { message: string } | null }>;
  update: (patch: Record<string, unknown>) => UpdateChain;
};
type DbWithCache = {
  from: (
    table:
      | "cached_guides"
      | "cached_attractions"
      | "cached_museum_highlights"
      | "cached_time_machine"
      | "cached_photos",
  ) => AnyTable;
};

// Lazy + memoized: don't crash module load if vars are missing,
// just return null so callers no-op.
let _db: DbWithCache | null | undefined;
function getDb(): DbWithCache | null {
  if (_db !== undefined) return _db;
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      "[sharedCache] EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY missing — cache disabled",
    );
    _db = null;
    return null;
  }
  const client = createClient(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  _db = client as unknown as DbWithCache;
  return _db;
}

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
  const db = getDb();
  if (!db) return null;
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
  const db = getDb();
  if (!db) return;
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
  const db = getDb();
  if (!db) return;
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
  const db = getDb();
  if (!db) return null;
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
  const db = getDb();
  if (!db) return;
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
  const db = getDb();
  if (!db) return;
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

/* ─── Museum highlights ─── */

export type MuseumHighlightsKey = {
  /** Stable id from src/lib/topMuseums.ts (e.g. "louvre"). */
  museumId: string;
  /** Language code: "en", "ka", "es", "zh-cn", … */
  language: string;
};

export async function getCachedMuseumHighlights(key: MuseumHighlightsKey): Promise<unknown | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("cached_museum_highlights")
      .select("payload")
      .eq("museum_id", key.museumId)
      .eq("language", key.language)
      .maybeSingle();
    if (error) {
      console.warn("[sharedCache] getCachedMuseumHighlights error", error.message);
      return null;
    }
    if (!data) return null;
    void bumpMuseumHighlightsHit(key);
    return data.payload;
  } catch (err) {
    console.warn("[sharedCache] getCachedMuseumHighlights threw", err);
    return null;
  }
}

export async function putCachedMuseumHighlights(
  key: MuseumHighlightsKey,
  payload: unknown,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const { error } = await db.from("cached_museum_highlights").upsert(
      {
        museum_id: key.museumId,
        language: key.language,
        payload: payload as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "museum_id,language" },
    );
    if (error) console.warn("[sharedCache] putCachedMuseumHighlights error", error.message);
  } catch (err) {
    console.warn("[sharedCache] putCachedMuseumHighlights threw", err);
  }
}

async function bumpMuseumHighlightsHit(key: MuseumHighlightsKey): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const { data } = await db
      .from("cached_museum_highlights")
      .select("hit_count")
      .eq("museum_id", key.museumId)
      .eq("language", key.language)
      .maybeSingle();
    if (!data) return;
    const current = typeof data.hit_count === "number" ? data.hit_count : 0;
    await db
      .from("cached_museum_highlights")
      .update({ hit_count: current + 1 })
      .eq("museum_id", key.museumId)
      .eq("language", key.language);
  } catch {
    /* analytics-only */
  }
}

/* ─── Time Machine simulations ─── */

export type TimeMachineKey = {
  /** Stable id from ATTRACTIONS in src/components/TimeMachine.tsx (e.g. "pompeii_day"). */
  attractionId: string;
  /**
   * Role chosen by the user — one of: merchant, soldier, servant,
   * foreigner, child, healer, spy, survivor. Lowercased.
   */
  role: string;
  /** Language code: "en", "ka", "es", "zh-cn", … */
  language: string;
};

export async function getCachedTimeMachine(key: TimeMachineKey): Promise<unknown | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("cached_time_machine")
      .select("payload")
      .eq("attraction_id", key.attractionId)
      .eq("role", key.role)
      .eq("language", key.language)
      .maybeSingle();
    if (error) {
      console.warn("[sharedCache] getCachedTimeMachine error", error.message);
      return null;
    }
    if (!data) return null;
    void bumpTimeMachineHit(key);
    return data.payload;
  } catch (err) {
    console.warn("[sharedCache] getCachedTimeMachine threw", err);
    return null;
  }
}

export async function putCachedTimeMachine(key: TimeMachineKey, payload: unknown): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const { error } = await db.from("cached_time_machine").upsert(
      {
        attraction_id: key.attractionId,
        role: key.role,
        language: key.language,
        payload: payload as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "attraction_id,role,language" },
    );
    if (error) console.warn("[sharedCache] putCachedTimeMachine error", error.message);
  } catch (err) {
    console.warn("[sharedCache] putCachedTimeMachine threw", err);
  }
}

async function bumpTimeMachineHit(key: TimeMachineKey): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const { data } = await db
      .from("cached_time_machine")
      .select("hit_count")
      .eq("attraction_id", key.attractionId)
      .eq("role", key.role)
      .eq("language", key.language)
      .maybeSingle();
    if (!data) return;
    const current = typeof data.hit_count === "number" ? data.hit_count : 0;
    await db
      .from("cached_time_machine")
      .update({ hit_count: current + 1 })
      .eq("attraction_id", key.attractionId)
      .eq("role", key.role)
      .eq("language", key.language);
  } catch {
    /* analytics-only */
  }
}

/* ─── Photos ─── */

/**
 * Single composite key for cached_photos. Every (name, scope, city,
 * museum) tuple maps to one URL row — the same combinations the
 * /api/photo handler builds when it constructs its in-memory cache
 * key, just normalized so trivial whitespace / case drift doesn't
 * fragment the store.
 */
export type PhotoKey = {
  name: string;
  /** "artwork" for museum highlights; anything else for places. */
  scope: string;
  /** City qualifier we appended for disambiguation, or empty. */
  city: string;
  /** Museum name when scope=artwork, or empty. */
  museum: string;
};

function photoCacheKey(key: PhotoKey): string {
  return [
    normalizeName(key.scope || ""),
    normalizeName(key.city || ""),
    normalizeName(key.museum || ""),
    normalizeName(key.name || ""),
  ].join("|");
}

/**
 * Look up a cached photo URL. Returns the URL string on hit,
 * `null` on miss / error. Same cache_key shape as /api/photo's
 * per-worker memory cache so the two layers stay in lock-step.
 */
export async function getCachedPhoto(key: PhotoKey): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("cached_photos")
      .select("url")
      .eq("cache_key", photoCacheKey(key))
      .maybeSingle();
    if (error) {
      console.warn("[sharedCache] getCachedPhoto error", error.message);
      return null;
    }
    if (!data) return null;
    const url = data.url;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch (err) {
    console.warn("[sharedCache] getCachedPhoto threw", err);
    return null;
  }
}

/**
 * Persist a photo URL. Fire-and-forget — the caller already paid
 * the Google/Wikipedia round trip, no point waiting on Supabase.
 *
 * Only stores SUCCESSFUL lookups. Null URLs (lookup-failed cases)
 * are intentionally NOT cached — a server-side fix or a new source
 * shouldn't be blocked by a stale "miss" row pinning users to no
 * image for days.
 */
export async function putCachedPhoto(key: PhotoKey, url: string): Promise<void> {
  if (!url) return;
  const db = getDb();
  if (!db) return;
  try {
    const { error } = await db.from("cached_photos").upsert(
      {
        cache_key: photoCacheKey(key),
        url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
    if (error) console.warn("[sharedCache] putCachedPhoto error", error.message);
  } catch (err) {
    console.warn("[sharedCache] putCachedPhoto threw", err);
  }
}
