import { Link } from "@tanstack/react-router";
import { Bookmark, Home as HomeIcon, MapPin, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { haptic } from "@/lib/haptics";

export function TabBar() {
  const { user } = useAuth();
  const t = useT();
  // Hide Home + Map when offline — both pages need /api/* round-trips
  // (Home for the dynamic city + museum strips, Map for Leaflet tiles)
  // and showing them in a disabled or broken state is worse than just
  // collapsing the nav to what actually works offline: Saved tours +
  // sign-out/sign-in. The full nav comes back as soon as the network
  // returns (useOnlineStatus listens to `navigator.online`/`offline`
  // events).
  const online = useOnlineStatus();
  // Single shared light haptic for every tab tap. The Link's onClick
  // fires before the route transition starts, so the tap-feedback
  // happens at the moment of touch — exactly what users expect from
  // native iOS / Android nav bars. No-op on web (or no Vibration API).
  const tapHaptic = () => void haptic("light");
  return (
    <nav
      // Tap-target = 56 px (icon 19 + 4 gap + label 10 + padding).
      // Material Design's standard BottomNavigationView is 56 dp,
      // iOS tab bar is 49 pt, so 56 keeps us in normal-app territory.
      // items-center vertically centres the icons inside the visible
      // strip — `items-start + pt-2` previously parked them at the
      // top of the nav and left a visible empty band below the
      // labels (Beka caught this in a real Android screenshot).
      style={{
        // Total height = 56 px tap-target + safe-area inset below it
        // (gesture bar / home indicator clearance). max() floor of
        // 8 px handles Android edge-to-edge mode where env() resolves
        // to 0 inside the Capacitor WebView even when a gesture bar
        // IS overlapping — keeps a tiny breathing strip without
        // padding the nav with dead pixels. Devices that report a
        // real inset (Samsung 3-button bar, iPhone home indicator)
        // get full clearance through the env() branch.
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}
      // min-h-14 (not h-14) so the bar grows when env(safe-area-inset-bottom)
      // reports a real value — keeps the 56 px tap zone PLUS the inset.
      // With h-14 + border-box, the dynamic paddingBottom would eat into
      // the content area and squish the icons on devices with a 3-button
      // nav bar.
      className="absolute bottom-0 left-0 right-0 z-50 flex min-h-14 items-center justify-around border-t border-border bg-background/95 px-2 pt-2 backdrop-blur-xl"
    >
      {online && (
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
      )}
      {/* Explore tab removed per Beka — the home page already
          surfaces destinations via the search bar and the Featured
          cities strip, so the standalone tab was redundant. The
          /destinations route itself stays alive (Home's search +
          city pill still navigate to it); this is just a tab-bar
          tidy. */}
      {online && (
        <Link
          to="/map"
          onClick={tapHaptic}
          className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
          activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
        >
          <MapPin className="h-[19px] w-[19px]" />
          <span className="text-[10px] font-medium">{t("nav.map")}</span>
        </Link>
      )}
      <Link
        to="/saved"
        onClick={tapHaptic}
        className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
        activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
      >
        <Bookmark className="h-[19px] w-[19px]" />
        <span className="text-[10px] font-medium">{t("nav.saved")}</span>
      </Link>
      {online &&
        (user ? (
          // Profile hub — was a direct Sign-out button until 2026-06-18.
          // Beka asked to demote destructive actions out of the persistent
          // nav AND to land the user on a single profile-shaped page
          // that already includes settings (no second tap to reach
          // them). So this points at /settings — the renamed Profile
          // page — which now starts with an identity card and unfolds
          // into the full preferences list below. /profile is still a
          // valid URL but it redirects to /settings server-side.
          <Link
            to="/settings"
            onClick={tapHaptic}
            className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
            activeProps={{ className: "flex flex-1 flex-col items-center gap-1 text-primary" }}
          >
            <UserIcon className="h-[19px] w-[19px]" />
            <span className="text-[10px] font-medium">{t("nav.profile")}</span>
          </Link>
        ) : (
          <Link
            to="/auth"
            onClick={tapHaptic}
            className="flex flex-1 flex-col items-center gap-1 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <UserIcon className="h-[19px] w-[19px]" />
            <span className="text-[10px] font-medium">{t("nav.signIn")}</span>
          </Link>
        ))}
    </nav>
  );
}
