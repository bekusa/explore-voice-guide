-- cached_photos.not_found — negative caching for photo lookups.
--
-- ⚠️ THIS IS A BILLING FIX. Beka received a ~$1,500 Google Cloud bill
-- (August 2026). The mechanism:
--
--   /api/photo cached only SUCCESSFUL lookups. Every attraction with
--   no findable photo therefore re-ran the entire lookup chain — Met
--   Museum, Wikipedia, and finally Google Places Text Search — on
--   EVERY page view, by EVERY visitor, indefinitely.
--
--   Google bills Places Text Search per ATTEMPT (~$32 / 1,000), not
--   per match, and googlePhoto() tries up to two query variants. So a
--   single popular place that has no photo could cost ~$6/day on its
--   own, and no traffic pattern would ever amortise it, because the
--   "there is nothing here" answer was never written down.
--
-- With this column, a miss is recorded once and honoured for 14 days
-- (PHOTO_MISS_TTL_MS in src/lib/sharedCache.server.ts). Cost per
-- photo-less place drops from "once per view, forever" to "once per
-- fortnight".
--
-- WHY MISSES WERE NOT CACHED BEFORE, and why that reasoning still
-- holds: an earlier bug had `{url: null}` pinned in the BROWSER's disk
-- cache for 24 h, so a server-side lookup fix took a day to reach
-- users. That was an HTTP caching problem, and the fix conflated it
-- with the database cache. The two layers are now separated:
--
--   server (this column) → remembers the miss, stops paying upstream
--   client (`no-store`)  → does NOT remember it, so fixes land instantly
--
-- After improving a lookup, force an immediate global re-check with:
--
--   DELETE FROM public.cached_photos WHERE not_found = TRUE;
--
-- Existing rows all hold real URLs, so the FALSE default is correct
-- for every one of them and no backfill is needed.

ALTER TABLE public.cached_photos
  ADD COLUMN IF NOT EXISTS not_found BOOLEAN NOT NULL DEFAULT FALSE;

-- `url` must accept NULL for negative rows. It is nullable already on
-- the current schema; this is a no-op guard so the migration is safe
-- to run against a project where it was tightened.
ALTER TABLE public.cached_photos
  ALTER COLUMN url DROP NOT NULL;

-- Lets the cleanup DELETE above, and any "how many places have no
-- photo?" audit, run without a full scan of 34k+ rows.
CREATE INDEX IF NOT EXISTS cached_photos_not_found_idx
  ON public.cached_photos (not_found)
  WHERE not_found = TRUE;

COMMENT ON COLUMN public.cached_photos.not_found IS
  'TRUE = lookup found no photo. Suppresses re-calling Wikipedia/Google for 14 days. Billing safeguard.';
