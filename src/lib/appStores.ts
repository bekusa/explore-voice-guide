/**
 * Store links + "which store does this visitor need" — one place for the
 * whole SPA (banner, JSON-LD, click tracking). Beka 2026-11-07: the iOS
 * app was approved, so every Play-only spot becomes platform-aware.
 *
 * Rule that never bends: inside the Capacitor app (iOS or Android) NO store
 * link is shown at all. Apple guideline 2.3.10 forbids mentioning Google
 * Play inside an iOS app, and Play has the same rule the other way round.
 * The native shell (server.url loads this very site) injects
 * window.Capacitor with isNativePlatform() → true; see isNativeApp() for why
 * the mere presence of window.Capacitor is not enough.
 */

export const PLAY_URL =
  "https://play.google.com/store/apps/details?id=app.lokali.travel";
export const APP_STORE_ID = "6828065471";
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/**
 * Apple's official black "Download on the App Store" badge (US-UK, 120×40),
 * self-hosted. Downloaded 2026-11-07 from Apple's marketing toolbox
 * (toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/
 * black/en-us) with Beka's OK — the old tools.applemarketingtools.com host no
 * longer resolves. Apple's App Store Marketing Guidelines allow only this
 * artwork: no standalone Apple logo, no App Store icon in its place, black
 * badge when other stores' badges sit next to it.
 */
export const APP_STORE_BADGE_SRC = "/explore/assets/app-store-badge.svg";
/** Google's official "Get it on Google Play" badge (already self-hosted for /explore/). */
export const PLAY_BADGE_SRC = "/explore/assets/google-play-badge.png";

/**
 * One link for every device (src/routes/app.tsx): iPhone/iPad → App Store,
 * Android → Google Play, anything else → a page with both badges + a QR.
 * The desktop QR codes point here, so one scan works on either phone.
 */
export const APP_LINK = "https://lokali.travel/app";
/** QR for https://lokali.travel/app?utm_source=web&utm_medium=qr&utm_campaign=spa */
export const APP_QR_SRC = "/explore/assets/app-qr-web.svg";

/**
 * Which store a User-Agent belongs to — server-safe (no window/navigator),
 * used by /app before any HTML exists. iPadOS in desktop mode sends a Mac
 * UA, so it gets null here and is caught on the client (isIOSDevice).
 */
export function storeForUserAgent(ua: string): "ios" | "android" | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

/** "ios" = iPhone/iPad, "android", "desktop" = everything else, "native" = inside our app. */
export type StorePlatform = "ios" | "android" | "desktop" | "native";

type NavLike = {
  userAgent?: string;
  maxTouchPoints?: number;
  platform?: string;
};

type CapLike = { isNativePlatform?: () => boolean; getPlatform?: () => string };

/**
 * Inside our Capacitor app? Presence of window.Capacitor alone is NOT
 * enough: importing @capacitor/core on the plain web (useCapacitorBridge,
 * useAuth and i18n all do, lazily) creates window.Capacitor too, with
 * getPlatform() === "web". The old `!!window.Capacitor` check therefore
 * hid the pill on the web as soon as that chunk had loaded — e.g. after
 * any client-side navigation. In the app, the native bridge defines
 * isNativePlatform() → true before any page script runs, so asking it is
 * both earlier and exact.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: CapLike }).Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function")
      return cap.isNativePlatform();
    if (typeof cap.getPlatform === "function")
      return cap.getPlatform() !== "web";
  } catch {
    /* unreadable Capacitor object — fall through */
  }
  // A Capacitor object we can't interpret: treat it as the app, so a store
  // link can never leak into it.
  return true;
}

/**
 * iPadOS 13+ Safari asks for desktop sites and reports itself as
 * "Macintosh" — the only tell is a touch screen (Macs report 0 touch points).
 */
export function isIOSDevice(
  nav: NavLike | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  const touchMac =
    (/Macintosh/.test(ua) || nav.platform === "MacIntel") &&
    (nav.maxTouchPoints ?? 0) > 1;
  return touchMac;
}

export function storePlatform(): StorePlatform {
  if (typeof navigator === "undefined") return "desktop";
  if (isNativeApp()) return "native";
  if (isIOSDevice()) return "ios";
  if (/Android/i.test(navigator.userAgent || "")) return "android";
  return "desktop";
}

/**
 * True only for Apple's own Safari on iPhone/iPad — the one browser that
 * renders the Smart App Banner from <meta name="apple-itunes-app">.
 * Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), Opera, DuckDuckGo, the
 * Google app (GSA) and in-app browsers (Instagram, Facebook, TikTok…) use
 * WebKit too but never show that banner, so they keep our own pill.
 * Safari's UA has "Version/x Safari/y"; in-app web views usually lack the
 * "Safari/" token, and the third-party browsers add their own marker.
 */
export function isIOSSafari(
  nav: NavLike | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): boolean {
  if (!nav || !isIOSDevice(nav)) return false;
  const ua = nav.userAgent || "";
  if (!/Version\/[\d.]+.*Safari\//.test(ua)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Ddg\/|FBAN|FBAV|FBIOS|Instagram|TikTok|musical_ly|BytedanceWebview|Line\/|Twitter|Snapchat|Pinterest/i.test(
    ua,
  );
}
