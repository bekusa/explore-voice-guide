/**
 * Local offline store for saved attractions + their narrated guide scripts.
 *
 * Why localStorage: works fully offline, no backend round-trip, persists
 * across sessions, and survives airplane mode — exactly what the Saved tab
 * needs. Capped at ~50 items to stay well under the 5MB localStorage budget.
 *
 * Cloud mirror: when the user is signed in we ALSO mirror every save
 * into Supabase's `saved_tours` table (UNIQUE on user_id + tour_slug),
 * so the same tour list re-hydrates on any device the user signs in
 * on. Local writes win — the Supabase calls are fire-and-forget so
 * a flaky network never blocks the save. See `syncSaveToCloud` /
 * `syncRemoveFromCloud` for the mirror logic.
 */

import type { Attraction } from "./api";
import { supabase } from "@/integrations/supabase/client";

export type SavedItem = {
  id: string; // attractionSlug(name)
  name: string;
  language: string;
  savedAt: number;
  attraction: Attraction;
  script?: string; // narrated guide text, cached for offline playback
  imageDataUrl?: string; // optional inlined hero image (base64)
};

const KEY = "tg.saved.v1";
const MAX_ITEMS = 50;
const EVENT = "tg:saved-changed";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getSaved(): SavedItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaved(items: SavedItem[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch (err) {
    // QuotaExceeded — drop oldest and retry once
    if (items.length > 1) {
      try {
        localStorage.setItem(KEY, JSON.stringify(items.slice(0, items.length - 1)));
        window.dispatchEvent(new CustomEvent(EVENT));
      } catch {
        console.warn("Saved store full", err);
      }
    }
  }
}

export function isSaved(id: string): boolean {
  return getSaved().some((s) => s.id === id);
}

export function saveItem(item: SavedItem) {
  const list = getSaved().filter((s) => s.id !== item.id);
  list.unshift(item);
  writeSaved(list);
  // Mirror to Supabase saved_tours on a best-effort basis. No await
  // — local save already happened, the user got a "saved" toast, and
  // a transient network failure shouldn't block the UX. The next
  // signed-in app boot (or an explicit re-save) will re-attempt.
  void syncSaveToCloud(item);
}

export function updateItem(id: string, patch: Partial<SavedItem>) {
  const list = getSaved();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  writeSaved(list);
  // If the patch touched display fields the cloud row mirrors,
  // re-sync. We re-send the whole row rather than diffing — the
  // upstream table is tiny and the upsert is idempotent.
  void syncSaveToCloud(list[idx]);
}

export function removeItem(id: string) {
  writeSaved(getSaved().filter((s) => s.id !== id));
  void syncRemoveFromCloud(id);
}

export function clearAll() {
  // Snapshot ids BEFORE we wipe local so the cloud cleanup below has
  // something to iterate over.
  const ids = getSaved().map((s) => s.id);
  writeSaved([]);
  void Promise.all(ids.map((id) => syncRemoveFromCloud(id))).catch(() => {});
}

/* ───────── Supabase mirror helpers ─────────────────────────────── */

/**
 * Mirror a save into saved_tours when the user has a session.
 * Anonymous + signed-out users skip the call (anon users don't have
 * a profile yet, and `user_id = null` would violate the FK to
 * auth.users anyway). Fire-and-forget.
 */
async function syncSaveToCloud(item: SavedItem): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    // Anonymous users have a row in auth.users so the FK would
    // satisfy, but they have no UID they can recover after sign-out
    // — mirroring their saves would just orphan rows we can't link
    // to anyone. Real (email/OAuth) users only.
    if (!user || user.is_anonymous) return;
    const rating =
      typeof item.attraction.rating === "number" ? item.attraction.rating : null;
    const imageUrl =
      typeof item.attraction.image_url === "string" ? item.attraction.image_url : null;
    const duration =
      typeof item.attraction.duration === "string" ? item.attraction.duration : null;
    // UPSERT (UNIQUE constraint on user_id + tour_slug). Re-saving
    // the same tour just refreshes the title / image fields without
    // creating a duplicate row.
    const { error } = await supabase.from("saved_tours").upsert(
      {
        user_id: user.id,
        tour_slug: item.id,
        tour_title: item.name,
        tour_image_url: imageUrl,
        tour_duration: duration,
        tour_rating: rating,
      },
      { onConflict: "user_id,tour_slug" },
    );
    if (error) console.warn("[savedStore] cloud mirror failed", error);
  } catch (err) {
    console.warn("[savedStore] cloud mirror threw", err);
  }
}

/**
 * Remove a saved row from saved_tours. Same anon/signed-out guard
 * as the save path.
 */
async function syncRemoveFromCloud(slug: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user || user.is_anonymous) return;
    const { error } = await supabase
      .from("saved_tours")
      .delete()
      .eq("user_id", user.id)
      .eq("tour_slug", slug);
    if (error) console.warn("[savedStore] cloud delete failed", error);
  } catch (err) {
    console.warn("[savedStore] cloud delete threw", err);
  }
}

/** Subscribe to changes (cross-tab via storage event, same-tab via custom). */
export function onSavedChange(cb: () => void): () => void {
  if (!isBrowser()) return () => {};
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const custom = () => cb();
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, custom);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, custom);
  };
}
