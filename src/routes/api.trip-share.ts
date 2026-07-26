/**
 * GET /api/trip-share?sid=<share_id>
 *
 * Public read endpoint behind the /t/{share_id} viewer page (Trips
 * Phase 5). The trips tables are RLS-locked to their owners, so the
 * anonymous viewer can't read them directly — this route reads with
 * the service role (same EXTERNAL_* env pair sharedCache.server.ts
 * uses) and returns a SANITISED projection:
 *   - resolves ONLY by share_id (unguessable 20-char token; a trip
 *     with share_id NULL is simply not shared → 404),
 *   - never returns user_id, trip id, or item ids — nothing in the
 *     payload links back to an account or enables writes.
 *
 * Cacheable: shared trips change rarely; 60 s CDN cache keeps
 * repeated opens of a popular link off Postgres.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { corsJson, corsPreflight } from "@/lib/cors.server";

function serviceDb() {
  if (typeof process === "undefined") return null;
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SharedTripPayload = {
  name: string;
  start_date: string | null;
  end_date: string | null;
  cover_url: string | null;
  items: Array<{
    slug: string;
    name: string;
    city: string | null;
    image_url: string | null;
    lat: number | null;
    lng: number | null;
    day_index: number;
    position: number;
  }>;
};

export const Route = createFileRoute("/api/trip-share")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sid = (url.searchParams.get("sid") || "").trim();
        // Token shape gate — cheap rejection of junk/enumeration
        // probes before any DB round-trip.
        if (!/^[a-z0-9]{16,32}$/.test(sid)) {
          return corsJson({ error: "not-found" }, { status: 404 });
        }

        const db = serviceDb();
        if (!db) {
          console.warn("[api.trip-share] service credentials missing");
          return corsJson({ error: "unavailable" }, { status: 503 });
        }

        const { data: trip, error } = await db
          .from("trips")
          .select("id,name,start_date,end_date,cover_url")
          .eq("share_id", sid)
          .maybeSingle();
        if (error) {
          console.warn("[api.trip-share] trip lookup failed", error.message);
          return corsJson({ error: "unavailable" }, { status: 503 });
        }
        if (!trip) {
          return corsJson({ error: "not-found" }, { status: 404 });
        }

        const { data: items, error: itemsErr } = await db
          .from("trip_items")
          .select("attraction_slug,name,city,image_url,lat,lng,day_index,position")
          .eq("trip_id", trip.id)
          .order("day_index", { ascending: true })
          .order("position", { ascending: true });
        if (itemsErr) {
          console.warn("[api.trip-share] items lookup failed", itemsErr.message);
          return corsJson({ error: "unavailable" }, { status: 503 });
        }

        const payload: SharedTripPayload = {
          name: trip.name as string,
          start_date: (trip.start_date as string | null) ?? null,
          end_date: (trip.end_date as string | null) ?? null,
          cover_url: (trip.cover_url as string | null) ?? null,
          items: (items ?? []).map((i) => ({
            slug: i.attraction_slug as string,
            name: i.name as string,
            city: (i.city as string | null) ?? null,
            image_url: (i.image_url as string | null) ?? null,
            lat: typeof i.lat === "number" ? i.lat : null,
            lng: typeof i.lng === "number" ? i.lng : null,
            day_index: (i.day_index as number) ?? 0,
            position: (i.position as number) ?? 0,
          })),
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            // Short CDN cache — enough to absorb a link going around
            // a group chat, short enough that unsharing propagates
            // within a minute.
            "Cache-Control": "public, max-age=60",
          },
        });
      },
    },
  },
});
