/**
 * Profile route — landing page reached from the bottom tab bar's
 * "Profile" tab (formerly "Sign out"). Beka asked to demote the
 * sign-out / delete actions out of the persistent nav and make
 * settings the secondary destination from this hub.
 *
 * Layout (intentionally minimal for v1.0):
 *   - Hero: signed-in email (or "Guest" with a Sign in CTA when no
 *     user). Avatar/initials could come later — we don't store an
 *     avatar URL yet, so the initial letters are enough.
 *   - Single account row: "Settings" link → /settings. The settings
 *     page itself is where Sign out + Delete Account now live (still,
 *     just styled fainter — see settings.tsx for the muted treatment).
 *
 * Why not put Sign out here too? Beka's spec was: keep the
 * destructive actions behind one more tap so a casual swipe through
 * the tabs can't accidentally trigger them. The tab → Profile →
 * Settings → Sign out chain makes the path deliberate.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Settings as SettingsIcon, UserCircle2 } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Lokali" },
      {
        name: "description",
        content: "Manage your Lokali account, language, and preferences.",
      },
      { property: "og:title", content: "Profile — Lokali" },
      {
        property: "og:description",
        content: "Manage your Lokali account, language, and preferences.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const t = useT();
  const { user } = useAuth();

  // Pick a short display label: email local-part if we have an email,
  // otherwise the localised "Guest". Falling back to email-with-domain
  // would line-wrap on a narrow card; the local-part alone keeps the
  // hero compact and is what users recognise themselves by anyway.
  const email = user?.email ?? null;
  const display = email ? email.split("@")[0] : t("profile.guest");
  const initial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-24 text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 backdrop-blur-xl">
          <div className="flex items-center justify-between px-5 pt-safe pb-4">
            <div className="flex items-center gap-3">
              <UserCircle2 className="h-5 w-5 text-primary" />
              <h1 className="font-display text-[20px] tracking-tight">
                {t("profile.title")}
              </h1>
            </div>
          </div>
        </header>

        <main className="px-5 pt-6">
          {/* Identity card */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-[18px] font-bold text-primary-foreground shadow-glow">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {email ? t("profile.signedInAs") : t("profile.account")}
                </div>
                <div className="mt-0.5 truncate text-[15px] font-semibold">
                  {display}
                </div>
                {email && email.includes("@") && (
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    {email}
                  </div>
                )}
              </div>
            </div>

            {!user && (
              // Anonymous visitor lands here too — guide them to Sign in
              // so the Profile tab isn't a dead-end for signed-out users.
              <Link
                to="/auth"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold px-4 py-3 text-[12px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01]"
              >
                {t("nav.signIn")}
              </Link>
            )}
          </section>

          {/* Account links — currently just Settings, but the section
              is structured so future entries (linked devices, billing,
              language preferences, etc.) can slot in cleanly. */}
          <section className="mt-6">
            <div className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("profile.account")}
            </div>
            <Link
              to="/settings"
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 transition-smooth hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13.5px] font-semibold">
                  {t("profile.openSettings")}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </section>
        </main>
      </div>
    </MobileFrame>
  );
}
