import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Lock, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";

/**
 * Password reset landing page. Supabase emails this URL with a
 * recovery token in the URL hash; on mount the auth client picks
 * up the token automatically (PASSWORD_RECOVERY event), and the
 * form below lets the user set a fresh password via
 * supabase.auth.updateUser({ password }).
 *
 * Reached from /auth when the user clicks "Forgot password?", asks
 * for a reset email, and then clicks the link inside.
 */
export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · Lokali" },
      { name: "description", content: "Set a new password for your Lokali account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  // Track whether the recovery session is established. If the user
  // landed here without clicking a real reset link (direct URL, copy/
  // paste), updateUser() will fail. We surface that early.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The recovery token in the URL hash hydrates the session
    // automatically via supabase's GoTrueClient on mount. We just
    // wait for the PASSWORD_RECOVERY event (or an existing session)
    // before enabling the form.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("auth.passwordUpdated"), {
        description: t("auth.passwordUpdatedDesc"),
      });
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.somethingWrong"), { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pt-safe pb-10">
        <Link
          to="/auth"
          className="mb-10 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-smooth"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("nav.back")}
        </Link>

        <div className="mb-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {t("auth.resetPasswordTitle")}
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            {t("auth.setNewPasswordTitle")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.newPassword")}
              className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
              autoComplete="new-password"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("auth.confirmPassword")}
              className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !ready}
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-gold px-5 text-[14px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.setNewPasswordTitle")}
          </button>
        </form>
      </div>
    </div>
  );
}
