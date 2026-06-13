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

import appCss from "../styles.css?url";

// Theme boot script — runs before React hydrates so the light-theme
// flash is suppressed on first paint. The matching lang boot script
// underneath sets <html lang> from the stored language so screen
// readers + Lighthouse pick up the right BCP-47 code immediately
// (the SSR shell ships lang="en" because we don't know the user's
// preference at SSR time; the script overrides it client-side).
const themeBootScript = `(function(){try{var t=localStorage.getItem('tg.theme');if(t==='light'){document.documentElement.classList.add('light');}var l=localStorage.getItem('tg.lang');if(l){document.documentElement.setAttribute('lang',l);}}catch(e){}})();`;

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
  // fallback fires only when the WebView can't reach `lokali.ge` AT
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
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
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
