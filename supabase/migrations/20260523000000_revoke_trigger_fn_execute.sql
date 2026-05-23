-- Supabase linter (0028 / 0029) was warning that public.handle_new_user
-- and public.update_updated_at_column were callable by anon +
-- authenticated roles via PostgREST. Both are TRIGGER functions —
-- only the Postgres trigger system should invoke them (handle_new_user
-- fires AFTER INSERT on auth.users to seed a profiles row;
-- update_updated_at_column fires BEFORE UPDATE on profiles +
-- saved_tours to refresh updated_at). They have no business being
-- callable from the REST API.
--
-- Triggers continue to work because Postgres invokes them via its
-- internal trigger mechanism (running as postgres, not via any user
-- role). REVOKE only removes the externally-exposed EXECUTE permission.
--
-- handle_new_user is SECURITY DEFINER intentionally so it can write
-- into profiles on behalf of a not-yet-fully-existent user — that
-- design stays, we just close the API surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
