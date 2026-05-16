import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { useT } from "@/hooks/useT";

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
  hideAiFooter = false,
  floatingPanel,
}: {
  children: ReactNode;
  hideTabBar?: boolean;
  /** Skip the "AI Generated Content" fineprint footer. Use for
   *  pages where the children fill the viewport (the map page's
   *  absolute-positioned canvas, fullscreen modals) — the footer
   *  in those cases either sits below the fold or breaks the
   *  page's intended layout. */
  hideAiFooter?: boolean;
  floatingPanel?: ReactNode;
}) {
  // Reserve room at the bottom of the scroll area so the last item
  // doesn't sit underneath the TabBar (74 px tap zone + at least
  // 24 px below it for Android gesture bar / iPhone home indicator)
  // and, when present, the floating panel above it. max() guards
  // against Android edge-to-edge cases where env() resolves to 0.
  // Numbers stay in sync with TabBar's height calculation.
  const bottomPad =
    !hideTabBar && floatingPanel
      ? "pb-[calc(280px+max(24px,env(safe-area-inset-bottom)))]"
      : !hideTabBar
        ? "pb-[calc(74px+max(24px,env(safe-area-inset-bottom)))]"
        : floatingPanel
          ? "pb-[calc(200px+max(24px,env(safe-area-inset-bottom)))]"
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
          {/* Email-verification banner — top of every page when the
              signed-in user hasn't clicked the confirmation email
              yet. Self-hides for guests, OAuth users, and the
              already-verified. Soft gate: keeps browsing intact and
              the save/download paths surface their own toast hint
              via checkEmailVerified(). */}
          <EmailVerificationBanner />
          {children}
          {/* AI Generated Content fineprint — sits at the very end of
              the scrollable area on every page (Beka asked for it
              everywhere, but ABOVE the menu / floating panel — the
              bottomPad above already reserves room for both, so
              this strip lives just above that reserved space).
              Pages with absolute-positioned content (the map canvas)
              opt out via hideAiFooter so the layout stays simple. */}
          {!hideAiFooter && <AiGeneratedFooter />}
        </div>
        {floatingPanel && (
          <div
            className={`absolute inset-x-0 z-30 ${
              hideTabBar
                ? "bottom-[max(24px,env(safe-area-inset-bottom))]"
                : "bottom-[calc(74px+max(24px,env(safe-area-inset-bottom)))]"
            }`}
          >
            {floatingPanel}
          </div>
        )}
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}

/**
 * Tiny "AI Generated Content" fineprint anchored at the bottom of the
 * scrollable area on every MobileFrame-wrapped page. Beka asked for
 * this everywhere as a transparency note (the place blurbs, narrated
 * scripts, museum highlights, and Time Machine simulations are all
 * Claude-generated). Centered, low-key, picks up the user's locale
 * via `t("ai.generated")`.
 */
function AiGeneratedFooter() {
  const t = useT();
  return (
    <div className="mt-6 mb-2 flex items-center justify-center gap-1.5 px-6 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
      <Sparkles className="h-2.5 w-2.5" />
      <span>{t("ai.generated")}</span>
    </div>
  );
}
