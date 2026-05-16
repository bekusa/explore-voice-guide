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
  return (
    <>
      <Outlet />
      <Toaster richColors position="top-center" />
    </>
  );
}
