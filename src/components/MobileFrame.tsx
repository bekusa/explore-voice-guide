import type { ReactNode } from "react";

/**
 * Mobile-first preview frame. On mobile screens fills viewport.
 * On larger screens, simulates a phone for design preview.
 */
export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center md:p-8">
      <div className="relative w-full md:w-[420px] md:h-[860px] md:rounded-[3rem] md:border md:border-border md:shadow-elegant overflow-hidden bg-background">
        <div className="h-full w-full overflow-y-auto scrollbar-hide">
          {children}
        </div>
      </div>
    </div>
  );
}
