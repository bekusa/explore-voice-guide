import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Lock, ArrowLeft, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";
import { MobileFrame } from "@/components/MobileFrame";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to Lokali — Save Your Audio Guides and Trips" },
      {
        name: "description",
        content:
          "Sign in to Lokali to save audio guides, keep your trips in sync across devices and pick up any tour where you left off. Free, no subscription needed.",
      },
      // Bing flagged this page three ways at once (short title, short
      // description, thin content) — and it is right: a sign-in form has
      // nothing to rank for. noindex,follow removes all three findings and
      // costs no traffic, while still letting the crawler follow the links
      // back into the site. Keep the title/description above anyway: they
      // are what a browser tab and a shared link show. 2026-09-25.
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";

/**
 * Social providers wired to Supabase Auth.
 *
 * ⚠️ These strings are SUPABASE provider ids, not brand names.
 * Microsoft's id is **"azure"** — passing "microsoft" returns
 * "Unsupported provider" and is the single easiest mistake to make
 * here. Facebook's is plain "facebook".
 *
 * Adding a provider needs THREE things, and it silently fails if any
 * one is missing:
 *   1. this type + a button below
 *   2. the provider enabled in Supabase Dashboard → Authentication →
 *      Providers, with its client id/secret
 *   3. the redirect URL registered on the provider's own side
 *      (https://dwyajguhgyjbgkpzjaln.supabase.co/auth/v1/callback)
 */
export type OAuthProvider = "google" | "apple" | "facebook" | "azure";

/**
 * Facebook + Microsoft sign-in buttons: HIDDEN. Beka 2026-09-22.
 *
 * Not "coming soon" placeholders like Apple — hidden outright. With
 * Apple already a dead placeholder, showing two more greyed-out
 * buttons would have left three of four options non-functional, which
 * reads as a broken app rather than a short list.
 *
 * ── Why they were turned off ──────────────────────────────────────
 * Both reached the provider and then failed, for two DIFFERENT
 * reasons, both found by reading the outgoing OAuth URL:
 *
 *   Facebook — Supabase sent
 *     client_id=beka.tsitskishvili%40gmail.com
 *   The Client ID field in the Supabase dashboard had been filled by
 *   the BROWSER'S AUTOFILL with his email instead of the App ID
 *   (2169525187777606). Facebook rejects the whole request.
 *
 *   Microsoft — Supabase sent `scope=openid` and nothing else. With
 *   only `openid`, Microsoft returns no email address, and Supabase
 *   cannot create a user without one. It needs
 *   `openid profile email`, passed as `scopes` on signInWithOAuth.
 *
 * ── To re-enable ──────────────────────────────────────────────────
 *   1. Supabase → Auth → Providers → Facebook: set Client ID to the
 *      real App ID. Check the secret the same way — autofill hits
 *      that field too.
 *   2. Add `scopes: "openid profile email"` for azure (and keep
 *      "email" for facebook) in signInWithProvider's options.
 *   3. Flip this flag to true.
 *
 * Everything else is intact on purpose — the provider type, the
 * shared OAuth branch, both icons, and all 44 locales' button labels.
 * Re-enabling is this one boolean plus the two fixes above.
 */
const SHOW_FB_MS = false;

/**
 * Sign in with Apple — NATIVE, iOS app only. Beka 2026-10-25.
 *
 * App Store guideline 4.8: an app that offers Google sign-in must also
 * offer Sign in with Apple. On iOS we use Apple's own sheet (Face ID,
 * "Hide My Email") through @capacitor-community/apple-sign-in, then
 * hand the identity token to Supabase with signInWithIdToken.
 *
 * Why native and not the browser OAuth flow the other providers use:
 * the native path needs NO client secret in Supabase, so there is no
 * 6-monthly secret rotation to forget. Supabase only needs the bundle
 * id `app.lokali.travel` in Apple provider → Client IDs.
 *
 * Android + web keep the "coming soon" placeholder until we decide to
 * set up the web flow (Services ID + rotating secret).
 *
 * The plugin is reached through registerPlugin() instead of importing
 * the npm package, so its web fallback (which loads Apple's JS SDK)
 * never lands in the site bundle.
 */
type AppleSignInResponse = {
  response: {
    user: string | null;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
    identityToken: string;
    authorizationCode: string;
  };
};
type AppleSignInPlugin = {
  authorize(options: {
    clientId: string;
    redirectURI: string;
    scopes?: string;
    state?: string;
    nonce?: string;
  }): Promise<AppleSignInResponse>;
};

