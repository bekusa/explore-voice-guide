import { Link } from "@tanstack/react-router";
import { Bookmark, Home as HomeIcon, LogOut, MapPin, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";

export function TabBar() {
  const { user, signOut } = useAuth();
  const t = useT();
  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 flex h-[74px] items-start justify-around border-t border-border bg-background/95 px-2 pb-4 pt-2 backdrop-blur-xl">
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
