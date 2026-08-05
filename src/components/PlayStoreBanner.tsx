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
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-primary/30 bg-card/95 p-1.5 pl-2 shadow-elegant backdrop-blur-xl">
        <a
          href={PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-full px-2 py-1"
        >
          {/* Google Play glyph — inline SVG so no asset request and it
              inherits nothing (brand colors are part of the mark). */}
          <svg viewBox="0 0 512 512" className="h-5 w-5 shrink-0" aria-hidden="true">
            <path fill="#0fd865" d="M99 34l232 133-58 58L99 34z" />
            <path fill="#0ab4e6" d="M91 40c-6 5-9 13-9 22v388c0 9 3 17 9 22l2 2 217-217v-2L93 38l-2 2z" />
            <path fill="#ffce00" d="M403 315l-72-72v-2l72-72 2 1 86 49c24 14 24 36 0 50l-86 49-2-3z" />
            <path fill="#f43249" d="M331 167l-58 58 58 58 74-42-74-74z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Google Play
            </span>
            <span className="block text-[12.5px] font-bold text-foreground">
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
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-smooth hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
