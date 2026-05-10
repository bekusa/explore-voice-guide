import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";

/**
 * Mobile-first preview frame. On mobile screens fills viewport.
 * On larger screens, simulates a phone for design preview.
 *
 * Renders the shared bottom TabBar by default so navigation stays
 * consistent across every page. Pass `hideTabBar` for fullscreen
 * flows (auth, onboarding, player overlays) that shouldn't show it.
 *
 * `floatingPanel` is a separate slot rendered as a SIBLING of the
 * scrolling content (not inside it) and pinned just above the TabBar.
 * Use it for persistent UI like the audio player that has to stay
 * visible without forcing the user to scroll back up. Plain `fixed`
 * positioning didn't work here — the desktop preview crops to a 420px
 * phone-shaped container, and a viewport-fixed element drops out of
 * that frame entirely. Anchoring at this level keeps the panel inside
 * the phone on desktop and at the screen edge on mobile in one go.
 */
export function MobileFrame({
  children,
  hideTabBar = false,
  floatingPanel,
}: {
  children: ReactNode;
  hideTabBar?: boolean;
  floatingPanel?: ReactNode;
}) {
  // Reserve room at the bottom of the scroll area so the last item
  // doesn't sit underneath the TabBar (74px) and, when present, the
  // floating panel above it. The panel's actual height varies, so we
  // budget a generous 200px when it's mounted.
  const bottomPad =
    !hideTabBar && floatingPanel
      ? "pb-[280px]"
      : !hideTabBar
        ? "pb-[74px]"
        : floatingPanel
          ? "pb-[200px]"
          : "";
  return (
    // Use min-h-[100dvh] (dynamic viewport) instead of min-h-screen
    // (= 100vh, the LARGEST height incl. browser chrome). On iOS
    // Safari `vh > dvh` whenever the address bar is visible — the
    // flex centering then pushed the inner phone container down a
    // few pixels and left an empty strip at the top in the browser.
    // Beka caught this on his phone. md:items-center keeps the
    // desktop preview centred vertically inside the desktop window.
    <div className="min-h-[100dvh] w-full bg-background flex items-start justify-center overflow-x-hidden md:items-center md:p-8">
      <div className="relative w-full h-[100dvh] md:w-[420px] md:h-[860px] md:rounded-[3rem] md:border md:border-border md:shadow-elegant overflow-hidden bg-background">
        {/* overflow-x-hidden on the inner scroll container too —
            Beka caught the page sliding left on mobile when a child
            (long city pill, oversized chip row) blew past the
            viewport edge. The outer overflow:hidden clips visually
            but doesn't stop the horizontal swipe gesture; the inner
            overflow-x-hidden does. */}
        <div
          className={`h-full w-full overflow-y-auto overflow-x-hidden scrollbar-hide ${bottomPad}`}
        >
          {children}
        </div>
        {floatingPanel && (
          <div className={`absolute inset-x-0 z-30 ${hideTabBar ? "bottom-0" : "bottom-[74px]"}`}>
            {floatingPanel}
          </div>
        )}
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}
