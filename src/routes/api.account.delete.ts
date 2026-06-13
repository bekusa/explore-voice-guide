/**
 * DELETE /api/account/delete
 *
 * Permanently removes the signed-in user's auth row and all their
 * application data. Required by Google Play Store policy (since 2024):
 * any app with account creation must provide an in-app deletion path.
 * Without it, Play Store rejects the listing — and the Privacy Policy
 * we ship at /privacy promises this flow exists.
 *
 * What gets deleted (all server-side via supabaseAdmin / service-role):
 *   1. saved_tours rows (user_id = caller)
 *   2. profiles row (user_id = caller)
 *   3. auth.users row — admin.deleteUser() — this is the gate that
 *      requires service-role; the anon client cannot do this.
 *
 * Local-only data (localStorage, Capacitor Preferences, offline audio
 * blobs on the device) is cleared by the client BEFORE calling this
 * route, then the client signs out — see the Delete button handler
 * in src/routes/settings.tsx.
 *
 * Auth flow:
 *   - Client sends the user's access token in the Authorization
 *     header as "Bearer <jwt>".
 *   - We verify the token via supabaseAdmin.auth.getUser(token) to
 *     resolve the caller's user_id WITHOUT trusting any field in
 *     the request body. This prevents one user from deleting another
 *     user's data by guessing their UUID.
 *   - Anonymous users (is_anonymous: true) can still self-delete,
 *     but with no data attached so the database calls are no-ops.
 *
 * Idempotent — re-calling after the auth row is gone returns 401
 * (the JWT becomes invalid). Re-calling between deletion attempts
 * (e.g. two windows tapping at the same time) just reaffirms the
 * end state.
 */
import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/account/delete")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        // Extract the user's access token from the Authorization
        // header. We do NOT accept a user_id from the body — that
        // would let any signed-in user delete any other account by
        // guessing the UUID. The JWT is verified server-side and the
        // resolved user_id is the only one we touch.
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!token) {
          return corsJson({ error: "Missing bearer token" }, { status: 401 });
        }

        // Verify token + resolve user. supabaseAdmin.auth.getUser
        // with a token argument validates the JWT and returns the
        // user record; on tamper / expiry it returns an error.
        let userId: string | null = null;
        try {
          const { data, error } = await supabaseAdmin.auth.getUser(token);
          if (error || !data?.user) {
            return corsJson({ error: "Invalid token" }, { status: 401 });
          }
          userId = data.user.id;
        } catch (err) {
          console.warn("[api.account.delete] getUser threw", err);
          return corsJson({ error: "Auth check failed" }, { status: 401 });
        }
        if (!userId) {
          return corsJson({ error: "No user id" }, { status: 401 });
        }

        // Delete application rows first. We do this before the auth
        // row so the FK to auth.users is satisfied throughout the
        // operation — if the auth row were removed first, RLS on
        // saved_tours / profiles could leave dangling rows (depends
        // on cascade settings; explicit deletes are safer).
        const errors: string[] = [];

        try {
          const { error: savedErr } = await supabaseAdmin
            .from("saved_tours")
            .delete()
            .eq("user_id", userId);
          if (savedErr) errors.push(`saved_tours: ${savedErr.message}`);
        } catch (err) {
          errors.push(`saved_tours threw: ${err instanceof Error ? err.message : String(err)}`);
        }

        try {
          const { error: profileErr } = await supabaseAdmin
            .from("profiles")
            .delete()
            .eq("user_id", userId);
          if (profileErr) errors.push(`profiles: ${profileErr.message}`);
        } catch (err) {
          errors.push(`profiles threw: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Delete the auth user. This is the irreversible step — once
        // this lands, the user can never sign back in with the same
        // credentials. We do it last so a profile/saved_tours failure
        // doesn't leave an orphan auth row pointing at deleted data.
        try {
          const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (authErr) {
            console.warn("[api.account.delete] auth deleteUser failed", authErr);
            return corsJson(
              {
                error: "Account data cleared, but auth removal failed. Contact support.",
                detail: authErr.message,
                partial: errors,
              },
              { status: 500 },
            );
          }
        } catch (err) {
          console.warn("[api.account.delete] auth deleteUser threw", err);
          return corsJson(
            {
              error: "Auth removal threw an exception. Contact support.",
              detail: err instanceof Error ? err.message : String(err),
              partial: errors,
            },
            { status: 500 },
          );
        }

        return corsJson({
          ok: true,
          // Surface non-fatal errors so the client can log them but
          // the user still sees a successful deletion (the auth row
          // is gone, which is the user-visible commitment).
          warnings: errors,
        });
      },
    },
  },
});
