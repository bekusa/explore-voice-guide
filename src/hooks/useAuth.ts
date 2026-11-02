import { useSyncExternalStore } from "react";
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
/**
 * Keys that belong to the DEVICE, not the account — kept across sign-out.
 * Beka 2026-10-03.
 *
 * The wipe below used to take every `tg.*` key, which produced two
 * bugs that looked unrelated and were the same mistake:
 *
 *   - Signing out reset the UI language back to English. Beka: "ენის
 *     სეტინგები უნდა იყოს ტელეფონზე ჩამახსოვრებული და არა უზერზე".
 *     Which account you hold doesn't change which language you read.
 *
 *   - Signing out re-armed the notification seed, so the onboarding
 *     tips were re-created and the badge went back to "2" every time.
 *     Beka: "ნოტიფიკეიშენი ლოგაუთზე ახლდება და ისევ 2 ეწერება".
 *
 * The test for this list: would a second person picking up this phone
 * be harmed or confused by the value surviving? Language, theme and
 * "I already saw the welcome tips" are preferences of whoever holds
 * the device. Saved tours, trips, cached guides and audio are the
 * previous USER'S content and must still be wiped.
 */
const DEVICE_SCOPED_KEYS = new Set([
  "tg.lang", // UI + content language
  "tg.theme", // dark / light
  "tg.notifications.v1", // the notification list itself
  "tg.notifications.seeded.v1", // "welcome tips already shown once"
  "tg.attractionHint", // one-off UI coach mark
]);

async function clearAllLocalUserData(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. localStorage — wipe every Lokali key EXCEPT the device-scoped
  //    ones above. We match by prefix rather than enumerating known
  //    keys so future-added caches don't silently leak across users;
  //    the allowlist is the deliberate, reviewed exception to that.
  try {
    const keysToWipe: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (DEVICE_SCOPED_KEYS.has(k)) continue;
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

  // 2. Capacitor Preferences mirror (native only).
  //
  //    This used to call Preferences.clear(), which wiped the whole
  //    namespace. Beka 2026-10-03: that took two things with it that
  //    are NOT the signed-out user's to lose.
  //
  //      lokali.review.v1 — the Play Store review-prompt state. Wiping
  //      it re-arms the prompt, so a user who signs out could be asked
  //      to rate the app a second time. Google's own guidance is to
  //      ask once; asking again is the one behaviour that annoys.
  //
  //      The device preferences mirrored from localStorage (language,
  //      theme) — same reasoning as DEVICE_SCOPED_KEYS above.
  //
  //    So we now remove keys individually and keep that short list.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      const KEEP = new Set([
        "lokali.review.v1",
        "tg.lang",
        "tg.theme",
        "lokali.lang",
        "lokali.theme",
      ]);
      const { keys } = await Preferences.keys();
      for (const k of keys) {
        if (KEEP.has(k)) continue;
        try {
          await Preferences.remove({ key: k });
        } catch {
          /* keep going — one bad key must not abort the sign-out */
        }
      }
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

/* ─── One shared auth store ───────────────────────────────────────
 *
 * Beka 2026-11-02, iPhone: "ქვემოთ მენიუს რომ აჭერ როცა sign in ხარ
 * მენიუს ღილაკები წამიერად ხტუნავს".
 *
 * Every page renders its own MobileFrame, so the TabBar mounts afresh
 * on each tab tap. useAuth() used to keep the session in per-component
 * state that started at `user = null` and only filled in once that
 * mount's own getSession() answered. For that moment the signed-in-only
 * Trips tab was missing: four tabs, then five, and every icon slid
 * sideways. Guests have no Trips tab, which is why only signed-in users
 * saw it. Any other `user`-gated UI flickered the same way.
 *
 * Now there is ONE store for the whole app: one Supabase listener, one
 * getSession(). A component that mounts later reads the answer that is
 * already known, so the TabBar renders right the first time.
 *
 * useSyncExternalStore with a server snapshot keeps hydration safe: the
 * render React hydrates against the server's HTML still sees "no user,
 * loading" (what the server rendered), and React switches to the real
 * session right after. Same reasoning as the #418 fix in useUiLang.
 */
type AuthSnapshot = { session: Session | null; resolved: boolean };

const SERVER_SNAPSHOT: AuthSnapshot = { session: null, resolved: false };
let authSnapshot: AuthSnapshot = SERVER_SNAPSHOT;
const authListeners = new Set<() => void>();
let authStarted = false;

function setAuthSnapshot(next: AuthSnapshot) {
  authSnapshot = next;
  authListeners.forEach((cb) => cb());
}

function startAuthStore() {
  if (authStarted || typeof window === "undefined") return;
  authStarted = true;

  // 1) Subscribe FIRST (avoids missing events during getSession).
  //    Never unsubscribed: it lives as long as the app does.
  supabase.auth.onAuthStateChange((_event, newSession) => {
    setAuthSnapshot({ session: newSession, resolved: true });
  });

  // 2) Then read the existing session.
  //
  // Beka 2026-06-13 — guarded with catch. supabase.auth.getSession()
  // tries to refresh the token by hitting the Supabase REST endpoint;
  // when offline this throws "TypeError: failed to fetch", which used
  // to surface as a visible toast on the Saved page (the offline shell
  // users see). Swallow it, keep whatever we have and stop "loading";
  // the listener above picks up the real session once the network is
  // back.
  supabase.auth
    .getSession()
    .then(({ data }) => {
      setAuthSnapshot({ session: data.session, resolved: true });
    })
    .catch((err) => {
      console.debug("[useAuth] getSession failed (likely offline)", err);
      setAuthSnapshot({ session: authSnapshot.session, resolved: true });
    });
}

function subscribeAuth(cb: () => void) {
  startAuthStore();
  authListeners.add(cb);
  return () => {
    authListeners.delete(cb);
  };
}

export function useAuth() {
  const snap = useSyncExternalStore(
    subscribeAuth,
    () => authSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const session = snap.session;
  const user: User | null = session?.user ?? null;
  const loading = !snap.resolved;

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
