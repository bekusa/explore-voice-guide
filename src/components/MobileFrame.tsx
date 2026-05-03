import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";

/**
 * Mobile-first preview frame. On mobile screens fills viewport.
 * On larger screens, simulates a phone for design preview.
 *
 * Renders the shared bottom TabBar by default so navigation stays
 * consistent across every page. Pass `hideTabBar` for fullscreen
 * flows (auth, onboarding, player overlays) that shouldn't show it.
 */
export function MobileFrame({
  children,
  hideTabBar = false,
}: {
  children: ReactNode;
  hideTabBar?: boolean;
}) {
  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center md:p-8">
      <div className="relative w-full h-[100dvh] md:w-[420px] md:h-[860px] md:rounded-[3rem] md:border md:border-border md:shadow-elegant overflow-hidden bg-background">
        <div
          className={`h-full w-full overflow-y-auto scrollbar-hide ${hideTabBar ? "" : "pb-[74px]"}`}
        >
          {children}
        </div>
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}
