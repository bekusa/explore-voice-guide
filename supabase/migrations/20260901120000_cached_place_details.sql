-- cached_place_details — practical visit info (opening hours, website,
-- phone, address) for an attraction.
--
-- WHY A SEPARATE TABLE (Beka, 2026-09-01):
--   "შეიძლება ცხრილში ცალკე ჩავწეროთ რომ არსებული ინფო არ დაზიანდეს
--    და თავიდან არ მქონდეს გამოსაძახებელი"
--
--   The obvious implementation — widening cached_guides / adding the
--   fields to the Claude prompt — would have been wrong twice over:
--
--     1. It would invalidate every existing cached guide. There are
--        thousands of them, each one a paid Claude call plus a paid
--        translation, and a schema/prompt change means regenerating
--        the lot. This table is additive: not one existing row is
--        read, written, or invalidated by this feature.
--
--     2. Claude does not KNOW opening hours. It would hallucinate
--        plausible ones. Hours, phone numbers and websites are facts
--        with an authoritative live source (Google Places), so they
--        come from there, never from the language model.
--
-- FRESHNESS: hours change (seasons, renovations, holidays). Rows carry
-- `updated_at` and the server treats anything older than
-- PLACE_DETAILS_TTL_DAYS (30, see api.place-details.ts) as a miss and
-- refetches. Nothing here is a source of truth — it is a cache in
-- front of Google, and a total loss of this table costs only API
-- calls, never content.
--
-- LANGUAGE: deliberately language-NEUTRAL, so one row serves all 45
-- languages and we never multiply rows per locale.
--   - `opening_periods` holds Google's structured
--     [{open:{day,time}, close:{day,time}}] array — day is 0-6, time
--     is "HHMM". The client renders weekday names and times through
--     the app's own i18n + Intl, so Georgian users see Georgian days
--     without a second Google call.
--   - `weekday_text` keeps Google's ENGLISH pre-formatted lines purely
--     as a fallback for the rare place whose hours don't fit the
--     periods model (e.g. "Open 24 hours", irregular seasonal notes).

CREATE TABLE IF NOT EXISTS public.cached_place_details (
  -- normalizeName(name) || '|' || cityKey(city) — same key shape the
  -- other caches use, so a place resolves identically here and in
  -- cached_guides without the two tables sharing any data.
  cache_key TEXT PRIMARY KEY,

  -- Human-readable copies of what went into the key. Purely so Beka
  -- can eyeball the table in the Supabase UI and spot bad matches.
  name TEXT,
  city TEXT,

  -- Google's stable identifier for the matched place. Kept so a future
  -- refresh can skip the Text Search step and go straight to Details.
  place_id TEXT,

  -- The practical payload.
  formatted_address TEXT,
  phone TEXT,                 -- international_phone_number (+995 …)
  website TEXT,
  google_maps_url TEXT,
  opening_periods JSONB,      -- language-neutral, see note above
  weekday_text JSONB,         -- English fallback lines
  business_status TEXT,       -- OPERATIONAL / CLOSED_TEMPORARILY / …
  utc_offset_minutes INTEGER, -- lets the client say "Open now" correctly

  -- Coordinates of the MATCHED place. Not used for the map (see
  -- project_coordinate_bug — the attraction table's own lat/lng is a
  -- separate problem), but recorded so a mismatch is diagnosable:
  -- if these sit 400 km from the attraction's own coordinates, the
  -- Text Search matched the wrong place.
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- TRUE when Google returned no match at all. Cached deliberately:
  -- without it, every visitor to a place Google doesn't list would
  -- re-pay a Text Search call forever. Expires on the same TTL as a
  -- hit, so newly-listed places get picked up within 30 days.
  not_found BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lets Beka scan for stale rows / re-warm in bulk.
CREATE INDEX IF NOT EXISTS cached_place_details_updated_at_idx
  ON public.cached_place_details (updated_at);

-- RLS on, no policies: only service-role server code touches this
-- table. Matches cached_classifications / cached_photos, and keeps the
-- Lovable security review clean.
ALTER TABLE public.cached_place_details ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cached_place_details IS
  'Google Places practical info (hours/website/phone) per attraction. Additive cache — never read or written by the guide/attraction generation path.';
