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
  /**
   * Azure voice id (e.g. "ka-GE-EkaNeural", "en-US-JennyNeural") at
   * save time. Stamped onto the saved row so offline.html and the
   * Saved tab can rebuild the audio Filesystem path correctly even
   * when the user later changes their voice preference. Falls back
   * to the language-default voice in mirror code when missing.
   *
   * Beka 2026-06-11 — pre-launch audit caught the chain: voice was
   * never stamped, mirror hard-coded "ka-GE-EkaNeural", so every
   * non-Georgian save built the wrong audio path and offline.html
   * showed "Audio not cached" even when the mp3 was on disk.
   */
  voice?: string;
  /**
   * Whether the audio mp3 has been successfully downloaded to disk
   * for offline playback. Set to true after fetchAndCacheTour
   * resolves OK; set to false when the save happens but the
   * download fails (rate limit, network drop, Azure 5xx).
   *
   * The Saved tab uses this to surface a "Retry download" CTA on
   * rows where audio is missing — without this flag we'd silently
   * sell offline playback that doesn't work, and the user would
   * find out mid-flight.
   */
  audioReady?: boolean;
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
/**
 * Best-effort fetch + base64-encode a remote image URL so it can be
 * stored alongside the SavedItem and rendered offline. Returns null
 * on any failure (CORS, 404, oversized blob, etc.) — the /saved row
 * just falls back to its placeholder glyph in that case.
 *
 * Size cap: 1.2 MB raw bytes. Anything above that would blow the
 * localStorage budget once base64 expands it ~1.33×. Above-cap images
 * are silently dropped, callers see a `null` return and the lookup
 * chain (`item.imageDataUrl || a.image_url || fetched`) skips to the
 * URL fields.
 */
export async function inlineImageAsDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url; // already inline
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  // Strategy 1: direct fetch + base64. Works when the source allows
  // CORS (Wikipedia upload.wikimedia.org does, Google Places photo
  // redirects usually do once they land on lh3.googleusercontent.com).
  if (typeof fetch !== "undefined") {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size <= 1_200_000) {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl) return dataUrl;
        }
      }
    } catch {
      /* fall through to canvas fallback */
    }
  }
  // Strategy 2: <img crossOrigin="anonymous"> + canvas. Same-origin
  // OR CORS-allowed images can be drawn to a canvas and read back.
  // Catches sources whose CORS headers come from the redirect target
  // rather than the initial response (so the fetch saw 0 bytes but
  // the browser's image loader handles the redirect correctly).
  const canvasResult = await canvasInline(url, 1024);
  if (canvasResult) return canvasResult;
  // Strategy 3: server-side proxy. When both the direct fetch AND
  // the canvas approach fail (CORS-tainted redirects, opaque
  // responses), bounce the URL off `/api/image-proxy` which fetches
  // the bytes from the Cloudflare Worker — no CORS rules apply
  // there. Only same-origin /api/image-proxy is hit from the browser
  // so this never trips CORS itself.
  try {
    const proxied = await fetch(
      "/api/image-proxy?url=" + encodeURIComponent(url),
    );
    if (proxied.ok) {
      const blob = await proxied.blob();
      if (blob.size <= 1_200_000) {
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) return dataUrl;
      }
    }
  } catch {
    /* network down — caller falls back to placeholder */
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function canvasInline(url: string, maxWidth: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };
    img.onload = () => {
      try {
        const ratio = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
        const w = Math.round(img.naturalWidth * ratio);
        const h = Math.round(img.naturalHeight * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        cleanup();
        resolve(dataUrl.length > 200 ? dataUrl : null);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Inlines the hero photo into the SavedItem's `imageDataUrl` field
 * AFTER the synchronous save has already returned. The /saved tab
 * paints from the placeholder immediately, then re-renders with the
 * inlined photo when this resolves. Failures are silent — the
 * caller's optimistic save still stands.
 */
export async function attachPhotoToSavedItem(id: string, photoUrl: string | null | undefined) {
  // Demoted to console.debug from console.log per audit — production
  // builds shouldn't spam the console with start/finish lines on
  // every Save tap. Debug stays visible in dev tools when needed.
  console.debug("[lokali] attachPhotoToSavedItem start", { id, photoUrl });
  if (!photoUrl) {
    console.debug("[lokali] attachPhotoToSavedItem: no photoUrl provided");
    return;
  }
  const dataUrl = await inlineImageAsDataUrl(photoUrl);
  if (dataUrl) {
    console.debug("[lokali] attachPhotoToSavedItem: inlined OK", {
      id,
      dataUrlLength: dataUrl.length,
    });
    updateItem(id, { imageDataUrl: dataUrl });
  } else {
    console.debug(
      "[lokali] attachPhotoToSavedItem: all 3 strategies returned null",
      { id, photoUrl },
    );
  }
}

const BACKFILL_FLAG = "tg.saved.backfill.done.v1";

export async function backfillSavedToPreferences(): Promise<void> {
  if (!isBrowser()) return;
  // Run at most once per session. The Preferences mirror is
  // idempotent so a second run isn't harmful, but rewriting the
  // entire saved list on every page mount thrashed the native
  // Preferences plugin (Beka 2026-06-11 audit) and added unnecessary
  // disk traffic during normal navigation.
  try {
    if (sessionStorage.getItem(BACKFILL_FLAG)) return;
    sessionStorage.setItem(BACKFILL_FLAG, "1");
  } catch {
    /* sessionStorage may be disabled — still run, idempotency holds */
  }
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
  // Lazy import of resolveAzureVoice so we get a sensible
  // language-default fallback for pre-fix saves that have no `voice`
  // field on the row.
  const { resolveAzureVoice } = await import("@/lib/azureVoices");
  const slim: OfflineSavedItem[] = items.map((it) => {
    const stampedVoice =
      it.voice ??
      (it.attraction as { voice?: string } | null | undefined)?.voice ??
      "";
    return {
      id: it.id,
      name: it.name,
      language: it.language,
      voice: stampedVoice || resolveAzureVoice(it.language, null) || "ka-GE-EkaNeural",
      city: (it.attraction as { city?: string | null } | null | undefined)?.city ?? null,
    };
  });
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
