/**
 * Trips — Supabase-backed travel collections (Phase 1, Beka's spec
 * agreed 2026-07-25).
 *
 * Design decisions (from the spec):
 *  - SIGNED-IN ONLY. No localStorage tier: the `trips` / `trip_items`
 *    tables are the single source of truth, protected by owner-only
 *    RLS (see supabase migration `trips_feature_phase1`). Guests keep
 *    using the existing Saved tab — Trips is the planning layer on
 *    top, not a replacement.
 *  - ONLINE ONLY, by explicit decision ("Offline ნუ იმუშავებს — არაა
 *    პრობლემა"). No Preferences/Filesystem mirror here. Do not add
 *    one without revisiting the offline.html contract.
 *  - All calls go through the ANON client with the user's session
 *    (RLS enforces ownership) — same pattern savedStore's cloud
 *    mirror uses. No service-role anywhere near the client bundle.
 *
 * Phase 2 adds item CRUD (addPlaceToTrip / listTripItems / …);
 * Phase 5 adds share_id management. Keep those here so every Trips
 * data access lives in one file.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The generated Database type (src/integrations/supabase/types.ts)
 * is Lovable-managed and only lists profiles/saved_tours — it doesn't
 * know the new trips/trip_items tables, and hand-editing that file
 * gets overwritten on Lovable's next regeneration. So this store
 * widens the client to the untyped schema ONCE, and re-narrows every
 * result through the explicit TripRow/Trip shapes below. When the
 * generated types eventually include the trips tables, delete this
 * cast and the file stays otherwise unchanged.
 */
const db = supabase as unknown as SupabaseClient;

export type Trip = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  share_id: string | null;
  cover_url: string | null;
  created_at: string;
  /** Denormalised count from trip_items — display only. */
  itemCount: number;
};

/** Shape of the joined count Supabase returns for `trip_items(count)`. */
type TripRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  share_id: string | null;
  cover_url: string | null;
  created_at: string;
  trip_items: Array<{ count: number }> | null;
};

function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    share_id: row.share_id,
    cover_url: row.cover_url,
    created_at: row.created_at,
    itemCount: row.trip_items?.[0]?.count ?? 0,
  };
}

/**
 * Current user's trips, newest first. Throws on network/RLS errors —
 * the page shows a retry state (unlike savedStore, there is no local
 * fallback tier to silently degrade to, and pretending an empty list
 * is "no trips" when the fetch actually failed would read as data
 * loss to the user).
 */
export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await db
    .from("trips")
    .select("id,name,start_date,end_date,share_id,cover_url,created_at,trip_items(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TripRow[]).map(rowToTrip);
}

