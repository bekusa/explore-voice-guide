/**
 * Lokali analytics — thin wrapper around the PostHog browser SDK.
 *
 * PostHog is loaded via the inline loader snippet in `src/routes/__root.tsx`
 * (RootShell <head>), NOT as an npm dependency. That keeps the build/lockfile
 * untouched and means the whole integration ships as plain client JS — which
 * is exactly what we want inside the Capacitor WebView (it just loads
 * lokali.travel, so a web snippet covers both the site AND the Android app
 * with no store re-upload).
 *
 * The snippet installs a queuing stub on `window.posthog` immediately, then
 * swaps in the real library once `array.js` downloads. Because of the stub,
 * every call below is safe to make right away — anything fired before the
 * library finishes loading is queued and replayed.
 *
 * All helpers are browser-only and never throw: on the SSR pass (no `window`)
 * and in the unlikely case the snippet failed to run, they simply no-op so a
 * broken analytics load can never take the app down with it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The Lovable-generated Database type only knows profiles/saved_tours,
 * so `.from("usage_events")` fails to type-check (same situation as
 * trips/trip_items and api_logs). Widen once for the telemetry insert.
 * Remove when the generated types include usage_events.
 */
const telemetryDb = supabase as unknown as SupabaseClient;

// Current signed-in user id, kept in sync by identifyUser / resetAnalytics
// so telemetry writes (visits, plays) can be attributed without every caller
// threading the id through. Null while signed out.
let currentUserId: string | null = null;

type PostHogClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
};

function ph(): PostHogClient | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { posthog?: PostHogClient }).posthog;
}

/**
 * Fire a manual `$pageview`. We disable PostHog's automatic pageview in the
 * snippet (`capture_pageview: false`) and call this from the TanStack Router
 * `onResolved` event instead — the SPA changes routes without full page
 * loads, so the automatic pageview (which fires once, on script load) would
 * badly under-count real navigation.
 */
export function capturePageview(): void {
  ph()?.capture("$pageview");
}

/**
 * Fire a custom product event (e.g. "attraction_opened", "audio_played").
 * Handy later for building funnels; unused surfaces can adopt it gradually.
 */
export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  ph()?.capture(event, properties);
}

// Stable per-device anonymous id, so unique-user metrics (e.g. the North
// Star "active listeners") work for signed-out visitors too. Lives in
// localStorage; regenerated only if cleared. Mirrors what PostHog does
// internally, but we keep our own so the Supabase-side dashboard can count
// uniques without depending on PostHog being loaded.
const ANON_ID_KEY = "lokali_anon_id";
// True when this page load had to mint a brand-new anon id, i.e. the first
// time this browser / app install ever opened Lokali. Reported once (on the
// next page_view) as `new_device: true` — inside the Android app that is
// the closest thing to an "install + first open" count we can see without
// a native plugin (and so without a store release).
let deviceIsNew = false;
let newDeviceReported = false;
function anonId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "a_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(ANON_ID_KEY, id);
      deviceIsNew = true;
    }
    return id;
  } catch {
    return "anon";
  }
}

/**
 * Coarse client context for the dashboard's browser / OS / platform
 * breakdowns. Parsed from navigator.userAgent — no fingerprinting, no
 * version numbers, nothing that identifies a person. `app` tells the
 * Android app (Capacitor WebView loading this same site) apart from the
 * plain website, which is what lets the dashboard split web vs app and
 * count first app opens. Pure web code: ships with a normal site deploy,
 * no app-store release needed.
 */
