import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

const themeBootScript = `(function(){try{var t=localStorage.getItem('tg.theme');if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lokali" },
      { name: "description", content: "Lokali is an AI-powered global audio guide for tourists, offering personalized tours in 37 languages." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lokali" },
      { property: "og:description", content: "Lokali is an AI-powered global audio guide for tourists, offering personalized tours in 37 languages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lokali" },
      { name: "twitter:description", content: "Lokali is an AI-powered global audio guide for tourists, offering personalized tours in 37 languages." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2c6124de-a910-4e7f-a9a8-f1f9c6aa86ed/id-preview-5e507a33--f618b725-5654-4e69-89f1-a620cf4ed64f.lovable.app-1777193546368.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2c6124de-a910-4e7f-a9a8-f1f9c6aa86ed/id-preview-5e507a33--f618b725-5654-4e69-89f1-a620cf4ed64f.lovable.app-1777193546368.png" },
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
  useEffect(() => {
    const stored = localStorage.getItem("tg.theme");
    document.documentElement.classList.toggle("light", stored === "light");
  }, []);
  return (
    <>
      <Outlet />
      <Toaster richColors position="top-center" />
    </>
  );
}
