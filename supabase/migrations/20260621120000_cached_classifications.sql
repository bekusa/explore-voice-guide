-- cached_classifications — Stage-0 routing decision cache for the
-- search bar. Background: when a user types in the home-screen search
-- input we want to know whether the query names a CITY/REGION/COUNTRY
-- (route to /results with the attractions list) or a SPECIFIC
-- ATTRACTION (route straight to /attraction/<slug> for that landmark).
-- We answer that with one Claude Haiku call. This table caches the
-- result keyed by the normalized query so subsequent users (anywhere
-- in the world) get an instant routing decision — no second Haiku
-- call, no latency. Same pattern as cached_attractions / cached_guides
-- / cached_photos.
--
-- Schema notes:
--   - query_normalized: lowercased trimmed query string. Same
--     normalizeName() helper that other caches use, so the key shape
--     stays consistent across the codebase.
--   - kind: "attraction" (specific landmark), "place" (city / country /
--     region), or "other" (gibberish / unparseable — still cache it so
--     we don't re-pay Haiku for the same bad input).
--   - name: canonical resolved name. For "sagrada familia" it might
--     be "Sagrada Família". Stored so the attraction page hint can
--     render the right capitalization without an extra round-trip.
--   - city: city context for attractions. Lets the /attraction page's
--     photo lookup disambiguate (Grand Palace → Bangkok, not Tbilisi).
--   - slug: pre-computed kebab-case slug for the attraction URL.
--     Identical to attractionSlug(name) on the client.
--   - country: optional country context for "place" rows so the
--     /results page can show a friendlier breadcrumb.

CREATE TABLE IF NOT EXISTS public.cached_classifications (
  query_normalized TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('attraction', 'place', 'other')),
  name TEXT,
  city TEXT,
  country TEXT,
  slug TEXT,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on. Service-role server code reads/writes via supabaseAdmin;
-- the anon client never touches this table directly. Without RLS-on
-- a Lovable-managed project will flag it in security review.
ALTER TABLE public.cached_classifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cached_classifications IS
  'Search-query routing cache. Haiku classifier writes once, all users read.';