type ClientInfo = { app: string; os: string; browser: string; device: string; bot?: boolean };
let clientInfoCache: ClientInfo | null = null;
export function clientInfo(): ClientInfo {
  if (clientInfoCache) return clientInfoCache;
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { app: "server", os: "Other", browser: "Other", device: "desktop" };
  }
  const ua = navigator.userAgent || "";
  const cap = (
    window as Window & { Capacitor?: { getPlatform?: () => string } }
  ).Capacitor;
  const capPlatform = cap?.getPlatform?.() ?? (cap ? "android" : "web");
  const app = capPlatform === "web" ? "web" : `${capPlatform}_app`;

  const touchMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  let os = "Other";
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua) || touchMac) os = "iOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  const bot = /bot|crawl|spider|slurp|lighthouse|headlesschrome|pagespeed|preview/i.test(ua);
  let browser = "Other";
  if (bot) browser = "Bot";
  else if (app !== "web") browser = "Lokali app";
  else if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) browser = "Facebook";
  else if (/Instagram/.test(ua)) browser = "Instagram";
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) browser = "TikTok";
  else if (/Edg(A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera|OPT\//.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/YaBrowser/.test(ua)) browser = "Yandex";
  else if (/Firefox|FxiOS/.test(ua)) browser = "Firefox";
  else if (/; wv\)/.test(ua)) browser = "Android WebView";
  else if (/CriOS|Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  const device = /iPad|Tablet/i.test(ua) || touchMac || (/Android/i.test(ua) && !/Mobile/i.test(ua))
    ? "tablet"
    : /Mobi|iPhone|iPod|Android/i.test(ua)
      ? "mobile"
      : "desktop";

  clientInfoCache = bot ? { app, os, browser, device, bot } : { app, os, browser, device };
  return clientInfoCache;
}

/**
 * Track a product event to BOTH sinks:
 *   1. PostHog — for funnels, retention, and cross-event analysis.
 *   2. public.usage_events (Supabase) — powers the North Star / activation
 *      cards on the Lokali dashboard, counting uniques via the anon id.
 * The Supabase insert is fire-and-forget and swallows every error — a
 * telemetry failure must never disrupt playback or any real user action.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  userId?: string | null,
): void {
  captureEvent(event, properties);
  if (typeof window === "undefined") return;
  try {
    void telemetryDb
      .from("usage_events")
      .insert({
        event,
        anon_id: anonId(),
        user_id: userId ?? null,
        props: { ...(properties ?? {}), app: clientInfo().app, os: clientInfo().os },
      })
      .then(undefined, () => {});
  } catch {
    /* never throw from telemetry */
  }
}

/**
 * Record a site visit (a resolved page view) into public.usage_events so the
 * dashboard can report unique visitors + pageviews from Supabase, without
 * relying on the PostHog API. PostHog still gets its own $pageview via
 * capturePageview(); this is the Supabase-native mirror. Fire-and-forget,
 * never throws. anon_id gives unique-visitor counts even for signed-out
 * traffic; user_id attributes it when someone is signed in.
 */
export function logVisit(path?: string): void {
  if (typeof window === "undefined") return;
  try {
    const info = clientInfo();
    // Crawlers (Googlebot, Lighthouse, link previews) run our JS too; they
    // are not visitors, so keep them out of the counts entirely.
    if (info.bot) return;
    const id = anonId();
    const props: Record<string, unknown> = {
      path: path ?? (typeof location !== "undefined" ? location.pathname : null),
      app: info.app,
      os: info.os,
      browser: info.browser,
      device: info.device,
    };
    if (deviceIsNew && !newDeviceReported) {
      props.new_device = true;
      newDeviceReported = true;
    }
    void telemetryDb
      .from("usage_events")
      .insert({
        event: "page_view",
        anon_id: id,
        user_id: currentUserId,
        props,
      })
      .then(undefined, () => {});
  } catch {
    /* never throw from telemetry */
  }
}

/**
 * Count clicks on any Google Play link (the floating banner today, any
 * future placement automatically) as `play_store_click`. One delegated
 * listener on document, installed once from the root component — so new
 * links need no extra wiring. `placement` comes from the nearest
 * data-placement attribute, falling back to the current path.
 */
let playClicksInstalled = false;
export function installPlayStoreClickTracking(): void {
  if (typeof document === "undefined" || playClicksInstalled) return;
  playClicksInstalled = true;
  document.addEventListener(
    "click",
    (e) => {
      try {
        const a = (e.target as Element | null)?.closest?.("a[href*='play.google.com']");
        if (!a) return;
        const placement =
          a.closest("[data-placement]")?.getAttribute("data-placement") ??
          (typeof location !== "undefined" ? location.pathname : null);
        const info = clientInfo();
        trackEvent(
          "play_store_click",
          { placement, path: location.pathname, browser: info.browser, device: info.device },
          currentUserId,
        );
      } catch {
        /* never throw from telemetry */
      }
    },
    { capture: true },
  );
}

/**
 * Tie subsequent events to a signed-in user. We identify by the Supabase
 * user UUID only (pseudonymous) — no email or other PII is sent to PostHog.
 */
export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
  currentUserId = distinctId;
  ph()?.identify(distinctId, properties);
}

/**
 * Clear the identity on sign-out so the next person on the same device isn't
 * merged into the previous user's profile.
 */
export function resetAnalytics(): void {
  currentUserId = null;
  ph()?.reset();
}
