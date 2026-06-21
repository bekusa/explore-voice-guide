import { useEffect } from "react";
import type { AnyRouter } from "@tanstack/react-router";
import { toast } from "sonner";
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
export function useCapacitorBridge(router: AnyRouter) {
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
        //
        // Beka 2026-06-11 audit refinement — three guards instead of
        // one. window.history.length is a flaky signal: a cold
        // OAuth deep-link leaves length=2 (the empty entry +
        // /auth/callback) but the user clearly wants to exit, not
        // "go back" into the now-defunct callback page. We add:
        //   1. Bail-to-exit when we're on the home route, regardless
        //      of history length. "/" is the de-facto launcher route.
        //   2. Bail-to-exit when the current path matches the
        //      OAuth callback (the user just came from auth and the
        //      page redirected them somewhere; back shouldn't trap
        //      them in the redirected-from page).
        //   3. Otherwise use history.length > 1 as before.
        const path =
          typeof window !== "undefined" ? window.location.pathname : "/";
        const isHome = path === "/" || path === "";
        const isCallback = path.includes("/auth/callback");
        const canGoBack =
          typeof window !== "undefined" && window.history.length > 1;
        if (!isHome && !isCallback && canGoBack) {
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
        // (PKCE flow) or
        // "com.lokali.app://auth/callback#access_token=...&refresh_token=..."
        // (implicit flow). We handle both because Supabase has been
        // known to switch defaults across versions.
        // 2026-06-21 — toast diagnostics because release builds have
        // webContentsDebuggingEnabled=false, which makes console.warn
        // invisible in logcat. Toasts surface live on screen so Beka
        // can see exactly what the deep-link handler observed. Remove
        // these once the OAuth path is stable.
        toast.info(`appUrlOpen: ${event.url.slice(0, 60)}…`, { duration: 8000 });
        console.warn("[OAuth] appUrlOpen received:", event.url);
        try {
          const url = new URL(event.url);
          // Only handle our own auth callbacks; ignore any other deep
          // links (future share-link openers, push-notification
          // payloads, etc. — they get routed differently).
          //
          // Custom-scheme URLs parse weirdly: for
          //   com.lokali.app://auth/callback#access_token=...
          // the URL parser treats "auth" as the HOST and "/callback"
          // as the pathname — NOT the joined "/auth/callback" we'd
          // get from a normal https URL. So we check the raw URL
          // string for "auth/callback" instead of relying on
          // url.pathname; that's tolerant of both quirks.
          if (!event.url.includes("auth/callback")) {
            toast.warning(`Ignored deep link, host=${url.host} pathname=${url.pathname}`, { duration: 6000 });
            console.warn("[OAuth] ignored — host=", url.host, "pathname=", url.pathname);
            return;
          }

          // Close the Chrome Custom Tab that auth.tsx opened for the
          // OAuth flow. Without this the tab stays floating over the
          // app after the deep link fires. Fire-and-forget — failures
          // are non-fatal (Browser.close throws if no tab is open).
          void (async () => {
            try {
              const { Browser } = await import("@capacitor/browser");
              await Browser.close();
            } catch {
              // ignore — tab was already closed by the user, or the
              // plugin wasn't ever opened (web flow shouldn't reach
              // here, but be defensive).
            }
          })();

          // ── PATH 1 — PKCE flow (?code=... in query) ──
          const code = url.searchParams.get("code");
          if (code) {
            toast.info("PKCE code received, exchanging…", { duration: 6000 });
            console.warn("[OAuth] PKCE code present, exchanging...");
            void supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
              if (error) {
                toast.error(`Exchange failed: ${error.message}`, { duration: 12000 });
                console.error("[OAuth] exchangeCodeForSession failed:", error.message ?? error);
              } else {
                toast.success(`Signed in: ${data.session?.user?.email ?? "ok"}`, { duration: 4000 });
                console.warn("[OAuth] exchangeCodeForSession success, user:", data.session?.user?.email);
                router.navigate({ to: "/" });
              }
            });
            return;
          }

          // ── PATH 2 — Implicit flow (#access_token=... in fragment) ──
          // Supabase shipped some versions where mobile OAuth uses
          // implicit instead of PKCE; URL.searchParams doesn't read
          // the fragment, so we parse it manually.
          const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
          if (fragment) {
            const params = new URLSearchParams(fragment);
            const accessToken = params.get("access_token");
            const refreshToken = params.get("refresh_token");
            if (accessToken && refreshToken) {
              toast.info("Implicit tokens, setting session…", { duration: 6000 });
              console.warn("[OAuth] Implicit tokens present, setting session...");
              void supabase.auth
                .setSession({ access_token: accessToken, refresh_token: refreshToken })
                .then(({ data, error }) => {
                  if (error) {
                    toast.error(`setSession failed: ${error.message}`, { duration: 12000 });
                    console.error("[OAuth] setSession failed:", error.message ?? error);
                  } else {
                    toast.success(`Signed in: ${data.session?.user?.email ?? "ok"}`, { duration: 4000 });
                    console.warn("[OAuth] setSession success, user:", data.session?.user?.email);
                    router.navigate({ to: "/" });
                  }
                });
              return;
            }
          }

          // Neither code nor tokens — Supabase may have sent us an
          // error. Most common: redirect_uri mismatch.
          const oauthError = url.searchParams.get("error") || url.hash || "(empty)";
          toast.error(`No code/token. error=${oauthError.slice(0, 80)}`, { duration: 12000 });
          console.error("[OAuth] callback had no code or tokens. url=", event.url, "error=", oauthError);
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
