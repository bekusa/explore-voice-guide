/**
 * /delete-account — public web page for account deletion.
 *
 * Required by Google Play Store policy (since 2024): every app with
 * account creation must provide a publicly-accessible web URL where a
 * user — including someone who has already uninstalled the app — can
 * request that their account and all associated data be deleted.
 *
 * Why a separate page when /settings already has a Delete Account
 * button: Play Console's Data Safety form asks for a URL that anyone
 * can reach (no app install required). The Settings page is buried
 * inside the app navigation; a dedicated /delete-account route at
 * lokali.travel/delete-account is what reviewers and users can paste
 * directly into a browser.
 *
 * Behaviour:
 *   - Signed-out visitors see a brief explanation + Sign-in prompt.
 *     The actual delete button only appears after sign-in (server
 *     verifies the bearer token anyway, but exposing the button to
 *     anonymous traffic invites confusion).
 *   - Signed-in users see their email + a "Delete my account" button.
 *   - Confirmation modal lists the irreversible consequences.
 *   - On success: server returns ok → client wipes local data, signs
 *     out, lands back on this page with a success message so the user
 *     has visible confirmation the action completed.
 *
 * Server: same `/api/account/delete` POST endpoint Settings uses.
 * Same Bearer-token contract, same cascade (saved_tours → profiles →
 * auth.users). One source of truth for the deletion flow.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2, ShieldX, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, clearAllLocalUserData } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete your account · Lokali" },
      {
        name: "description",
        content:
          "Permanently delete your Lokali account and all associated data. This action cannot be undone.",
      },
      { property: "og:title", content: "Delete your account · Lokali" },
      {
        property: "og:description",
        content: "Permanently delete your Lokali account and all associated data.",
      },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const t = useT();
  const { user, loading: authLoading } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error(t("set.deleteFailedTitle"), {
          description: t("set.deleteFailedSession"),
        });
        return;
      }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[delete-account] server returned", res.status, errText);
        toast.error(t("set.deleteFailedTitle"), {
          description: t("set.deleteFailedDesc"),
        });
        return;
      }
      try {
        await clearAllLocalUserData();
      } catch (err) {
        console.warn("[delete-account] local wipe failed", err);
      }
      try {
        await supabase.auth.signOut();
      } catch {
        /* session already invalid post-delete */
      }
      setConfirmOpen(false);
      setDeleted(true);
    } catch (err) {
      console.warn("[delete-account] threw", err);
      toast.error(t("set.deleteFailedTitle"), {
        description: t("set.deleteFailedDesc"),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-col px-6 pt-12 pb-12">
        {/* Back link — works whether user came from inside the app
            (will route back to /) or from a public browser landing. */}
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-smooth"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Lokali
        </Link>

        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
            <ShieldX className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-[28px] font-medium leading-tight">
            Delete your Lokali account
          </h1>
          <p className="mt-3 max-w-md text-[14px] leading-[1.55] text-muted-foreground">
            This page lets you permanently delete your Lokali account and every
            piece of data tied to it. The action is irreversible — Google Play
            Store policy requires us to offer it.
          </p>
        </div>

        {/* What gets deleted */}
        <section className="mt-10 rounded-2xl border border-border bg-card p-5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            What gets deleted
          </div>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-[1.55]">
            <li className="flex items-start gap-2.5">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                ·
              </span>
              <span>
                Your account login (email, OAuth identity, anonymous session)
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                ·
              </span>
              <span>Profile (display name, preferred language, narrator voice)</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                ·
              </span>
              <span>Every tour you have saved, on every device</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                ·
              </span>
              <span>Offline-cached audio + scripts on the current device</span>
            </li>
          </ul>
          <p className="mt-4 text-[11.5px] leading-snug text-muted-foreground">
            Anonymized aggregate cache rows (cached attractions / cached guides)
            stay — they contain no personal identifier and serve other travellers.
          </p>
        </section>

        {/* Action area — branches on auth state and deletion outcome */}
        <section className="mt-6">
          {deleted ? (
            // Post-delete confirmation. The session is gone; the user is
            // free to close the tab or sign up fresh.
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
                ✓
              </div>
              <h2 className="mt-3 text-[16px] font-semibold">
                Account deleted
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                Your account and all associated data have been removed. You can
                close this page.
              </p>
              <Link
                to="/"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-background transition-smooth hover:scale-[1.02]"
              >
                Return to Lokali
              </Link>
            </div>
          ) : authLoading ? (
            <div className="grid h-24 place-items-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !user ? (
            // Signed-out: prompt to authenticate before showing the
            // destructive button. The server validates the token anyway,
            // but exposing the button without auth invites confusion +
            // accidental taps.
            <div className="rounded-2xl border border-border bg-card p-5 text-center">
              <h2 className="text-[15px] font-semibold">Sign in to continue</h2>
              <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
                To delete an account, you first need to sign in to it. We verify
                your identity before removing any data.
              </p>
              <Link
                to="/auth"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-background transition-smooth hover:scale-[1.02]"
              >
                Sign in
              </Link>
            </div>
          ) : (
            // Signed-in: show identity + the destructive action.
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Signed in as
              </div>
              <div className="mt-1 truncate text-[14px] font-semibold">
                {user.email ?? "Anonymous session"}
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-3.5 text-[13px] font-semibold text-destructive transition-smooth hover:border-destructive/70 hover:bg-destructive/10"
              >
                <UserX className="h-4 w-4" />
                Delete my account
              </button>
              <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground/80">
                This cannot be undone.
              </p>
            </div>
          )}
        </section>

        <p className="mt-10 text-center text-[11px] leading-snug text-muted-foreground">
          Questions or trouble?{" "}
          <a
            href="mailto:lokaliapps@gmail.com"
            className="underline underline-offset-4 hover:text-foreground"
          >
            lokaliapps@gmail.com
          </a>
        </p>
      </div>

      {/* Confirmation modal — same warning text settings.tsx uses. */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={() => {
            if (!deleting) setConfirmOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card p-6 shadow-glow"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2
                id="delete-confirm-title"
                className="font-display text-[19px] font-medium text-destructive"
              >
                {t("set.deleteConfirmTitle")}
              </h2>
            </div>
            <p className="mt-4 text-[13px] leading-[1.5] text-foreground">
              {t("set.deleteConfirmBody")}
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-muted-foreground">
              <li>• {t("set.deleteConfirmBullet1")}</li>
              <li>• {t("set.deleteConfirmBullet2")}</li>
              <li>• {t("set.deleteConfirmBullet3")}</li>
            </ul>
            <div className="mt-6 flex gap-2.5">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2.5 text-[12px] font-semibold text-foreground transition-smooth hover:bg-secondary/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-destructive-foreground transition-smooth hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  t("set.deleteAccount")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
