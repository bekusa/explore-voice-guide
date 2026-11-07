import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { useT } from "@/hooks/useT";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_QR_SRC,
  APP_STORE_BADGE_SRC,
  APP_STORE_URL,
  PLAY_BADGE_SRC,
  PLAY_URL,
  isNativeApp,
  storeForUserAgent,
  storePlatform,
} from "@/lib/appStores";

/**
 * https://lokali.travel/app — one "get the app" link for every device
 * (Beka 2026-11-07, iOS launch). The desktop QR codes on the site and in
 * /explore/ point here, so one scan works on an iPhone and on an Android.
 *
 *   iPhone / iPad UA  → 302 App Store
 *   Android UA        → 302 Google Play (utm_* passed on, Play Console reads them)
 *   anything else     → this page: QR + both official badges, visitor chooses
 *
 * iPadOS in desktop mode sends a Mac UA, so it reaches the page; the effect
 * below spots the touch screen and forwards it to the App Store.
 * Each redirect is logged to usage_events as `app_link` (best effort, never
 * delays the redirect by more than ~0.8 s) — the only way to count QR scans
 * that end in the App Store, which has no utm.
 * noindex: a redirector has nothing to rank.
 */

// usage_events is not in the generated Database types — same cast as
// src/lib/analytics.ts.
const telemetryDb = supabase as unknown as SupabaseClient;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function utmFrom(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) out[k] = v.slice(0, 120);
  }
  return out;
}

function playUrlWithUtm(utm: Record<string, string>): string {
  const q = Object.entries(utm)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return q ? `${PLAY_URL}&${q}` : PLAY_URL;
}

async function logAppLink(
  store: string,
  utm: Record<string, string>,
): Promise<void> {
  try {
    const insert = telemetryDb
      .from("usage_events")
      .insert({
        event: "app_link",
        anon_id: null,
        user_id: null,
        props: { store, ...utm },
      })
      .then(
        () => undefined,
        () => undefined,
      );
    await Promise.race([insert, new Promise((r) => setTimeout(r, 800))]);
  } catch {
    /* telemetry never blocks the redirect */
  }
}

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Get the Lokali app — iPhone and Android" },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  server: {
    handlers: {
      GET: async ({ request, next }) => {
        const store = storeForUserAgent(
          request.headers.get("user-agent") ?? "",
        );
        if (!store) return next();
        const utm = utmFrom(new URL(request.url).searchParams);
        await logAppLink(store, utm);
        return new Response(null, {
          status: 302,
          headers: {
            Location: store === "ios" ? APP_STORE_URL : playUrlWithUtm(utm),
            "Cache-Control": "private, no-store",
            Vary: "User-Agent",
            "X-Robots-Tag": "noindex",
          },
        });
      },
    },
  },
  component: GetAppPage,
});

function GetAppPage() {
  const t = useT();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Inside our own app no store link may show (Apple 2.3.10).
    if (isNativeApp()) {
      window.location.replace("/");
      return;
    }
    const p = storePlatform();
    if (p === "ios") {
      window.location.replace(APP_STORE_URL);
      return;
    }
    if (p === "android") {
      window.location.replace(
        playUrlWithUtm(utmFrom(new URLSearchParams(window.location.search))),
      );
      return;
    }
    setReady(true);
  }, []);

  return (
    <MobileFrame hideTabBar hideAiFooter>
      <main className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
        <a href="/" className="flex flex-col items-center gap-3">
          <img
            src="/icon-192.png"
            alt="Lokali"
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-2xl"
          />
          <span className="font-display text-3xl text-foreground">Lokali</span>
        </a>
        {ready && (
          <>
            <h1 className="mt-6 text-xl font-bold text-foreground">
              {t("playBanner.qrTitle")}
            </h1>
            <div className="mt-5 w-[208px] rounded-2xl bg-white p-3">
              <img
                src={APP_QR_SRC}
                alt="QR — https://lokali.travel/app"
                width={184}
                height={184}
                className="block h-[184px] w-[184px]"
              />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">
              {t("playBanner.qrHint")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              iPhone → App Store · Android → Google Play
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <a
                href={APP_STORE_URL}
                rel="noopener noreferrer"
                className="block shrink-0"
              >
                <img
                  src={APP_STORE_BADGE_SRC}
                  alt={t("playBanner.appStoreAlt")}
                  width={120}
                  height={40}
                  className="block h-10 w-auto"
                />
              </a>
              <a
                href={PLAY_URL}
                rel="noopener noreferrer"
                className="block shrink-0"
              >
                <img
                  src={PLAY_BADGE_SRC}
                  alt={t("playBanner.playAlt")}
                  width={155}
                  height={60}
                  className="-m-2.5 block h-[60px] w-auto max-w-none"
                />
              </a>
            </div>
          </>
        )}
      </main>
    </MobileFrame>
  );
}
