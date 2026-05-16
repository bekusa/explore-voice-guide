import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Lock, ArrowLeft, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Lokali" },
      { name: "description", content: "Sign in or create an account to save audio tours." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const t = useT();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<null | "google" | "apple" | "guest">(null);

  // Redirect if already signed in. Send to onboarding if profile is unset.
  useEffect(() => {
    const route = async (userId: string, isAnonymous: boolean) => {
      // Anonymous users skip the onboarding profile lookup — they have
      // no profile row by definition. Send them straight into the app.
      if (isAnonymous) {
        navigate({ to: "/" });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_language, preferred_voice")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile?.preferred_language && profile?.preferred_voice) {
        navigate({ to: "/" });
      } else {
        navigate({ to: "/onboarding" });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        route(data.session.user.id, !!data.session.user.is_anonymous);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) route(session.user.id, !!session.user.is_anonymous);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  /* ─── OAuth (Google + Apple) ─── */
  const signInWithProvider = async (provider: "google" | "apple") => {
    setOauthLoading(provider);
    try {
      // Different redirect target depending on platform:
      // - Web → "${origin}/auth"; the browser stays in this tab and
      //   the OAuth flow lands back on this page, where the auth
      //   state-change subscription routes to /onboarding or /.
      // - Native (Android/iOS via Capacitor) → "com.lokali.app://auth/callback";
      //   Supabase redirects the system browser back to that custom
      //   scheme, AndroidManifest's intent filter wakes the wrapped
      //   app, and useCapacitorBridge calls exchangeCodeForSession to
      //   finalise the session inside the WebView.
      const { Capacitor } = await import("@capacitor/core");
      const redirectTo = Capacitor.isNativePlatform()
        ? "com.lokali.app://auth/callback"
        : `${window.location.origin}/auth`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
      // signInWithOAuth opens an external redirect; we won't return
      // here unless the redirect failed.
    } catch (err) {
      setOauthLoading(null);
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.signInFailed"), { description: msg });
    }
  };

  /* ─── Anonymous mode ─── */
  const continueAsGuest = async () => {
    setOauthLoading("guest");
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      // onAuthStateChange in the effect above handles the redirect.
    } catch (err) {
      setOauthLoading(null);
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.signInFailed"), { description: msg });
    }
  };

  /* ─── Password reset ─── */
  const sendResetEmail = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Supabase emails this URL with a recovery token. The
        // /auth/reset-password route picks up the token from the
        // hash and lets the user set a new password.
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      toast.success(t("auth.resetEmailSent"), {
        description: t("auth.resetEmailSentDesc"),
      });
      setMode("signin");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.signInFailed"), { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "reset") return sendResetEmail(e);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success(t("auth.accountCreated"), { description: t("auth.welcomeAboard") });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(t("auth.welcomeBackToast"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(mode === "signup" ? t("auth.signUpFailed") : t("auth.signInFailed"), {
        description: msg.includes("already registered") ? t("auth.alreadyRegistered") : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pt-safe pb-10">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-smooth"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("nav.back")}
        </Link>

        <div className="mb-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {mode === "signin"
              ? t("auth.welcomeBack")
              : mode === "signup"
                ? t("auth.beginJourney")
                : t("auth.resetPasswordTitle")}
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            {mode === "signin"
              ? t("auth.signInCont")
              : mode === "signup"
                ? t("auth.createAcct")
                : t("auth.resetPasswordTitle")}
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {mode === "reset" ? t("auth.resetPasswordSub") : t("auth.subtitle")}
          </p>
        </div>

        {/* OAuth buttons — hidden on reset mode. Google works today;
            Apple is wired to a placeholder toast until Beka has an
            Apple Developer account ($99/yr) and we set up the
            Apple Services ID + key in Supabase. */}
        {mode !== "reset" && (
          <>
            <div className="flex flex-col gap-2.5 mb-4">
              <button
                type="button"
                onClick={() => signInWithProvider("google")}
                disabled={!!oauthLoading}
                className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-smooth hover:bg-secondary disabled:opacity-60"
              >
                {oauthLoading === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                {t("auth.continueWithGoogle")}
              </button>
              <button
                type="button"
                onClick={() => toast.info(t("auth.appleComingSoon"))}
                disabled={!!oauthLoading}
                className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground/60 transition-smooth hover:bg-secondary disabled:opacity-60"
              >
                <AppleIcon className="h-4 w-4" />
                {t("auth.continueWithApple")}
              </button>
            </div>
            <div className="relative my-4 flex items-center">
              <div className="flex-1 border-t border-border" />
              <span className="px-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("auth.orWithEmail")}
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground w-16 shrink-0">
                {t("auth.name")}
              </span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("auth.yourName")}
                className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
                autoComplete="name"
              />
            </label>
          )}

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

          {mode !== "reset" && (
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
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>
          )}

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => setMode("reset")}
              className="-mt-1 self-end text-[12px] font-medium text-muted-foreground hover:text-primary transition-smooth"
            >
              {t("auth.forgotPassword")}
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !!oauthLoading}
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-gold px-5 text-[14px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "signin" ? (
              t("auth.signIn")
            ) : mode === "signup" ? (
              t("auth.signUp")
            ) : (
              t("auth.sendResetLink")
            )}
          </button>
        </form>

        {/* Mode toggles + guest option */}
        {mode === "reset" ? (
          <button
            onClick={() => setMode("signin")}
            className="mt-6 text-center text-[12px] text-muted-foreground hover:text-foreground transition-smooth"
          >
            ← {t("auth.signIn")}
          </button>
        ) : (
          <>
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-6 text-center text-[12px] text-muted-foreground hover:text-foreground transition-smooth"
            >
              {mode === "signin" ? (
                <>
                  {t("auth.noAccount")}{" "}
                  <span className="font-semibold text-primary">{t("auth.signUpLink")}</span>
                </>
              ) : (
                <>
                  {t("auth.haveAccount")}{" "}
                  <span className="font-semibold text-primary">{t("auth.signInLink")}</span>
                </>
              )}
            </button>

            {/* Anonymous mode — let users try the app without an
                account. Their saves + downloads stay on-device; if
                they later sign up we link the anonymous user to a
                real email so the data carries over. Supabase
                requires "Enable anonymous sign-ins" toggled on in
                Authentication → Providers settings. */}
            <button
              type="button"
              onClick={continueAsGuest}
              disabled={!!oauthLoading || loading}
              className="mt-8 flex h-11 items-center justify-center gap-2 rounded-full border border-dashed border-border bg-transparent px-4 text-[12px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-smooth disabled:opacity-60"
            >
              {oauthLoading === "guest" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserIcon className="h-3.5 w-3.5" />
              )}
              {t("auth.continueAsGuest")}
            </button>
            <p className="mt-2 text-center text-[10.5px] leading-relaxed text-muted-foreground/70 max-w-[280px] mx-auto">
              {t("auth.guestNote")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Inline SVG provider logos ─────────────────────────────────── */

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.3C29.6 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.3c-.5.4 6.4-4.7 6.4-15-0-1.3-.1-2.3-.4-3.4z"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} aria-hidden fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}
