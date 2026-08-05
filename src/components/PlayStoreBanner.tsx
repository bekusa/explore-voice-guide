import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/hooks/useT";

const PLAY_URL = "https://play.google.com/store/apps/details?id=app.lokali.travel";
const DISMISS_KEY = "lokali.playbanner.dismissed.v1";

/**
 * Floating "Get it on Google Play" pill (Beka 2026-07-31, production
 * launch). Rendered by MobileFrame on every page, pinned just above
 * the TabBar so it stays visible over the scrolling content.
 *
 * Visibility rules — all three must pass:
 *   1. NOT inside the Capacitor app. The Android app loads this same
 *      site, and advertising the Play listing to someone already in
 *      the app would be noise (and reads badly in Play review).
 *      window.Capacitor is injected by the native shell, so its
 *      presence is the discriminator.
 *   2. Not previously dismissed (localStorage, survives sessions —
 *      a visitor who closed it once shouldn't fight it every page).
 *   3. Mounted (SSR-safe: window checks happen in useEffect).
 *
 * iOS visitors still see it — the App Store version doesn't exist
 * yet, and the Play badge doubles as "there IS an app" signal; when
 * an iOS build ships this becomes a platform-aware switch.
 */
export function PlayStoreBanner() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isNativeApp = !!(
      window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage blocked — show it, dismissal just won't persist */
    }
    setVisible(!isNativeApp && !dismissed);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-primary/30 bg-card/95 p-2 pl-2.5 shadow-elegant backdrop-blur-xl">
        <a
          href={PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-full px-2.5 py-1.5"
        >
          {/* Google Play glyph — the accurate Play-triangle outline
              (Bootstrap Icons "google-play" geometry), monochrome in
              the app's foreground color. Beka 2026-07-31: the earlier
              hand-drawn 4-color version had wrong proportions; the
              exact monochrome mark also sits better on Lokali's
              dark/gold surface than off-brand color guesses. */}
          <svg
            viewBox="0 0 16 16"
            className="h-6 w-6 shrink-0 text-foreground"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M14.222 9.374c1.037-.61 1.037-2.137 0-2.748L11.528 5.04 8.32 8l3.207 2.96 2.694-1.586Zm-3.595 2.116L7.583 8.68 1.03 14.73c.201 1.029 1.36 1.61 2.303 1.055l7.294-4.295ZM1 13.396V2.603L6.846 8 1 13.396ZM1.03 1.27l6.553 6.05 3.044-2.81L3.333.215C2.39-.341 1.231.24 1.03 1.27Z" />
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
        <button
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setVisible(false);
          }}
          aria-label={t("playBanner.dismiss")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-smooth hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
