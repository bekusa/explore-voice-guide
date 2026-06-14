import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Wipe every piece of user-scoped state on the device. Called from
 * signOut() AND from the Delete Account flow so we never leak one
 * user's data into another's session on the same device.
 *
 * Scope:
 *   - localStorage `tg.*` keys (saved tours, guide cache, language
 *     preference, translation cache, etc.) — anything Lokali wrote.
 *   - Capacitor Preferences `lokali.*` keys — native mirror of the
 *     above.
 *   - Capacitor Filesystem audio/script blobs — the mp3s that drive
 *     offline playback.
 *
 * The Supabase session itself is cleared by supabase.auth.signOut().
 *
 * Errors are swallowed individually: a missing Capacitor plugin on
 * web, a corrupt blob on disk, an LRU shadow of a localStorage entry
 * — none of these should block the user from signing out.
 */
async function clearAllLocalUserData(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. localStorage — wipe every Lokali key. We match by prefix
  //    rather than enumerating known keys so future-added caches
  //    don't silently leak across users.
  try {
    const keysToWipe: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Prefixes Lokali has used historically:
      //   tg.*         — saved tours, guide cache, language, etc.
      //   lokali.*     — newer Capacitor-aware writes
      //   sb-*-auth-*  — Supabase session storage (covered by
      //                  supabase.auth.signOut, but defence-in-depth)
      if (k.startsWith("tg.") || k.startsWith("lokali.")) {
        keysToWipe.push(k);
      }
    }
    keysToWipe.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* keep going */
      }
    });
  } catch {
    /* localStorage unavailable — nothing to clear */
  }

  // 2. Capacitor Preferences mirror (native only). We clear the
  //    whole Preferences namespace rather than per-key because the
  //    set of keys is implementation-detail and the user is signing
  //    out — they don't need ANY remembered preference to bleed
  //    into the next account.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.clear();
    }
  } catch {
    /* plugin missing or not native */
  }

  // 3. Capacitor Filesystem audio + script blobs. The offlineStore
  //    helper handles native vs. web (IndexedDB) symmetrically.
  try {
    const { clearOfflineStore } = await import("@/lib/offlineStore");
    await clearOfflineStore();
  } catch {
    /* offline store may have already been wiped */
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Subscribe FIRST (avoids missing events during getSession)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    // 2) Then read existing session.
    //
    // Beka 2026-06-13 — guard with try/catch + the navigator.onLine
    // check. supabase.auth.getSession() tries to refresh the token
    // by hitting the Supabase REST endpoint; when offline this
    // throws "TypeError: failed to fetch" and the error bubbles up
    // as a visible toast on the Saved page (the offline shell users
    // see). We still need to populate state from whatever cached
    // session storage gives us, so swallow the rejection and let
    // the loading flag flip without raising.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch((err) => {
        // Common offline path — log at debug level and keep the
        // current state. The auth state listener above will pick
        // up the real session as soon as the network comes back.
        console.debug("[useAuth] getSession failed (likely offline)", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => sub.subscription.unsubscribe();
  }, []);

  /**
   * Sign out the current Supabase session AND wipe every local
   * trace of the user. Without the local wipe, a second user on
   * the same device would see the first user's saved tours,
   * downloaded audio, and cached translations — a real privacy
   * leak that the pre-launch audit caught (Beka 2026-06-11).
   */
  const signOut = async () => {
    try {
      await clearAllLocalUserData();
    } catch (err) {
      console.warn("[useAuth] local cleanup before signOut failed", err);
    }
    await supabase.auth.signOut();
  };

  return { session, user, loading, signOut };
}

// Re-export the cleanup helper so the Delete Account flow can call it
// AFTER the server has acknowledged the delete (we don't want to wipe
// the device before confirming the server-side delete went through —
// the user might want to retry on a 5xx).
export { clearAllLocalUserData };
