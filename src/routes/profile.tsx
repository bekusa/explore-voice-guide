/**
 * /profile is kept alive only as a back-compat redirect to /settings.
 *
 * History: 2026-06-18 first version of this route rendered its own
 * profile page that linked OUT to /settings. Beka then asked to drop
 * the second tap and surface the settings content directly inside
 * profile. Rather than copy ~700 lines from settings.tsx (and risk
 * the two files drifting), we made /settings itself the profile page
 * — it now starts with an identity card and continues with the full
 * preference list. Anyone who still navigates to /profile (existing
 * bookmarks, deep-linked notifications, etc.) gets bounced cleanly.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => {
    throw redirect({ to: "/settings" });
  },
  component: () => null,
});
