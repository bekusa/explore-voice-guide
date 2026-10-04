import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { PlayStoreBanner } from "@/components/PlayStoreBanner";
import { InlineAudioPanel } from "@/components/InlineAudioPanel";
import { useIsNarrating } from "@/hooks/useNarration";
import { useT } from "@/hooks/useT";

/**
 * Mobile-first preview frame. On mobile screens fills viewport.
 * On larger screens, simulates a phone for design preview.
 *
 * Renders the shared bottom TabBar by default so navigation stays
 * consistent across every page. Pass `hideTabBar` for fullscreen
 * flows (auth, onboarding, player overlays) that shouldn't show it.
 *
 * The audio player is rendered HERE, from the global narration store,
 * rather than passed in by each page (Beka 2026-10-04: "გადავედი სხვა
 * ტაბზე … აუდიო პლეერი რომ დატოვო ჩართული"). It used to be a
 * `floatingPanel` prop that /attraction, /tm-sim and the home hero
 * each filled in; leaving a page therefore unmounted the player and
 * killed playback. Now any page that wraps itself in MobileFrame shows
 * the running narration automatically, and the audio element itself
 * lives outside React entirely (see lib/narrationPlayer.ts).
 *
 * It sits as a SIBLING of the scrolling content (not inside it),
 * pinned just above the TabBar, so it stays visible without forcing
 * the user to scroll back up. Plain `fixed` positioning didn't work
 * here — the desktop preview crops to a 420px phone-shaped container,
 * and a viewport-fixed element drops out of that frame entirely.
 * Anchoring at this level keeps the panel inside the phone on desktop
 * and at the screen edge on mobile in one go.
 */
export function MobileFrame({
  children,
  hideTabBar = false,
  hideAiFooter = false,
  showAiFooter = false,
}: {
  children: ReactNode;
  hideTabBar?: boolean;
  /** Skip the "AI Generated Content" fineprint footer. Use for
   *  pages where the children fill the viewport (the map page's
   *  absolute-positioned canvas, fullscreen modals) — the footer
   *  in those cases either sits below the fold or breaks the
   *  page's intended layout. */
  hideAiFooter?: boolean;
  /** Opt IN to the "AI Generated Content" fineprint. Off by default —
   *  it now lives only on the Profile (Settings) page. */
  showAiFooter?: boolean;
}) {
  // Is a narration running right now? Drives both the player and the
  // extra bottom padding, on every page, with no prop threading.
  const narrating = useIsNarrating();
  // Reserve room at the bottom of the scroll area so the last item
  // doesn't sit underneath the TabBar (56 px tap zone + at least
  // 16 px below it for Android gesture bar / iPhone home indicator)
  // and, when present, the audio player above it. max() guards
  // against Android edge-to-edge cases where env() resolves to 0.
  // Numbers stay in sync with TabBar's height calculation — when
  // editing one, update the other.
  const bottomPad =
    !hideTabBar && narrating
      ? "pb-[calc(280px+max(16px,env(safe-area-inset-bottom)))]"
      : !hideTabBar
        ? "pb-[calc(56px+max(16px,env(safe-area-inset-bottom)))]"
        : narrating
          ? "pb-[calc(200px+max(16px,env(safe-area-inset-bottom)))]"
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
          {/* AI Generated Content fineprint — opt-in via showAiFooter.
              Beka 2026-06-23: removed from every page; now shown ONLY on
              the Profile (Settings) page as a single transparency note.
              hideAiFooter kept as a suppression override for safety. */}
          {showAiFooter && !hideAiFooter && <AiGeneratedFooter />}
        </div>
        {narrating && (
          <div
            className={`absolute inset-x-0 z-30 ${
              hideTabBar
                ? "bottom-[max(16px,env(safe-area-inset-bottom))]"
                : "bottom-[calc(56px+max(16px,env(safe-area-inset-bottom)))]"
            }`}
          >
            <InlineAudioPanel />
          </div>
        )}
        {/* "Get it on Google Play" pill — WEB visitors only (the
            component self-hides inside the Capacitor app + after
            dismissal). Pinned above the TabBar, below the player's
            z-30 so the audio player wins when both are up. Beka
            2026-07-31, production launch. */}
        {!narrating && (
          <div
            className={`absolute inset-x-0 z-20 ${
              hideTabBar
                ? "bottom-[max(28px,env(safe-area-inset-bottom))]"
                : "bottom-[calc(88px+max(16px,env(safe-area-inset-bottom)))]"
            }`}
          >
            <PlayStoreBanner />
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
