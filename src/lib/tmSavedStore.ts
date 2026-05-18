/**
 * Time Machine save store.
 *
 * Separate from `savedStore` because Time Machine moments are keyed
 * by (attractionId, role) — a user can save "Pompeii — Merchant" and
 * "Pompeii — Soldier" independently — and don't carry the rich
 * Attraction shape (image_url / lat / lng / category) that
 * savedStore expects. Doing both stores via one shape would force
 * synthetic Attraction wrappers everywhere; cleaner to keep them
 * apart at the lib layer and merge in the UI if/when we add a
 * unified Saved tab section.
 *
 * Storage:
 *  - localStorage `tm_saved` — string[] of "${attractionId}::${role}"
 *  - Supabase `saved_tours` — slug `tm-${attractionId}-${role}` so
 *    real attractions and time-machine moments live in one cloud
 *    table without colliding. Fire-and-forget; local always wins.
 */

import { supabase } from "@/integrations/supabase/client";

const KEY = "tm_saved";
const EVENT = "tg:tm-saved-changed";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function tmSavedKey(attractionId: string, role: string): string {
  return `${attractionId}::${role}`;
}

export function tmCloudSlug(attractionId: string, role: string): string {
  return `tm-${attractionId}-${role}`;
}

export function getTmSavedList(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function isTmSaved(attractionId: string, role: string): boolean {
  return getTmSavedList().includes(tmSavedKey(attractionId, role));
}

function write(list: string[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Save (or remove) a time-machine moment. Returns the new "saved"
 * boolean so the caller can update UI state in one line.
 *
 * `displayTitle` is optional — passed through to the Supabase
 * mirror's tour_title field so the row is human-readable from the
 * dashboard. If absent, falls back to the slug.
 */
export function toggleTmSaved(
  attractionId: string,
  role: string,
  displayTitle?: string,
): boolean {
  const key = tmSavedKey(attractionId, role);
  const list = getTmSavedList();
  const willSave = !list.includes(key);
  const next = willSave ? [...list, key] : list.filter((k) => k !== key);
  write(next);
  if (willSave) {
    void syncSaveToCloud(attractionId, role, displayTitle);
  } else {
    void syncRemoveFromCloud(attractionId, role);
  }
  return willSave;
}

/** Subscribe to TM-save changes (cross-tab via storage event,
 *  same-tab via the custom event we dispatch on every write). */
export function onTmSavedChange(cb: () => void): () => void {
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

/* ───────── Supabase mirror helpers ─────────────────────────────── */

async function syncSaveToCloud(
  attractionId: string,
  role: string,
  displayTitle?: string,
): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    // Same posture as savedStore: real (non-anonymous) users only,
    // because anonymous UIDs vanish on sign-out and would leave
    // orphan rows we can never link back.
    if (!user || user.is_anonymous) return;
    const slug = tmCloudSlug(attractionId, role);
    const { error } = await supabase.from("saved_tours").upsert(
      {
        user_id: user.id,
        tour_slug: slug,
        tour_title: displayTitle ?? slug,
      },
      { onConflict: "user_id,tour_slug" },
    );
    if (error) console.warn("[tmSavedStore] cloud mirror failed", error);
  } catch (err) {
    console.warn("[tmSavedStore] cloud mirror threw", err);
  }
}

async function syncRemoveFromCloud(attractionId: string, role: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user || user.is_anonymous) return;
    const slug = tmCloudSlug(attractionId, role);
    const { error } = await supabase
      .from("saved_tours")
      .delete()
      .eq("user_id", user.id)
      .eq("tour_slug", slug);
    if (error) console.warn("[tmSavedStore] cloud delete failed", error);
  } catch (err) {
    console.warn("[tmSavedStore] cloud delete threw", err);
  }
}
