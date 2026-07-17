import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useT } from "@/hooks/useT";
import { useCapacitorBridge } from "@/hooks/useCapacitorBridge";
import { capturePageview, identifyUser, resetAnalytics } from "@/lib/analytics";

import appCss from "../styles.css?url";

// Theme boot script — runs before React hydrates so the light-theme
// flash is suppressed on first paint. The matching lang boot script
// underneath sets <html lang> from the stored language so screen
// readers + Lighthouse pick up the right BCP-47 code immediately
// (the SSR shell ships lang="en" because we don't know the user's
// preference at SSR time; the script overrides it client-side).
const themeBootScript = `(function(){try{var t=localStorage.getItem('tg.theme');if(t==='light'){document.documentElement.classList.add('light');}var l=localStorage.getItem('tg.lang');if(l){document.documentElement.setAttribute('lang',l);}}catch(e){}})();`;

// PostHog loader snippet — the official queuing stub. It installs
// `window.posthog` synchronously (so calls made before the real
// library downloads are queued, not lost), then async-loads
// array.js from the US-cloud assets host and calls init().
//
// Config notes:
//   - api_host us.i.posthog.com — project region is US Cloud.
//   - capture_pageview:false — we drive $pageview ourselves from the
//     router's onResolved event (see RootComponent); this is a SPA,
//     so the automatic load-time pageview would under-count.
//   - capture_pageleave:true — gives us session duration + bounce.
//   - person_profiles:'identified_only' — anonymous visitors are
//     still counted as events (DAU works), but no person profile is
//     created until identify() runs at sign-in. Keeps us well inside
//     the 1M-events/month free tier.
//   - respect_dnt:true — honour Do-Not-Track; GDPR-friendly for EU
//     travellers even though the project lives in US Cloud.
//
// The project API key below is a PUBLIC, write-only key: it can send
// events but cannot read data, so shipping it in the client bundle is
// expected and safe.
const posthogBootScript = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('phc_o65XCRaZi3tqYsxd3ETsdN47guGRXL8AhmS9x53NZ3Gp',{api_host:'https://us.i.posthog.com',person_profiles:'identified_only',capture_pageview:false,capture_pageleave:true,autocapture:true,respect_dnt:true});`;

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("err.notFound")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("err.notFoundDesc")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("err.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // theme-color paints the browser chrome (Chrome/Edge address
      // bar on Android, Safari status-bar tint on iOS PWA installs)
      // to match Lokali's charcoal. Without this the system bar
      // looks like a default light strip on top of the dark app.
      { name: "theme-color", content: "#0F0F0F" },
      // viewport-fit=cover unlocks env(safe-area-inset-*) CSS values so
      // we can pad around iPhone notches and Android system bars
      // (status bar at top, navigation gestures at bottom). Without
      // it the inset values resolve to 0 and content slides under
      // the OS chrome — Beka caught this on the first Android build:
      // status bar covered "WHERE NEXT?" + Settings/Notifications
      // pills; bottom gestures bar overlapped the TabBar.
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Lokali" },
      {
        name: "description",
        content:
          "Lokali is an AI-powered global audio guide for tourists, offering personalized tours in 37 languages.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lokali" },
      {
        property: "og:description",
        content:
          "Lokali is an AI-powered global audio guide for tourists, offering personalized tours in 37 languages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lokali" },
      {
        name: "twitter:description",
        content:
          "Lokali is an AI-powered global audio guide for tourists, offering personalized tours in 37 languages.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2c6124de-a910-4e7f-a9a8-f1f9c6aa86ed/id-preview-5e507a33--f618b725-5654-4e69-89f1-a620cf4ed64f.lovable.app-1777193546368.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2c6124de-a910-4e7f-a9a8-f1f9c6aa86ed/id-preview-5e507a33--f618b725-5654-4e69-89f1-a620cf4ed64f.lovable.app-1777193546368.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Favicon set — every PNG lives under /public so Vite serves
      // them from the site root. The ICO fallback covers legacy
      // browsers (IE/old Edge); modern browsers prefer the explicit
      // PNG sizes via `sizes=` hints.
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48x48.png" },
      // Apple touch icon — iOS Safari uses this when the user
      // "Add to Home Screen". Without it iOS would render a low-fi
      // screenshot of the page instead of the Lokali mark.
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      // PWA manifest — wires up `Add to Home Screen` on Chromium
      // and Firefox. The manifest itself lives at /public so it's
      // served verbatim; theme_color and background_color in there
      // match StatusBar + Splash defaults (#0F0F0F charcoal).
      { rel: "manifest", href: "/manifest.webmanifest" },
      // Web fonts — moved here from src/styles.css because Lightning CSS
      // can't resolve URL @imports.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/* PostHog loader — installs window.posthog + init() before
            hydration so pageview/identify calls from React are queued
            and replayed once array.js loads. See posthogBootScript. */}
        <script dangerouslySetInnerHTML={{ __html: posthogBootScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();
  // Native bridge — wires hardware back button and OAuth deep-link
  // handler when the app is running inside the Capacitor wrapper.
  // No-op in the browser (Capacitor.isNativePlatform() guards the
  // import), so this is free for web visitors.
  useCapacitorBridge(router);
  useEffect(() => {
    const stored = localStorage.getItem("tg.theme");
    document.documentElement.classList.toggle("light", stored === "light");
    // Keep <html lang> in sync with the stored language. The boot
    // script already sets this on first paint; this hook handles
    // mid-session switches (the user changes language on /language
    // without a full reload). lang change → re-set the attribute.
    const syncLang = () => {
      const l = localStorage.getItem("tg.lang");
      if (l) document.documentElement.setAttribute("lang", l);
    };
    syncLang();
    window.addEventListener("tg:lang-changed", syncLang);
    return () => window.removeEventListener("tg:lang-changed", syncLang);
  }, []);

  // Analytics pageviews — this is a SPA, so a route change doesn't
  // reload the page and PostHog's automatic pageview (disabled in the
  // snippet) never fires again after the initial load. Capture one
  // $pageview now for the entry page, then one on every resolved
  // navigation. router.subscribe returns its own unsubscribe fn.
  useEffect(() => {
    capturePageview();
    const unsubscribe = router.subscribe("onResolved", () => {
      capturePageview();
    });
    return unsubscribe;
  }, [router]);

  // Backfill Capacitor Preferences with the current Saved list, so
  // the bundled `public/offline.html` can render saved tours when the
  // app cold-starts without internet. Mirroring is fire-and-forget;
  // a failure here doesn't block app boot.
  useEffect(() => {
    void (async () => {
      try {
        const { backfillSavedToPreferences, getSaved, attachPhotoToSavedItem } =
          await import("@/lib/savedStore");
        await backfillSavedToPreferences();
        // Photo backfill — for any pre-existing Saved entry that
        // doesn't have an inlined hero image yet, fetch the existing
        // `image_url` and base64-encode it now while we're online.
        // Skips when offline (image fetch would fail anyway) and when
        // the item already has `imageDataUrl` set.
        if (typeof navigator !== "undefined" && navigator.onLine !== false) {
          for (const item of getSaved()) {
            if (item.imageDataUrl) continue;
            const url =
              (item.attraction as { image_url?: string } | null)?.image_url ?? null;
            if (!url) continue;
            void attachPhotoToSavedItem(item.id, url);
          }
        }
      } catch (err) {
        console.warn("[lokali] Saved backfill failed", err);
      }
    })();
  }, []);

  // Offline-default route: when the app cold-starts without
  // connectivity, send the user straight to /saved instead of the
  // Home strip (which can't render without the live /api/attractions
  // + /api/photo calls). Once back online, regular navigation
  // resumes — the redirect only fires once on initial mount when
  // the path is the root.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (navigator.onLine !== false) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    void router.navigate({ to: "/saved" });
    // We don't add `online` as a dep — the redirect should only
    // happen on the initial offline cold start, not every time
    // connectivity flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register the offline app-shell Service Worker so the next cold
  // start works without internet. Capacitor's `errorPath: offline.html`
  // fallback fires only when the WebView can't reach `lokali.travel` AT
  // ALL; with a SW registered, fetch-event interception serves the
  // cached app shell instead, the React app boots, and the user can
  // reach `/saved` (rendered from @capacitor/preferences +
  // @capacitor/filesystem — both already local).
  //
  // Registration is fire-and-forget; failures are logged and silently
  // tolerated (Capacitor 7 supports SW in WebView, but a future
  // platform / browser quirk shouldn't crash the root mount).
  //
  // We wait for `load` so the registration doesn't compete with
  // critical first-paint work; if the page is already idle we
  // schedule it immediately.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[lokali] Service Worker registration failed", err);
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  // Rehydrate the Saved list from Supabase on every sign-in. Reinstalls
  // and fresh devices wipe localStorage, but the cloud rows survive —
  // without this hook Beka saw his 4 saved attractions drop to 2 after
  // a debug reinstall cycle. Subscribe to auth state changes rather
  // than just running on mount: cold sign-in flows finish AFTER the
  // root mounts (OAuth redirects, exchangeCodeForSession), so the
  // SIGNED_IN event is what we need to wait for.
  //
  // This effect also drives analytics identity: we tag PostHog with the
  // Supabase user UUID (pseudonymous — no email/PII) whenever a session
  // is present, and reset() on sign-out so the next person on the same
  // device isn't merged into the previous user's profile.
  useEffect(() => {
    const cleanupRef: { current: (() => void) | null } = { current: null };
    let cancelled = false;
    void (async () => {
      const { hydrateFromCloud } = await import("@/lib/savedStore");
      const { supabase } = await import("@/integrations/supabase/client");
      if (cancelled) return;
      // Run once now in case we mounted with an existing session.
      await hydrateFromCloud();
      if (cancelled) return;
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        // Analytics identity — supabase-js emits INITIAL_SESSION on
        // subscribe with the current session, so this also covers
        // warm starts where the user is already signed in.
        if (session?.user) {
          identifyUser(session.user.id);
        } else if (event === "SIGNED_OUT") {
          resetAnalytics();
        }
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          void hydrateFromCloud();
        }
      });
      cleanupRef.current = () => sub.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, []);
  return (
    <>
      <Outlet />
      <Toaster richColors position="top-center" />
    </>
  );
}
