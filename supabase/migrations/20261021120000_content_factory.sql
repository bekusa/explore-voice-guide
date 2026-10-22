-- Content factory — offline generation of cached_guides / cached_attractions
-- with the app's own prompts, run on Claude subscription credits instead of
-- the paid API. Beka 2026-10-21. Plan: claude/content-factory-plan-2026-10.md
--
-- These tables are bookkeeping ONLY. The app never reads them: the factory
-- publishes into cached_guides / cached_attractions / cached_classifications
-- in exactly the row shape the live routes write, so a published row is
-- indistinguishable from one a user's request produced. Everything that
-- would tell them apart (model, cost, audit findings, edits) lives here.

-- One row per thing to generate: a guide (place) or an attractions list (city).
CREATE TABLE IF NOT EXISTS public.content_jobs (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('guide', 'attractions')),
  target_qid TEXT,
  rank INTEGER,
  -- guide: the place's English Wikipedia title (= cache key name)
  -- attractions: the city's English Wikipedia title (= cache key query)
  name TEXT NOT NULL,
  -- guide only: the host city sent to the prompt and used as the city bucket
  city TEXT NOT NULL DEFAULT '',
  country TEXT,
  -- true → publish ONLY under (name, city); never in the '' bucket
  homonym BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'published', 'review', 'quarantined', 'failed', 'skipped')),
  lane TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  last_error TEXT,
  cost_usd NUMERIC(10, 5) NOT NULL DEFAULT 0,
  published_keys JSONB,
  -- prompt name, every key spelling, city aliases, '' bucket permission, coords
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, name, city)
);
CREATE INDEX IF NOT EXISTS content_jobs_queue_idx ON public.content_jobs (status, kind, rank);

-- One row per stage per attempt: what was generated, what each gate found,
-- what it cost. raw_output keeps the model text so a parse failure can be
-- diagnosed without re-running (and re-paying for) the call.
CREATE TABLE IF NOT EXISTS public.content_audit (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES public.content_jobs (id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('generate', 'gate1', 'gate2', 'gate3', 'repair', 'publish', 'review')),
  verdict TEXT,
  model TEXT,
  cost_usd NUMERIC(10, 5),
  duration_ms INTEGER,
  findings JSONB,
  payload JSONB,
  raw_output TEXT,
  edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_audit_job_idx ON public.content_audit (job_id, attempt);

-- Reference text for grounding and fact-checking, fetched once per place.
CREATE TABLE IF NOT EXISTS public.content_evidence (
  qid TEXT PRIMARY KEY,
  wiki_title TEXT,
  text TEXT,
  wikidata JSONB,
  source TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_evidence ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (the factory) touches these.

-- Atomic claim: several workers (cloud lane + Max lane) can pull from the
-- same queue without ever taking the same job.
CREATE OR REPLACE FUNCTION public.factory_claim_jobs(p_kind TEXT, p_lane TEXT, p_worker TEXT, p_limit INTEGER)
RETURNS SETOF public.content_jobs
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.content_jobs j
     SET status = 'claimed', lane = p_lane, claimed_by = p_worker,
         claimed_at = now(), attempts = j.attempts + 1, updated_at = now()
   WHERE j.id IN (
     SELECT id FROM public.content_jobs
      WHERE status = 'queued' AND kind = p_kind
      ORDER BY rank NULLS LAST, id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
$$;

-- A worker that died mid-batch leaves jobs 'claimed'; put them back.
CREATE OR REPLACE FUNCTION public.factory_release_stale(p_minutes INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE sql
SET search_path = public
AS $$
  WITH r AS (
    UPDATE public.content_jobs
       SET status = 'queued', claimed_by = NULL, updated_at = now()
     WHERE status = 'claimed' AND claimed_at < now() - make_interval(mins => p_minutes)
    RETURNING 1
  )
  SELECT count(*)::INTEGER FROM r;
$$;

REVOKE EXECUTE ON FUNCTION public.factory_claim_jobs(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.factory_release_stale(INTEGER) FROM PUBLIC, anon, authenticated;

-- Progress at a glance.
CREATE OR REPLACE VIEW public.content_factory_progress
WITH (security_invoker = true) AS
SELECT kind, status, lane, count(*) AS jobs, round(sum(cost_usd), 2) AS cost_usd,
       min(updated_at) AS first_update, max(updated_at) AS last_update
  FROM public.content_jobs
 GROUP BY kind, status, lane;
