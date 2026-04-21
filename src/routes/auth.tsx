import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Lock, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Whispers of Old Tbilisi" },
      { name: "description", content: "Sign in or create an account to save audio tours." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already signed in. Send to onboarding if profile is unset.
  useEffect(() => {
    const route = async (userId: string) => {
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
      if (data.session) route(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) route(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
        toast.success("Account created", { description: "Welcome aboard." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(mode === "signup" ? "Sign up failed" : "Sign in failed", {
        description: msg.includes("already registered")
          ? "This email is already registered. Try signing in."
          : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-12 pb-10">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-smooth"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <div className="mb-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            {mode === "signin" ? "Welcome back" : "Begin your journey"}
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            {mode === "signin" ? (
              <>
                Sign in to <span className="italic text-primary">continue</span>
              </>
            ) : (
              <>
                Create your <span className="italic text-primary">account</span>
              </>
            )}
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Save tours, sync chapters across devices, and pick up where you left off.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground w-16 shrink-0">
                Name
              </span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
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
              placeholder="you@example.com"
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
              placeholder="Password"
              className="border-0 bg-transparent shadow-none p-0 h-auto text-[14px] focus-visible:ring-0"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-gold px-5 text-[14px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 text-center text-[12px] text-muted-foreground hover:text-foreground transition-smooth"
        >
          {mode === "signin" ? (
            <>
              No account yet? <span className="font-semibold text-primary">Sign up</span>
            </>
          ) : (
            <>
              Already have an account? <span className="font-semibold text-primary">Sign in</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
