import { useEffect, useState } from "react";
import { Mail, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/hooks/useT";

/**
 * Top-of-page banner shown when a signed-in user's email isn't
 * verified yet. Soft gate — the user can keep browsing, but save /
 * download actions check `isEmailVerified()` and toast a hint if
 * the email is still unconfirmed.
 *
 * Hidden for:
 *  - Signed-out users (we have no email to verify)
 *  - OAuth users (Google verifies email server-side; Supabase
 *    sets email_confirmed_at automatically for OAuth signins)
 *  - Anonymous users (no email at all)
 *  - Users whose email_confirmed_at is set
 *  - Users who dismissed the banner this session (sessionStorage)
 */

const SESSION_DISMISSED_KEY = "tg.emailBannerDismissed";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);

  // Read sessionStorage on mount so a Refresh doesn't bring the
  // banner back after dismissal in the same tab session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissed(sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1");
    } catch {
      /* private mode / etc. — leave dismissed=false */
    }
  }, []);

  if (!user) return null;
  if (user.is_anonymous) return null;
  // user.email_confirmed_at is the canonical "this email belongs to
  // this user" flag. Supabase sets it the moment they click the
  // verification email link, OR right at signup time for OAuth
  // providers like Google.
  if (user.email_confirmed_at) return null;
  if (!user.email) return null; // no email to verify
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email!,
      });
      if (error) throw error;
      toast.success(t("auth.resendSent"), { description: t("auth.checkInbox") });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.somethingWrong"), { description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative z-40 flex items-start gap-3 border-b border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-100">
      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">{t("auth.verifyEmailTitle")}</p>
        <p className="mt-0.5 truncate text-[11px] text-amber-200/70">
          {t("auth.verifyEmailSub", { email: user.email })}
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-amber-100 transition-smooth hover:bg-amber-500/25 disabled:opacity-60"
        >
          {resending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Mail className="h-3 w-3" />
          )}
          {t("auth.resendEmail")}
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1 text-amber-200/60 transition-smooth hover:bg-amber-500/15 hover:text-amber-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Convenience predicate for action handlers (save, download, etc.)
 * that need to gate on email verification. Returns true when the
 * user can perform the action, false (+ shows a toast hint) when
 * they need to verify first.
 *
 * Anonymous users PASS this check — guest mode is allowed to save
 * and download locally; only the email-but-not-verified state is
 * blocked. Signed-out users also pass (the action has its own
 * sign-in gate downstream).
 */
export function checkEmailVerified(
  user: ReturnType<typeof useAuth>["user"],
  t: ReturnType<typeof useT>,
): boolean {
  if (!user) return true;
  if (user.is_anonymous) return true;
  if (!user.email) return true;
  if (user.email_confirmed_at) return true;
  toast.error(t("auth.verifyEmailTitle"), {
    description: t("auth.verifyEmailSub", { email: user.email }),
  });
  return false;
}
