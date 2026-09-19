/**
 * Guide ratings — the user's own 1-5 star verdict on a generated guide.
 * Beka 2026-09-19. Table + RLS: `*_guide_ratings.sql`.
 *
 * WHAT THIS IS FOR
 *   We have 13,704 cached guides and no idea which are good. Every
 *   quality bug so far was caught by Beka reading one by hand. Stars
 *   make guide quality measurable, and they are the honest gate for
 *   the Play Store review prompt: we only ask people who just told us
 *   the guide was good.
 *
 * DESIGN NOTES
 *  - Rates the GUIDE, not the place. The key is the guide's cache
 *    identity (name + city + language), so a bad Georgian guide for a
 *    place whose English guide is fine shows up as exactly that.
 *  - Works for ANONYMOUS users. The app signs guests in anonymously,
 *    so auth.uid() exists and owner-only RLS applies. Requiring a real
 *    account would discard most of the feedback.
 *  - Fails silently. A rating is a nice-to-have; it must never
 *    interrupt reading a guide. Every function swallows errors and
 *    returns a boolean / null.
 *  - ONLINE ONLY, same call as Trips. No offline queue: an unsent
 *    rating is worth less than the complexity of syncing it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
// Client-safe copies of the cache normalisers. NOT imported from
// sharedCache.server.ts — that module pulls in the service-role key.
// Both sides now share one definition in cacheKey.ts, so the key this
// builds is byte-identical to the one cached_guides was stored under.
import { normalizeName, normalizeLang } from "@/lib/cacheKey";

/**
 * Same widening cast the Trips store uses, for the same reason: the
 * Lovable-generated Database type only knows profiles/saved_tours and
 * gets regenerated over any hand edit. Re-narrowed through the
 * explicit row shapes below.
 */
const db = supabase as unknown as SupabaseClient;

export type GuideRating = {
  stars: number;
  comment: string | null;
};

/**
 * Build the key that identifies the guide being rated.
 *
 * Deliberately mirrors the cached_guides key shape (normalised name +
 * city + language) so a rating row can be traced back to the exact
 * cached guide that produced it. If that key shape ever changes,
 * change it here too or the join silently stops matching.
 */
export function guideRatingKey(args: {
  name: string;
  city?: string | null;
  language: string;
}): string {
  return [
    normalizeName(args.name),
    normalizeName(args.city ?? ""),
    normalizeLang(args.language),
  ].join("|");
}

/** Current user id, or null when there is no session at all. */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user's existing rating for this guide, or null.
 * Used to pre-fill the stars so a returning reader sees their own
 * verdict rather than an empty widget.
 */
export async function getMyRating(guideKey: string): Promise<GuideRating | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await db
      .from("guide_ratings")
      .select("stars, comment")
      .eq("user_id", userId)
      .eq("guide_key", guideKey)
      .maybeSingle();
    if (error || !data) return null;
    return { stars: Number(data.stars), comment: (data.comment as string) ?? null };
  } catch {
    return null;
  }
}

/**
 * Insert or update the user's rating. Returns true on success.
 *
 * Upsert on (user_id, guide_key) — the table's UNIQUE constraint —
 * so changing your mind replaces your vote instead of stacking a
 * second one. Without that a single user could move a guide's
 * average on their own.
 */
export async function submitRating(args: {
  guideKey: string;
  stars: number;
  comment?: string | null;
  attractionName?: string | null;
  city?: string | null;
  language?: string | null;
}): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;

  // Clamp rather than reject: a UI bug sending 0 or 7 should degrade
  // to a valid vote, not throw a CHECK-constraint error at the user.
  const stars = Math.min(5, Math.max(1, Math.round(args.stars)));
  const comment = (args.comment ?? "").trim().slice(0, 500) || null;

  try {
    const { error } = await db.from("guide_ratings").upsert(
      {
        user_id: userId,
        guide_key: args.guideKey,
        stars,
        comment,
        attraction_name: args.attractionName ?? null,
        city: args.city ?? null,
        language: args.language ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,guide_key" },
    );
    if (error) {
      console.warn("[ratings] submit failed", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[ratings] submit threw", err);
    return false;
  }
}
