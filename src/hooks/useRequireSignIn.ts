import { createElement } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
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
/**
 * The one place the sign-in prompt is built.
 *
 * Exported because three other screens raise the same prompt without
 * going through the hook (they have their own `authLoading` branch):
 * attraction.$id.tsx and tm-sim.$id.$role.tsx. Those used to carry
 * their own copy of the toast, which is why the red-and-shouty
 * version survived in four places at once — restyling one would have
 * fixed a quarter of the problem.
 */
export function showSignInToast(title: string, cta: string, onSignIn: () => void) {
  toast(title, {
    // createElement, not JSX — this file is .ts, and renaming it to
    // .tsx for one icon is not worth the churn.
    icon: createElement(KeyRound, { className: "h-5 w-5 text-primary" }),
    action: { label: cta, onClick: onSignIn },
  });
}

export function useRequireSignIn() {
  const t = useT();
  const navigate = useNavigate();
  return (user: User | null | undefined, intent: "save" | "download" | "listen") => {
    if (user) return true;
    // Per-intent toast copy. "listen" is used by the must-see mini
    // player (and any other surface that fires TTS without a heavier
    // save / download motion) so signed-out users hit the same gate
    // as Save / Download — Beka caught the leak during pre-launch
    // device testing.
    const titleKey =
      intent === "save"
        ? "auth.saveSignInTitle"
        : intent === "download"
          ? "auth.downloadSignInTitle"
          : "auth.listenSignInTitle";
    /* Plain toast(), NOT toast.error(). Beka 2026-11-01: "არ არის
     * აუცილებელი ძახილის ნიშნით ლაპარაკი, უკეთესი UI/UX გვჭირდება
     * და არა შესაშინებელი რამე შეტყობინება."
     *
     * He is right, and not only aesthetically: nothing has gone
     * wrong here. The user tapped Listen and we are asking them to
     * sign in. A red panel with a warning triangle says "you broke
     * something", which is both untrue and a bad first impression at
     * the exact moment we want them to say yes.
     *
     * The icon is a key instead — it names the action rather than
     * raising an alarm.
     *
     * NO description either. The title plus a gold "Sign in" button
     * is the entire message; the long "Audio narration is available
     * to signed-in listeners…" line was three lines of prose nobody
     * reads with a button sitting next to it. Dropping it rather
     * than rewording also keeps all 51 translations honest — a
     * shortened English string would have left every other language
     * showing the old paragraph. */
    showSignInToast(t(titleKey), t("auth.listenSignInCta"), () => navigate({ to: "/auth" }));
    return false;
  };
}
