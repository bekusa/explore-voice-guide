-- guide_ratings — the user's own 1-5 star rating of a generated guide.
-- Beka 2026-09-19.
--
-- WHY THIS EXISTS
--   cached_guides holds 13,704 AI-generated guides and we have zero
--   feedback on any of them. Every quality problem so far (Batumi's
--   wrong photos, Metekhi filed under Batumi, six "Raft of the Medusa"
--   entries at the Louvre) was found by Beka noticing it by hand.
--   That does not scale past one person.
--
--   Stars turn guide quality into something measurable: the worst
--   guides surface themselves, and a prompt change can be judged by
--   whether the average moves.
--
--   It is also the honest input for the Play Store review prompt —
--   we ask for a store review only from people who just told us the
--   guide was good.
--
-- WHAT IS RATED
--   The GUIDE, not the place. "Was this write-up good?" — not "is the
--   Louvre good?". Hence the key is the guide's cache identity
--   (name + city + language), so a bad Georgian guide for a place
--   whose English guide is fine shows up as exactly that.
--
-- ANONYMOUS USERS COUNT
--   The app signs guests in anonymously (see is_anonymous handling in
--   auth.tsx), so auth.uid() is always present and RLS can key on it.
--   Requiring a real account would throw away most of the feedback,
--   since the majority of travellers never sign up.

CREATE TABLE IF NOT EXISTS public.guide_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Guide identity. Mirrors the cached_guides key shape (normalised
  -- name + city + language) so a rating can be joined back to the
  -- exact cached row that produced it.
  guide_key TEXT NOT NULL,

  -- Denormalised, display-only. Kept so Beka can read this table in
  -- the Supabase UI without joining anything: "which guide is 2★?"
  -- should be answerable at a glance.
  attraction_name TEXT,
  city TEXT,
  language TEXT,

  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),

  -- Optional one-liner. Capped in the client at 280 chars; the DB
  -- cap is the real guard against a paste-bomb.
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One rating per user per guide. Changing your mind UPDATEs the
  -- existing row rather than stacking a second vote — without this a
  -- single user could skew a guide's average on their own.
  UNIQUE (user_id, guide_key)
);

-- "Show me the worst guides" — the query this table exists for.
CREATE INDEX IF NOT EXISTS guide_ratings_guide_key_idx
  ON public.guide_ratings (guide_key);
CREATE INDEX IF NOT EXISTS guide_ratings_stars_idx
  ON public.guide_ratings (stars);

ALTER TABLE public.guide_ratings ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs. A user may read and change their own
-- rating and nothing else.
--
-- Deliberately NO public read policy: raw ratings carry user_id, and
-- exposing "who rated what" is a privacy leak for zero product gain.
-- When we want to display "4.6 ★ (120 ratings)" publicly, add a
-- SECURITY DEFINER function that returns ONLY the aggregate — never
-- open SELECT on this table.
CREATE POLICY "own ratings: select"
  ON public.guide_ratings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "own ratings: insert"
  ON public.guide_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own ratings: update"
  ON public.guide_ratings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own ratings: delete"
  ON public.guide_ratings FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.guide_ratings IS
  'User 1-5 star ratings of generated guides. Quality signal for cached_guides + input to the Play Store review prompt.';