/** Random URL-safe nonce: the raw value goes to Supabase, its SHA-256 to Apple. */
function makeNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function AuthPage() {
  const navigate = useNavigate();
  const t = useT();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  // Beka 2026-09-19: added facebook + azure (Microsoft). "azure" is
  // Supabase's provider id for Microsoft accounts — NOT "microsoft".
  const [oauthLoading, setOauthLoading] = useState<
    null | OAuthProvider | "guest"
  >(null);
  // True only inside the native iOS app — gates the real Apple button.
  const [isIOSApp, setIsIOSApp] = useState(false);
  useEffect(() => {
    let alive = true;
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (alive) setIsIOSApp(Capacitor.getPlatform() === "ios");
      })
      .catch(() => {
        /* not in a Capacitor shell */
      });
    return () => {
      alive = false;
    };
  }, []);

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

  /* ─── OAuth (Google · Apple · Facebook · Microsoft) ─── */
  const signInWithProvider = async (provider: OAuthProvider) => {
    setOauthLoading(provider);
    try {
      const { Capacitor } = await import("@capacitor/core");
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // Browser-based Google OAuth (Chrome Custom Tab) — Beka
        // 2026-06-21 switch from native @codetrix-studio plugin.
        //
        // Why we moved off the native plugin: Beka's Android device
        // hit a reproducible Capacitor 7 lifecycle bug where the
        // pending GoogleAuth.signIn() plugin call could not be saved
        // across the activity stop that the picker triggers
        // ("Couldn't save last GoogleAuth's Plugin signIn call" in
        // logcat). The JS promise hung forever, no idToken returned.
        // We tried a saveCall-aware retry on appStateChange — the
        // second call also failed (no cached result surfaced).
        //
        // Browser-based OAuth sidesteps the bridge call entirely:
        // open Google's auth page in a Chrome Custom Tab, let the
        // user sign in normally, and rely on Supabase to redirect
        // back to `com.lokali.app://auth/callback?code=...`. The
        // intent filter in AndroidManifest catches the scheme,
        // useCapacitorBridge's appUrlOpen listener pulls the code,
        // and supabase.auth.exchangeCodeForSession finishes the job.
        // Beka 2026-09-19: Google and Apple previously had two
        // byte-identical branches here. Facebook and Microsoft need
        // exactly the same flow, so rather than paste it twice more
        // the branch is now shared by ALL providers. Nothing about
        // the Google or Apple behaviour changed.
        //
        // The flow works for every provider because the redirect
        // target is our own deep link, not anything provider-specific:
        // Supabase sends the browser back to
        // `com.lokali.app://auth/callback?code=...`, the intent filter
        // in AndroidManifest catches the scheme, useCapacitorBridge's
        // appUrlOpen listener pulls the code, and
        // supabase.auth.exchangeCodeForSession finishes the job.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: "com.lokali.app://auth/callback",
            // skipBrowserRedirect prevents Supabase from trying to
            // window.location-navigate the wrapped WebView. Google
            // rejects embedded WebViews outright, and Facebook does
            // the same — both require a real browser (Chrome Custom
            // Tab), which is what @capacitor/browser opens below.
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (!data?.url) {
          throw new Error(`${provider} OAuth URL missing from Supabase response`);
        }
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url, presentationStyle: "popover" });
        // The onAuthStateChange listener in this component handles the
        // navigation (onboarding vs home) — nothing else to do here.
      } else {
        // Web flow: regular OAuth redirect, same tab, lands back on
        // /auth where the auth-state-change subscription routes the
        // user onward.
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        // signInWithOAuth navigates the current tab; nothing else to do.
      }
    } catch (err) {
      setOauthLoading(null);
      const msg = err instanceof Error ? err.message : t("auth.somethingWrong");
      toast.error(t("auth.signInFailed"), { description: msg });
    }
  };

  /* ─── Sign in with Apple (native, iOS app) ─── */
  const signInWithAppleNative = async () => {
    setOauthLoading("apple");
    try {
      const rawNonce = makeNonce();
      const hashedNonce = await sha256Hex(rawNonce);
      const { registerPlugin } = await import("@capacitor/core");
      const AppleSignIn = registerPlugin<AppleSignInPlugin>("SignInWithApple");
      const res = await AppleSignIn.authorize({
        // Both fields are only read by the web fallback; iOS ignores them.
        clientId: "app.lokali.travel",
        redirectURI: "https://lokali.travel/auth",
        scopes: "email name",
        nonce: hashedNonce,
      });
      const token = res?.response?.identityToken;
      if (!token) throw new Error("Apple returned no identity token");

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token,
        nonce: rawNonce,
      });
      if (error) throw error;

      // Apple sends the name ONLY on the very first authorization —
      // keep it, same metadata key the email sign-up uses.
      const fullName = [res.response.givenName, res.response.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (fullName) {
        await supabase.auth.updateUser({ data: { display_name: fullName } }).catch(() => {});
      }
      // onAuthStateChange above routes to onboarding / home.
    } catch (err) {
      setOauthLoading(null);
      const msg = err instanceof Error ? err.message : String(err);
      // User closed Apple's sheet (AuthorizationError 1001) — not an error.
      if (/1001|cancel/i.test(msg)) return;
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
    // Wrapped in MobileFrame so the sign-in page gets the same
    // bottom TabBar + bar-clearance handling as every other page.
    // Beka caught the standalone layout (its own min-h-[100dvh] +
    // manual pb-10/pb-safe) still clipping the "ჯერ არ გაქვს
    // ანგარიში?" link behind Samsung's 3-button bar — MobileFrame
    // reserves the canonical 56 px + safe-area-inset for the bar,
    // so the content area always sits comfortably above it.
    // hideAiFooter — the "AI Generated Content" fineprint only
    // makes sense on pages that show LLM-generated content. The
    // sign-in form is pure UI chrome, so we suppress it.
    <MobileFrame hideAiFooter>
      <div className="mx-auto flex w-full max-w-md flex-col px-6 pt-safe pb-6">
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

        {/* OAuth buttons — hidden on reset mode. Google works
            everywhere. Apple is native and live inside the iOS app
            (signInWithAppleNative); on Android + web it is still the
            placeholder toast until the web flow is set up. */}
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
              {/* Facebook + Microsoft — HIDDEN, Beka 2026-09-22.
                  Flip SHOW_FB_MS back to true to restore them; see the
                  constant above for what has to be fixed first. */}
              {SHOW_FB_MS && (
                <>
                  <button
                    type="button"
                    onClick={() => signInWithProvider("facebook")}
                    disabled={!!oauthLoading}
                    className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-smooth hover:bg-secondary disabled:opacity-60"
                  >
                    {oauthLoading === "facebook" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FacebookIcon className="h-4 w-4" />
                    )}
                    {t("auth.continueWithFacebook")}
                  </button>
                  <button
                    type="button"
                    onClick={() => signInWithProvider("azure")}
                    disabled={!!oauthLoading}
                    className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-smooth hover:bg-secondary disabled:opacity-60"
                  >
                    {oauthLoading === "azure" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MicrosoftIcon className="h-4 w-4" />
                    )}
                    {t("auth.continueWithMicrosoft")}
                  </button>
                </>
              )}
              {isIOSApp ? (
                // Same size, place and weight as Google — App Review
                // checks that Apple is offered as an EQUAL option.
                <button
                  type="button"
                  onClick={signInWithAppleNative}
                  disabled={!!oauthLoading}
                  className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-smooth hover:bg-secondary disabled:opacity-60"
                >
                  {oauthLoading === "apple" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AppleIcon className="h-4 w-4" />
                  )}
                  {t("auth.continueWithApple")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toast.info(t("auth.appleComingSoon"))}
                  disabled={!!oauthLoading}
                  className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground/60 transition-smooth hover:bg-secondary disabled:opacity-60"
                >
                  <AppleIcon className="h-4 w-4" />
                  {t("auth.continueWithApple")}
                </button>
              )}
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
    </MobileFrame>
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

/**
 * Facebook "f" mark. Brand blue #1877F2 is hard-coded rather than
 * `currentColor`: Meta's brand guidelines require the logo in its own
 * blue (or solid white/black), and a muted-foreground "f" would also
 * read as a disabled button next to the full-colour Google mark.
 */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"
      />
    </svg>
  );
}

/**
 * Microsoft's four-square logo. Microsoft's brand rules are explicit
 * that the squares keep their four colours and are never recoloured
 * or reduced to a single tone, so these are hard-coded too.
 */
function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}
