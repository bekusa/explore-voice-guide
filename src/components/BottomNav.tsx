import { Link, useLocation } from "@tanstack/react-router";
import { Compass, Map, BookmarkCheck, Settings } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { t } = useT();
  const { pathname } = useLocation();

  const items = [
    { to: "/", label: t("discover"), icon: Compass, exact: true },
    { to: "/results", label: t("mapTab"), icon: Map },
    { to: "/library", label: t("libraryTab"), icon: BookmarkCheck },
    { to: "/settings", label: t("settingsTab"), icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-card/95 backdrop-blur-md pb-safe">
      <ul className="flex items-stretch justify-around px-2 pt-2">
        {items.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} strokeWidth={active ? 2.4 : 2} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
