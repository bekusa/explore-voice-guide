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
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
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

  const device =
    /iPad|Tablet/i.test(ua) || touchMac || (/Android/i.test(ua) && !/Mobile/i.test(ua))
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

/* ── PostHog loader ───────────────────────────────────────────────
 *
 * This is PostHog's official queuing snippet, moved here out of a
 * <script> tag in the document head. Beka 2026-10-25.
 *
 * Why it moved: run from the head it executed BEFORE React hydrated,
 * and PostHog then appends its own scripts (array.js, surveys.js,
 * dead-clicks-autocapture.js, web-vitals-with-attribution.js) into
 * the document. Several of those landed inside <body> — which is
 * inside React's hydration root — so React met four elements it had
 * never rendered and aborted hydration with error #418, throwing away
 * the whole server-rendered homepage.
 *
 * The dev build named them one by one; that diff is what finally
 * identified this after a day of wrong guesses on my part.
 *
 * Installing after hydration removes the race entirely: by the time
 * these scripts appear, React is no longer matching the DOM against
 * server HTML and extra nodes are simply ignored.
 *
 * Analytics losing a few hundred milliseconds is a non-issue; every
 * accessor in this file already uses `ph()?.`, so calls made before
 * the snippet lands are dropped rather than thrown.
 */
const POSTHOG_SNIPPET = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('phc_qCd9xVsVntEAjMS7fGPC7JcpXGGVftSk7oKEzzSxuMqc',{api_host:'https://eu.i.posthog.com',person_profiles:'identified_only',capture_pageview:false,capture_pageleave:true,autocapture:true,respect_dnt:true});`;

let analyticsInstalled = false;

/**
 * Load PostHog. Call ONLY from a client effect, never during render
 * and never from the document head — see the note above.
 *
 * Idempotent and silent on failure: analytics must never be the
 * reason a page breaks.
 */
export function installAnalytics(): void {
  try {
    if (analyticsInstalled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    analyticsInstalled = true;
    const el = document.createElement("script");
    el.textContent = POSTHOG_SNIPPET;
    // Head, not body: PostHog inserts its own scripts next to the
    // first <script> it finds, and keeping ours in the head biases
    // that away from the React tree.
    document.head.appendChild(el);
  } catch {
    /* Analytics is optional. The app is not. */
  }
}
