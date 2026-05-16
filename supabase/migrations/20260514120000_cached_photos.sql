-- cached_photos — persistent cache for the /api/photo lookups.
--
-- Without this table every cold worker re-paid the Google Places
-- $0.024 lookup for places we'd already photo'd thousands of times.
-- One row per (scope, city, museum, name) tuple; cache_key is the
-- pipe-joined normalized string the application code computes.
--
-- Schema is dead-simple: only the resolved URL is stored. We DON'T
-- persist negative-lookup misses so a server-side fix (new image
-- source, prompt change) isn't blocked by stale "no image" rows.

CREATE TABLE IF NOT EXISTS public.cached_photos (
  cache_key TEXT PRIMARY KEY,
  url       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep table sane — no empty / placeholder URLs.
ALTER TABLE public.cached_photos
  ADD CONSTRAINT cached_photos_url_nonempty CHECK (char_length(url) > 0);

-- service_role bypasses RLS but enable it explicitly so anonymous
-- clients (which we don't expect to query this table directly)
-- can't read or write it.
ALTER TABLE public.cached_photos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cached_photos IS
  'Per-(name,scope,city,museum) resolved photo URLs. Written by the
   /api/photo Cloudflare Worker after a successful Wikipedia / Google
   Places / Met Museum lookup. Read on every photo request before the
   external API call to skip the $0.024 round-trip.';
