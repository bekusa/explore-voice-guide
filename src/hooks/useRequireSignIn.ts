import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { useT } from "@/hooks/useT";

/**
 * Returns a guard fn — callable from any action handler — that asks
 * for a signed-in user before letting the action proceed. Used by
 * Save and Download throughout the app: Beka's spec is that both
 * persist user-scoped data, so we want a session attached so the
 * eventual cloud-sync layer has a UID to write against.
 *
 * Anonymous mode counts — the underlying Supabase session is a real
 * row in auth.users, so the data has somewhere to belong. Only the
 * truly-signed-out (no session at all) path is rejected.
 *
 * The toast carries a one-tap "Sign in" action so the user doesn't
 * have to hunt for /auth. Mirrors the listen-gate UX from Phase 2.
 *
 * Usage:
 *   const requireSignIn = useRequireSignIn();
 *   const toggleSave = () => {
 *     if (!requireSignIn("save")) return;
 *     // ... proceed
 *   };
 */
export function useRequireSignIn() {
  const t = useT();
  const navigate = useNavigate();
  return (user: User | null | undefined, intent: "save" | "download") => {
    if (user) return true;
    const titleKey = intent === "save" ? "auth.saveSignInTitle" : "auth.downloadSignInTitle";
    const descKey = intent === "save" ? "auth.saveSignInDesc" : "auth.downloadSignInDesc";
    toast.error(t(titleKey), {
      description: t(descKey),
      action: {
        label: t("auth.listenSignInCta"),
        onClick: () => navigate({ to: "/auth" }),
      },
    });
    return false;
  };
}
