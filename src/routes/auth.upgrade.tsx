import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Lock, ArrowLeft, User as UserIcon, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";

/**
 * Anonymous → email/password upgrade.
 *
 * Reached from Settings → Account (for users currently in guest mode).
 * Lets a guest convert their existing anonymous user row into a
 * permanent account WITHOUT losing the saves, downloads, or profile
 * tied to that UID. Supabase exposes this as
 * `supabase.auth.updateUser({ email, password })` on the in-flight
 * anonymous session — same UID, just newly-claimable credentials.
 *
 * Flow:
 *  1) User submits email + password (+ optional display name).
 *  2) `updateUser({ email, password })` sets the password immediately
 *     AND emails the new address with a confirmation link.
 *  3) Until they click the link, `email_confirmed_at` is null —
 *     EmailVerificationBanner will surface the "verify email" hint
 *     across the app. `is_anonymous` flips to false right away (the
 *     account has credentials), so they can sign back in with email +
 *     password from any device once the email is confirmed.
 *
 * Guards:
 *  - If the user is not signed in at all, send them to /auth.
 *  - If the user is already a real (non-anonymous) account, send
 *    them to settings — there's nothing to upgrade. They'd reach
 *    this page only via a stale link.
 */
export const Route = createFileRoute("/auth/upgrade")({
  head: () => ({
    meta: [
      { title: "Save your account · Lokali" },
      {
        name: "description",
        content: "Add an email + password to your guest account so your tours sync across devices.",
      },
    ],
  }),
  component: UpgradeAccountPage,
});

function UpgradeAccountPage() {
  const navigate = useNavigate();
  const t = useT();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect away if the user is the wrong kind of session for this
  // page. We wait for `authLoading` to settle so we don't bounce on
  // the initial undefined-then-resolved transition.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!user.is_anonymous) {
      // Already a permanent account — there is nothing to upgrade.
      // Send them to settings, which is where this page is launched
      // from in the first place.
      navigate({ to: "/settings" });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    setLoading(true);
    try {
      // Single updateUser call sets email, password, and the
      // display_name metadata in one shot. Supabase queues the email
      // verification side-effect (via the "email change" template,
      // since the user's prior anon row had no email) and applies
      // the password immediately.
      const { error } = await supabase.auth.updateUser({
        email,
        password,
        data: { display_name: displayName.trim() || email.split("@")[0] },
      });
      if (error) throw error;

      // Mirror the display name into the public profiles row so the
      // Settings header + future personalised greetings can pick it
      // up without re-reading user_metadata.
      if (user) {
        await supabase
          .from("profiles")
          .upsert(
            {
              user_id: user.id,
              display_name: displayName.trim() || email.split("@")[0],
            },
            { onConflict: "user_id" },
          );
      }

      toast.success(t("auth.upgradeSuccess"), {
        description: t("auth.upgradeSuccessDesc"),
      });
      navigate({ to: "/settings" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.upgradeFailed"), {
        description: msg.includes("already registered") || msg.includes("already been registered")
          ? t("auth.alreadyRegistered")
          : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user || !user.is_anonymous) {
    // Either still resolving the session or the effect above is
    // about to redirect — show a quiet loader rather than flashing
    // the form for a frame.
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pt-safe pb-10">
        <Link
          to="/settings"
          className="mb-10 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-smooth"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("nav.back")}
        </Link>

        <div className="mb-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {t("auth.upgradeAccount")}
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            {t("auth.upgradeTitle")}
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {t("auth.upgradeSub")}
          </p>
        </div>

        {/* Benefits stripe — visual reinforcement that nothing is lost
            and a few things are gained. Anonymous mode is a real,
            useful state, so we phrase this as "carry your data
            forward" rather than scaring the user into thinking guest
            mode was a mistake. */}
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[12px] leading-relaxed text-foreground/90">
              {t("auth.upgradeBenefit1")}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[12px] leading-relaxed text-foreground/90">
              {t("auth.upgradeBenefit2")}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("auth.yourName")}
              className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
              autoComplete="name"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
              autoComplete="email"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.password")}
              className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-gold px-5 text-[14px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.upgradeCta")}
          </button>

          <p className="mt-2 text-center text-[10.5px] leading-relaxed text-muted-foreground/70">
            {t("auth.upgradeFootnote")}
          </p>
        </form>
      </div>
    </div>
  );
}
