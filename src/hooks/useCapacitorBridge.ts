import { useEffect } from "react";
import type { Router } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Native-platform bridge for the Capacitor-wrapped Android/iOS app.
 *
 * Two listeners get wired up:
 *
 *  1) **Hardware back button** (Android only — iOS has no system back).
 *     Default WebView behaviour swallows the back press and dumps the
 *     user out of the app entirely, which is jarring for anyone who
 *     just opened a deep page like /attraction/$id. We hook the event
 *     and walk TanStack Router's history first; only when there's
 *     nothing left to go back to do we let the app exit. This mirrors
 *     how native Android apps behave (Instagram, Maps, Spotify all do
 *     the same).
 *
 *  2) **OAuth deep-link handler** (`appUrlOpen`).
 *     Supabase's Google OAuth flow ends with a redirect to
 *     `com.lokali.app://auth/callback?code=…`. The intent filter in
 *     AndroidManifest.xml catches the scheme and re-launches the app;
 *     Capacitor fires `appUrlOpen` with the full URL. We pull the
 *     `code` out of the query string and call
 *     `supabase.auth.exchangeCodeForSession`, which finalises the
 *     session inside the WebView so React picks it up via
 *     onAuthStateChange. Without this, OAuth on mobile would dead-end
 *     on a Chrome page that can't open the scheme.
 *
 * Both listeners are no-ops on the web — `Capacitor.isNativePlatform()`
 * gates the import so the @capacitor/app module isn't even loaded in
 * the browser bundle's hot path.
 */
export function useCapacitorBridge(router: Router) {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      // Dynamic import so the browser bundle skips Capacitor code
      // entirely. The @capacitor/core check + the platform guard
      // mean we only pull @capacitor/app on a real device.
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      if (cancelled) return;

      const { App } = await import("@capacitor/app");

      // ─── Hardware back button (Android) ────────────────────────
      const backHandle = await App.addListener("backButton", () => {
        // Walk the router's history. If the user has somewhere to go
        // back to (anything other than the entry-point /), let them.
        // history.canGoBack() is the most reliable signal across
        // TanStack Router versions; window.history.length is a
        // browser-y proxy that can mis-fire on a fresh launch.
        const canGoBack =
          typeof window !== "undefined" && window.history.length > 1;
        if (canGoBack) {
          router.history.back();
          return;
        }
        // No history → exit app. CapacitorApp.exitApp is a no-op on
        // iOS (Apple disallows programmatic exit) and works as
        // expected on Android (returns to home screen).
        void App.exitApp();
      });

      // ─── OAuth deep-link handler ───────────────────────────────
      const urlHandle = await App.addListener("appUrlOpen", (event) => {
        // event.url is the full deep link, e.g.
        // "com.lokali.app://auth/callback?code=abc123&state=xyz"
        try {
          const url = new URL(event.url);
          // Only handle our own auth callbacks; ignore any other deep
          // links (future share-link openers, push-notification
          // payloads, etc. — they get routed differently).
          if (!url.pathname.includes("/auth/callback")) return;
          const code = url.searchParams.get("code");
          if (!code) return;
          // exchangeCodeForSession is idempotent — if the session was
          // already established by Supabase's own client (which can
          // happen if the WebView captured the redirect through a
          // different path), the call resolves cleanly without
          // breaking the existing session.
          void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
            if (error) {
              // Surfacing as console.error rather than a toast — the
              // common path is success, and a toast on every cold
              // OAuth landing would be noisy for the happy case.
              // The /auth page already handles auth state changes.
              console.error("[OAuth] exchangeCodeForSession failed", error);
            } else {
              // Navigate to / so the user lands on home post-auth
              // rather than the empty deep-link path the WebView
              // resolved to.
              router.navigate({ to: "/" });
            }
          });
        } catch (err) {
          console.error("[OAuth] appUrlOpen parse failed", err);
        }
      });

      cleanup = () => {
        void backHandle.remove();
        void urlHandle.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);
}
