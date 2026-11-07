import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/hooks/useT";
import {
  APP_QR_SRC,
  APP_STORE_BADGE_SRC,
  APP_STORE_URL,
  PLAY_BADGE_SRC,
  PLAY_URL,
  isIOSSafari,
  storePlatform,
} from "@/lib/appStores";

// Unchanged on purpose: whoever closed the Play-only pill before the iOS
// launch has already said "no" and must not see the new one either.
const DISMISS_KEY = "lokali.playbanner.dismissed.v1";

/**
 *   android → Google Play pill (unchanged since 2026-07-31)
 *   ios     → Apple's official App Store badge only
 *   qr      → laptop/desktop: QR card (one code → /app picks the store
 *             for whichever phone scans it) + both badges
 *   both    → a device we can't place (narrow desktop window, a phone that
 *             is neither iOS nor Android): both badges, visitor chooses
 */
type Variant = "android" | "ios" | "qr" | "both";

/**
 * Floating "get the app" pill (Beka 2026-07-31, production launch; made
 * platform-aware 2026-11-07 when the iOS app was approved). Rendered by
 * MobileFrame on every page, pinned just above the TabBar — except the
 * laptop QR card, which is portalled to <body> and sits bottom-right of the
 * window, outside the phone frame.
 *
 * Hidden when any of these is true:
 *   1. Inside the Capacitor app, iOS or Android (isNativeApp). Store
 *      links in the app are pointless, and Apple 2.3.10 forbids mentioning
 *      Google Play in an iOS app — so nothing renders there at all.
 *   2. Previously dismissed (localStorage, same key as the Play-only pill).
 *   3. iOS Safari. Safari draws Apple's own Smart App Banner at the top
 *      (from <meta name="apple-itunes-app"> in __root.tsx), with "Open"
 *      when the app is installed — two banners for one app would be
 *      noise. Chrome/Firefox/Edge on iOS and in-app browsers (Instagram,
 *      Facebook, TikTok) never show Apple's banner, so they keep this pill.
 *   4. On /app itself — that page already is the store chooser.
 *   5. Not mounted yet (SSR-safe: every window/navigator check is in
 *      useEffect, so the server HTML never contains the pill).
 */
export function PlayStoreBanner() {
  const t = useT();
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/app") return;
    const platform = storePlatform();
    if (platform === "native") return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage blocked — show it, dismissal just won't persist */
    }
    if (dismissed) return;
    if (platform === "ios" && isIOSSafari()) return;
    if (platform === "desktop") {
      // A real laptop/desktop: wide window and a mouse. Then a QR is the
      // only useful thing (nobody installs a phone app on the laptop).
      const laptop = window.matchMedia(
        "(min-width: 1024px) and (pointer: fine)",
      ).matches;
      setVariant(laptop ? "qr" : "both");
      return;
    }
    setVariant(platform);
  }, []);

  if (!variant) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVariant(null);
  };

  // Apple's official badge (App Store Marketing Guidelines: official
  // artwork only, at least 40 px tall on screen, black next to other
  // stores' badges).
  const appStoreBadge = (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block shrink-0 rounded-[9px]"
    >
      <img
        src={APP_STORE_BADGE_SRC}
        alt={t("playBanner.appStoreAlt")}
        width={120}
        height={40}
        decoding="async"
        className="block h-10 w-auto"
      />
    </a>
  );
  // Google's official badge PNG carries a transparent margin (41 px of
  // 250); the negative margin trims it so the visible badge is 40 px, the
  // same as Apple's.
  const playBadge = (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block shrink-0"
    >
      <img
        src={PLAY_BADGE_SRC}
        alt={t("playBanner.playAlt")}
        width={155}
        height={60}
        decoding="async"
        className="-m-2.5 block h-[60px] w-auto max-w-none"
      />
    </a>
  );
  const closeButton = (
    <button
      onClick={dismiss}
      aria-label={t("playBanner.dismiss")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-smooth hover:text-foreground"
    >
      <X className="h-4 w-4" />
    </button>
  );

  if (variant === "qr") {
    return createPortal(
      <aside
        data-placement="desktop_qr_card"
        data-store-variant="qr"
        aria-label={t("playBanner.qrTitle")}
        className="fixed bottom-6 right-6 z-50 w-[296px] rounded-3xl border border-primary/30 bg-card/95 p-5 text-center shadow-elegant backdrop-blur-xl"
      >
        <div className="absolute right-2 top-2">{closeButton}</div>
        <p className="px-6 text-[15px] font-bold leading-snug text-foreground">
          {t("playBanner.qrTitle")}
        </p>
        <div className="mx-auto mt-3 w-[168px] rounded-xl bg-white p-2">
          <img
            src={APP_QR_SRC}
            alt="QR — https://lokali.travel/app"
            width={152}
            height={152}
            className="block h-[152px] w-[152px]"
          />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-foreground">
          {t("playBanner.qrHint")}
        </p>
        {/* Brand names only — the same in every language. */}
        <p className="mt-1 text-[11px] text-muted-foreground">
          iPhone → App Store · Android → Google Play
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          {appStoreBadge}
          {playBadge}
        </div>
      </aside>,
      document.body,
    );
  }

  return (
    <div className="pointer-events-none flex justify-center px-4">
      <div
        data-placement="floating_banner"
        data-store-variant={variant}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-primary/30 bg-card/95 p-2 pl-2.5 shadow-elegant backdrop-blur-xl"
      >
        {variant === "android" && (
          <a
            href={PLAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-full px-2.5 py-1.5"
          >
            {/* Google Play glyph — accurate Play-triangle geometry
                (Bootstrap Icons "google-play" outline), split into its
                four facets with the official prism colors: blue back,
                green top, yellow tip, red bottom. Beka 2026-07-31:
                "იყოს ფერადი რომ კარგად გამოჩნდეს". */}
            <svg
              viewBox="0 0 16 16"
              className="h-6 w-6 shrink-0"
              aria-hidden="true"
            >
              <path fill="#00B0FF" d="M1 13.396V2.603L6.846 8 1 13.396Z" />
              <path
                fill="#00E676"
                d="M1.03 1.27l6.553 6.05 3.044-2.81L3.333.215C2.39-.341 1.231.24 1.03 1.27Z"
              />
              <path
                fill="#FFC400"
                d="M14.222 9.374c1.037-.61 1.037-2.137 0-2.748L11.528 5.04 8.32 8l3.207 2.96 2.694-1.586Z"
              />
              <path
                fill="#FF3D57"
                d="M10.627 11.49 7.583 8.68 1.03 14.73c.201 1.029 1.36 1.61 2.303 1.055l7.294-4.295Z"
              />
            </svg>
            <span className="text-left leading-tight">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Google Play
              </span>
              <span className="block text-[15px] font-bold text-foreground">
                {t("playBanner.cta")}
              </span>
            </span>
          </a>
        )}

        {/* Apple allows its logo only inside the official badge, so on
            iPhone/iPad the badge IS the button (no home-made glyph). */}
        {variant === "ios" && (
          <div className="flex items-center gap-3 px-1">
            {appStoreBadge}
            <span className="pr-1 text-left text-[15px] font-bold leading-tight text-foreground">
              {t("playBanner.cta")}
            </span>
          </div>
        )}

        {variant === "both" && (
          <div className="flex items-center gap-2 px-1">
            {appStoreBadge}
            {playBadge}
          </div>
        )}

        {closeButton}
      </div>
    </div>
  );
}
