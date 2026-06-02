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
  // Mirror to Capacitor Preferences on native so the bundled
  // `public/offline.html` (which loads from a different origin —
  // `capacitor://localhost` on Android — and therefore can't see
  // this localStorage row) can render the same Saved list when the
  // app cold-starts without internet. Mirroring is fire-and-forget:
  // a failure here doesn't undo the localStorage write that's
  // already succeeded.
  void mirrorSavedToPreferences(items.slice(0, MAX_ITEMS)).catch((err) => {
    console.warn("Saved → Preferences mirror failed", err);
  });
}

/** Slim shape we persist to Capacitor Preferences for offline.html.
 * We DON'T persist `attraction.image_url` blobs / Wikipedia URLs —
 * those re-fetch fine when online, and offline.html doesn't render
 * card thumbnails. The voice + audioId fields are what offline.html
 * needs to locate the cached mp3 on disk via @capacitor/filesystem.
 */
type OfflineSavedItem = {
  id: string;
  name: string;
  language: string;
  voice: string;
  city: string | null;
};

/**
 * One-time backfill on app boot: copies the existing localStorage
 * `tg.saved.v1` into Capacitor Preferences so offline.html can find
 * tours saved BEFORE the Preferences mirror landed. Without this,
 * users with pre-mirror saves would see "Nothing saved yet" on the
 * first offline launch after upgrading. Idempotent — running it
 * after the mirror has already populated Preferences just rewrites
 * the same payload.
 */
export async function backfillSavedToPreferences(): Promise<void> {
  if (!isBrowser()) return;
  try {
    await mirrorSavedToPreferences(getSaved());
  } catch (err) {
    console.warn("Saved backfill failed", err);
  }
}

async function mirrorSavedToPreferences(items: SavedItem[]): Promise<void> {
  // Bridge calls only happen on the native shell. On web there's
  // nothing to mirror to (the same localStorage is the source of
  // truth for /saved.tsx), so we short-circuit.
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { Preferences } = await import("@capacitor/preferences");
  const slim: OfflineSavedItem[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    language: it.language,
    // Voice is stamped onto the attraction at save time when the user
    // tapped the "Save" button — it's how `audioId` reconstructs the
    // Filesystem path. Falls back to the default Georgian voice the
    // app uses on first launch (see Phase 3 spec).
    voice:
      (it.attraction as { voice?: string } | null | undefined)?.voice ?? "ka-GE-EkaNeural",
    city: it.attraction?.city ?? null,
  }));
  await Preferences.set({
    key: "lokali.saved.v1",
    value: JSON.stringify(slim),
  });
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
 * Pull the user's saved_tours rows from Supabase and merge them into
 * localStorage. Restores the Saved tab on a fresh device or after a
 * reinstall — Beka noticed his 4 saved attractions had dropped to 2
 * after the Android-app re-install cycles during dev (every reinstall
 * wipes localStorage, but the cloud rows survive because they're
 * keyed by user_id + tour_slug).
 *
 * Local entries always win the merge: if a slug exists locally, we
 * keep the local copy (which has the full Attraction + script +
 * imageDataUrl), and only ADD cloud-only slugs as thin placeholders.
 * The placeholder has just enough data to render the Saved row and
 * let the user click through — opening the attraction page re-fetches
 * the full details from /api/attractions.
 *
 * Safe to call multiple times (idempotent via the slug dedup). Fires
 * the saved-changed event once at the end so any mounted Saved page
 * re-renders.
 */
export async function hydrateFromCloud(): Promise<void> {
  if (!isBrowser()) return;
  // Bail when offline — Supabase calls throw "TypeError: Failed to
  // fetch" with no network and the noise pollutes the DevTools
  // console (Beka caught this on the /saved tab in the offline mode
  // demo). The mirror will re-run next time auth fires or the app
  // boots online, so skipping here is just a polite cleanup.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user || user.is_anonymous) return;
    const { data, error } = await supabase
      .from("saved_tours")
      .select("tour_slug, tour_title, tour_image_url, tour_duration, tour_rating, created_at")
      .eq("user_id", user.id);
    if (error) {
      console.warn("[savedStore] cloud hydrate failed", error);
      return;
    }
    if (!Array.isArray(data) || data.length === 0) return;
    const local = getSaved();
    const localIds = new Set(local.map((s) => s.id));
    const additions: SavedItem[] = [];
    for (const row of data) {
      const slug = typeof row.tour_slug === "string" ? row.tour_slug : "";
      if (!slug || localIds.has(slug)) continue;
      // Build a minimal Attraction. Opening the attraction page will
      // re-fetch the rich record; this placeholder just needs enough
      // to render the Saved row without crashing.
      const placeholderAttraction = {
        name: row.tour_title || slug,
        ...(typeof row.tour_image_url === "string" && row.tour_image_url
          ? { image_url: row.tour_image_url }
          : {}),
        ...(typeof row.tour_duration === "string" && row.tour_duration
          ? { duration: row.tour_duration }
          : {}),
        ...(typeof row.tour_rating === "number" ? { rating: row.tour_rating } : {}),
      } as unknown as Attraction;
      additions.push({
        id: slug,
        name: row.tour_title || slug,
        language: "en",
        savedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        attraction: placeholderAttraction,
      });
    }
    if (additions.length === 0) return;
    // Merge: cloud-only additions sorted by savedAt descending, then
    // the existing local items (which keep their order). Cap at
    // MAX_ITEMS via writeSaved's slice.
    const merged = [...additions, ...local].sort((a, b) => b.savedAt - a.savedAt);
    writeSaved(merged);
  } catch (err) {
    console.warn("[savedStore] cloud hydrate threw", err);
  }
}

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
