import { Link } from "@tanstack/react-router";
import { Bookmark, Home as HomeIcon, LogOut, MapPin, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";
import { haptic } from "@/lib/haptics";

export function TabBar() {
  const { user, signOut } = useAuth();
  const t = useT();
  // Single shared light haptic for every tab tap. The Link's onClick
  // fires before the route transition starts, so the tap-feedback
  // happens at the moment of touch — exactly what users expect from
  // native iOS / Android nav bars. No-op on web (or no Vibration API).
  const tapHaptic = () => void haptic("light");
  return (
    <nav
      // Tap-target = 56 px (icon 19 + 4 gap + label 10 + padding).
      // Was 74 px but Beka caught the nav looking visibly oversized
      // on a real Android device — Material Design's standard
      // BottomNavigationView is 56 dp, iOS tab bar is 49 pt, so
      // 56 keeps us in normal-app territory. Below the tap-target
      // we add a safe-area inset so the labels stay clear of
      // Android's gestures bar / iPhone's home indicator.
      style={{
        // max() with a hardcoded floor — on Android edge-to-edge
        // (Pixel 10 Pro, API 35+) env(safe-area-inset-bottom) often
        // resolves to 0 even though the gesture bar IS overlapping.
        // 16 px floor keeps labels clear of the bar without
        // ballooning the total height; devices with real inset
        // get extra breathing room. Total nav height = 56 px tap-
        // target + floor → ~72 px on edge-to-edge Android (was 98 px).
        height: "calc(56px + max(16px, env(safe-area-inset-bottom)))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
      className="absolute bottom-0 left-0 right-0 z-50 flex items-start justify-around border-t border-border bg-background/95 px-2 pt-2 backdrop-blur-xl"
    >
      <Link
        to="/"
        onClick={tapHaptic}
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
        onClick={tapHaptic}
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <MapPin className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">{t("nav.map")}</span>
      </Link>
      <Link
        to="/saved"
        onClick={tapHaptic}
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <Bookmark className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">{t("nav.saved")}</span>
      </Link>
      {user ? (
        <button
          onClick={() => {
            tapHaptic();
            void signOut();
          }}
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        >
          <LogOut className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">{t("nav.signOut")}</span>
        </button>
      ) : (
        <Link
          to="/auth"
          onClick={tapHaptic}
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        >
          <UserIcon className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">{t("nav.signIn")}</span>
        </Link>
      )}
    </nav>
  );
}
