import { Outlet, Link, createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { LanguageProvider } from "@/lib/i18n";
import { BottomNav } from "@/components/BottomNav";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-normal text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#D9573D" },
      { title: "Lokali — AI Travel Audio Guide in 37 Languages" },
      { name: "description", content: "Discover landmarks worldwide with AI-narrated audio guides in your own language. 37 languages, offline listening, beautifully simple." },
      { property: "og:title", content: "Lokali — AI Travel Audio Guide" },
      { property: "og:description", content: "Personalised audio guides for travellers, in 37 languages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka">
      <head>
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
  const { pathname } = useLocation();
  const hideNav = pathname === "/splash" || pathname.startsWith("/player/");
  return (
    <LanguageProvider>
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-background">
        <main className={hideNav ? "flex-1" : "flex-1 pb-24"}>
          <Outlet />
        </main>
        {!hideNav && <BottomNav />}
      </div>
    </LanguageProvider>
  );
}