export async function getTrip(id: string): Promise<Trip | null> {
  const { data, error } = await db
    .from("trips")
    .select("id,name,start_date,end_date,share_id,cover_url,created_at,trip_items(count)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToTrip(data as TripRow) : null;
}

export async function createTrip(args: {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<Trip> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error("not-signed-in");
  const { data, error } = await db
    .from("trips")
    .insert({
      user_id: user.id,
      name: args.name.trim().slice(0, 120),
      start_date: args.startDate || null,
      end_date: args.endDate || null,
    })
    .select("id,name,start_date,end_date,share_id,cover_url,created_at")
    .single();
  if (error) throw new Error(error.message);
  return rowToTrip({ ...(data as Omit<TripRow, "trip_items">), trip_items: [] });
}

export async function renameTrip(id: string, name: string): Promise<void> {
  const { error } = await db
    .from("trips")
    .update({ name: name.trim().slice(0, 120), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Delete a trip. trip_items cascade in the database; the places
 * themselves (Saved entries, offline downloads) are untouched — a
 * trip is a grouping, not ownership, and the delete-confirm copy
 * says exactly that.
 */
export async function deleteTrip(id: string): Promise<void> {
  const { error } = await db.from("trips").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ─── Trip items (Phase 2) ─────────────────────────────────────── */

export type TripItem = {
  id: string;
  trip_id: string;
  attraction_slug: string;
  name: string;
  city: string | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  day_index: number;
  position: number;
  note: string | null;
};

export async function listTripItems(tripId: string): Promise<TripItem[]> {
  const { data, error } = await db
    .from("trip_items")
    .select("id,trip_id,attraction_slug,name,city,image_url,lat,lng,day_index,position,note")
    .eq("trip_id", tripId)
    .order("day_index", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripItem[];
}

/**
 * Add a place to a trip. Duplicate adds (same slug, same trip) are a
 * no-op thanks to the UNIQUE(trip_id, attraction_slug) constraint —
 * Postgres raises 23505 and we swallow exactly that code, so a user
 * double-tapping the same trip chip never sees an error.
 *
 * Side-effect: the first item to land in a trip becomes its cover
 * (cover_url) when the trip doesn't have one yet — cheap way to give
 * every trip card a real photo without a separate "pick cover" UI.
 */
export async function addPlaceToTrip(
  tripId: string,
  place: {
    slug: string;
    name: string;
    city?: string | null;
    imageUrl?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<"added" | "already"> {
  const { error } = await db.from("trip_items").insert({
    trip_id: tripId,
    attraction_slug: place.slug,
    name: place.name.slice(0, 300),
    city: place.city ?? null,
    image_url: place.imageUrl ?? null,
    lat: typeof place.lat === "number" ? place.lat : null,
    lng: typeof place.lng === "number" ? place.lng : null,
  });
  if (error) {
    if (error.code === "23505") return "already";
    throw new Error(error.message);
  }
  if (place.imageUrl) {
    // Best-effort cover backfill — never block the add on it.
    try {
      await db
        .from("trips")
        .update({ cover_url: place.imageUrl })
        .eq("id", tripId)
        .is("cover_url", null);
    } catch {
      /* cover stays placeholder */
    }
  }
  return "added";
}

export async function removeTripItem(itemId: string): Promise<void> {
  const { error } = await db.from("trip_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

/* ─── Day plan (Phase 3) ───────────────────────────────────────── */

/**
 * Move an item to a day (0 = the "anytime" bucket). Position is set
 * to the end of the target day; the caller's optimistic local state
 * already reflects the move, so we don't re-fetch here.
 */
export async function moveTripItemToDay(
  itemId: string,
  dayIndex: number,
  position: number,
): Promise<void> {
  const { error } = await db
    .from("trip_items")
    .update({ day_index: Math.max(0, dayIndex), position: Math.max(0, position) })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

/**
 * Persist a day's manual ordering after a drag. One small UPDATE per
 * row — trips are tens of items at most, and PostgREST has no batch
 * UPDATE; sequential keeps it simple and the UI is already
 * optimistic so latency here is invisible.
 */
export async function persistDayOrder(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .from("trip_items")
      .update({ position: i })
      .eq("id", orderedIds[i]);
    if (error) throw new Error(error.message);
  }
}

/* ─── Sharing (Phase 5) ────────────────────────────────────────── */

/**
 * Unguessable URL token. 20 chars of crypto-random base36 ≈ 103 bits
 * — not enumerable. Generated CLIENT-side and written through the
 * owner's RLS-protected update, so enabling a share needs no server
 * round-trip; the public read path (/api/trip-share) is the only
 * service-role consumer.
 */
function makeShareId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += (b % 36).toString(36);
  return out.slice(0, 20).padEnd(20, "0");
}

/** Enable sharing (idempotent) — returns the trip's share id. */
export async function shareTrip(id: string): Promise<string> {
  const existing = await getTrip(id);
  if (existing?.share_id) return existing.share_id;
  const sid = makeShareId();
  const { error } = await db.from("trips").update({ share_id: sid }).eq("id", id);
  if (error) throw new Error(error.message);
  return sid;
}

/** Disable sharing — the public /t/{sid} link stops resolving. */
export async function unshareTrip(id: string): Promise<void> {
  const { error } = await db.from("trips").update({ share_id: null }).eq("id", id);
  if (error) throw new Error(error.message);
}
