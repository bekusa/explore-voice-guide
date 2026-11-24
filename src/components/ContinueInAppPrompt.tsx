import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/hooks/useT";
import { trackEvent } from "@/lib/analytics";
import {
  APP_QR_SRC,
  appStoreUrl,
  PLAY_URL,
  storePlatform,
  type StorePlatform,
} from "@/lib/appStores";

/**
 * "Keep listening in the Lokali app" — a slim row inside the audio player,
 * shown on the WEB only, once someone has actually listened (Beka
 * 2026-11-23: web → store conversion was tiny; the best moment to offer the
 * app is right after a guide has proven its worth, not on page load).
 *
 * Rules:
 *   - Never inside the iOS/Android app (storePlatform() === "native"):
 *     Apple 2.3.10 / Play policy, and pointless there anyway. Unknown
 *     Capacitor objects count as native (see isNativeApp).
 *   - iPhone/iPad → App Store, Android → Google Play, desktop → a QR of
 *     lokali.travel/app (one scan works on either phone).
 *   - "×" hides it for HIDE_DAYS on this device; a store click hides it
 *     for the rest of the tab session.
 *   - Clicks are counted by installPlayStoreClickTracking() via
 *     data-placement="after_listen"; one "app_prompt_shown" per session.
 *
 * MobileFrame's "no store banner in the web app" rule (2026-11-07) is about
 * a permanent page banner; this appears only inside the player, only after
 * listening, and never in the native app.
 */
const DISMISS_KEY = "lokali.afterlisten.dismissed_at";
const CLICKED_KEY = "lokali.afterlisten.clicked";
const SHOWN_KEY = "lokali.afterlisten.shown";
const HIDE_DAYS = 14;

function hiddenHere(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (t && Date.now() - t < HIDE_DAYS * 864e5) return true;
    if (sessionStorage.getItem(CLICKED_KEY)) return true;
  } catch {
    /* storage blocked — show it; dismissal just won't persist */
  }
  return false;
}

export function ContinueInAppPrompt({
  ready,
  userId,
}: {
  /** true once the listener has heard enough (the player decides). */
  ready: boolean;
  userId: string | null;
}) {
  const t = useT();
  const [platform, setPlatform] = useState<StorePlatform | null>(null);
  const [open, setOpen] = useState(false);
  const latched = useRef(false);

  useEffect(() => {
    if (!ready || latched.current) return;
    latched.current = true;
    if (typeof window === "undefined" || window.location.pathname === "/app") return;
    const p = storePlatform();
    if (p === "native" || hiddenHere()) return;
    setPlatform(p);
    setOpen(true);
    try {
      if (!sessionStorage.getItem(SHOWN_KEY)) {
        sessionStorage.setItem(SHOWN_KEY, "1");
        trackEvent("app_prompt_shown", { placement: "after_listen", platform: p }, userId);
      }
    } catch {
      /* ignore */
    }
  }, [ready, userId]);

  if (!open || !platform || platform === "native") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const clicked = () => {
    try {
      sessionStorage.setItem(CLICKED_KEY, "1");
    } catch {
      /* ignore */
    }
    // Let the click handlers (tracking, navigation) run first.
    setTimeout(() => setOpen(false), 400);
  };

  const desktop = platform === "desktop";
  const href =
    platform === "ios"
      ? appStoreUrl("web_after_listen")
      : `${PLAY_URL}&utm_source=web&utm_medium=after_listen`;

  return (
    <div
      data-placement="after_listen"
      data-store-variant={platform}
      className="relative z-10 mt-3 flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-background/50 py-2 pl-3 pr-1"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {t("appPrompt.title")}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {desktop ? t("playBanner.qrHint") : t("appPrompt.sub")}
        </p>
      </div>
      {desktop ? (
        <div className="shrink-0 rounded-lg bg-white p-1">
          <img
            src={APP_QR_SRC}
            alt="QR — https://lokali.travel/app"
            width={76}
            height={76}
            className="block h-[76px] w-[76px]"
          />
        </div>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={clicked}
          className="shrink-0 rounded-full bg-[#f5a43c] px-3.5 py-2 text-[12.5px] font-bold text-[#2a1600] transition-smooth active:scale-95"
        >
          {t("playBanner.cta")}
        </a>
      )}
      <button
        onClick={dismiss}
        aria-label={t("playBanner.dismiss")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-smooth hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
