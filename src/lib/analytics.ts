/**
 * Lokali analytics — Supabase `usage_events` only.
 *
 * ── PostHog was removed on 2026-10-29 (Beka's call) ──────────────
 * It had been loaded from an inline snippet, with every event written
 * to both PostHog and Supabase. Three things decided it:
 *
 *   1. Its `array.js` was BLOCKED for a large share of visitors — 45
 *      failed loads across 39 distinct pages in four days, which is
 *      60% of every browser-side error the app logged. The numbers it
 *      did collect were therefore skewed by an unknown amount.
 *   2. It injected four scripts (array, surveys, dead-clicks,
 *      web-vitals) into the document. Running before hydration, those
 *      landed inside React's hydration root and broke the homepage
 *      with error #418 — see the note in routes/index.tsx.
 *   3. Supabase `usage_events` already recorded the same events, is
 *      first-party so nothing blocks it, and is what the dashboard
 *      actually reads. PostHog was the redundant half.
 *
 * What remains: trackEvent() and logVisit() write to usage_events;
 * identifyUser() / resetAnalytics() keep `currentUserId` in sync so
 * those rows are attributable; clientInfo() and
 * installPlayStoreClickTracking() are unchanged.
 *
 * If a funnel tool is ever wanted again, add it as ONE more sink
 * inside trackEvent — and load it from an effect, never from <head>.
 *
 * All helpers are browser-only and never throw: on the SSR pass (no
 * `window`) they simply no-op, so telemetry can never take the app
 * down with it.
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

// Stable per-device anonymous id, so unique-user metrics (e.g. the North
// Star "active listeners") work for signed-out visitors too. Lives in
// localStorage; regenerated only if cleared. First-party, so nothing
// blocks it — which is now the only way uniques get counted at all.
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
 * Track a product event into public.usage_events (Supabase), which powers
 * the North Star / activation cards on the Lokali dashboard and counts
 * uniques via the anon id.
 *
 * Used to write to PostHog as well; that leg was removed 2026-10-29 (see
 * the file header). Supabase is now the only sink, which it effectively
 * already was — PostHog's script is blocked for a large share of visitors,
 * so its numbers were never trustworthy anyway.
 *
 * The insert is fire-and-forget and swallows every error — a telemetry
 * failure must never disrupt playback or any real user action.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  userId?: string | null,
): void {
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
 * dashboard can report unique visitors + pageviews. Since 2026-10-29 this
 * is the ONLY pageview sink — the PostHog $pageview leg is gone.
 * Fire-and-forget,
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
 * Tie subsequent telemetry to a signed-in user.
 *
 * Still required after PostHog was removed (Beka 2026-10-29): this keeps
 * `currentUserId` in sync, and trackEvent() / logVisit() stamp that onto
 * their `usage_events` rows. Drop it and every row goes anonymous, which
 * would break the activation funnel.
 */
export function identifyUser(distinctId: string, _properties?: Record<string, unknown>): void {
  currentUserId = distinctId;
}

/**
 * Clear the identity on sign-out so the next person on the same device isn't
 * merged into the previous user's profile.
 */
export function resetAnalytics(): void {
  currentUserId = null;
}
