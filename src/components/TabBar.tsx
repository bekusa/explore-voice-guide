import { Link } from "@tanstack/react-router";
import { Bookmark, Home as HomeIcon, LogOut, MapPin, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";

export function TabBar() {
  const { user, signOut } = useAuth();
  const t = useT();
  return (
    <nav
      // 74px is the original touch-target height (icon + label + padding).
      // We grow the nav vertically by env(safe-area-inset-bottom) so it
      // stays visible above Android's navigation gestures bar (the
      // | O < strip) and iPhone's home indicator. env() resolves to 0
      // in browsers without notch/gestures, so desktop preview and
      // older Android keep the original look.
      style={{
        // max() with a hardcoded floor — on Android edge-to-edge
        // (Pixel 10 Pro, API 35+) env(safe-area-inset-bottom) often
        // resolves to 0 even though the gesture bar IS overlapping.
        // Floor of 24 px keeps labels clear of the bar regardless;
        // devices with real inset get more breathing room. Total
        // nav height = 74 px tap-target + floor, so the icons
        // never disappear behind system chrome.
        height: "calc(74px + max(24px, env(safe-area-inset-bottom)))",
        paddingBottom: "max(24px, calc(1rem + env(safe-area-inset-bottom)))",
      }}
      className="absolute bottom-0 left-0 right-0 z-50 flex items-start justify-around border-t border-border bg-background/95 px-2 pt-2 backdrop-blur-xl"
    >
      <Link
        to="/"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeOptions={{ exact: true }}
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <HomeIcon className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">{t("nav.home")}</span>
      </Link>
      {/* Explore tab removed per Beka — the home page already
          surfaces destinations via the search bar and the Featured
          cities strip, so the standalone tab was redundant. The
          /destinations route itself stays alive (Home's search +
          city pill still navigate to it); this is just a tab-bar
          tidy. */}
      <Link
        to="/map"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <MapPin className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">{t("nav.map")}</span>
      </Link>
      <Link
        to="/saved"
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <Bookmark className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">{t("nav.saved")}</span>
      </Link>
      {user ? (
        <button
          onClick={() => signOut()}
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        >
          <LogOut className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">{t("nav.signOut")}</span>
        </button>
      ) : (
        <Link
          to="/auth"
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        >
          <UserIcon className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">{t("nav.signIn")}</span>
        </Link>
      )}
    </nav>
  );
}
