-- Content QA agent: its own tables only. App tables (cached_*) are never altered.
-- Copy this file to supabase/migrations/ and apply it (Supabase MCP apply_migration or the
-- SQL editor) before the first run. RLS on, no policies → service role only.

-- ── Queue of places to audit ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_units (
  unit_key        TEXT PRIMARY KEY,            -- normalizeName(canonical EN name) | normalizeName(city)
  qid             TEXT,                        -- Wikidata item, NULL → REVIEW
  name            TEXT NOT NULL,
  city            TEXT NOT NULL DEFAULT '',
  country         TEXT,
  priority        INTEGER,                     -- factory rank, or 100000 + hit order for app-born guides
  hits            INTEGER NOT NULL DEFAULT 0,
  source          TEXT,                        -- factory | app
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','claimed','done','review','quarantine','failed')),
  verdict         TEXT CHECK (verdict IN ('PASS','FIXED','REGENERATE','REVIEW','QUARANTINE')),
  text_level      SMALLINT CHECK (text_level BETWEEN 0 AND 3),
  seo_level       SMALLINT CHECK (seo_level BETWEEN 0 AND 3),
  attempts        INTEGER NOT NULL DEFAULT 0,
  claimed_by      TEXT,
  claimed_at      TIMESTAMPTZ,
  audited_at      TIMESTAMPTZ,                 -- set on PASS/FIXED: an honest "last reviewed" date
  wave            INTEGER,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {calls, costUsdEstimate, seconds}
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_units_queue_idx ON public.qa_units (status, priority NULLS LAST);
CREATE INDEX IF NOT EXISTS qa_units_qid_idx ON public.qa_units (qid);
COMMENT ON TABLE public.qa_units IS
  'Content QA queue, one row per real place. audited_at on PASS/FIXED is a true "last reviewed" date (schema.org lastReviewed). Claim with qa_claim_units(); never edit app tables'' schema.';

-- ── Every finding, with evidence ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_findings (
  id            BIGSERIAL PRIMARY KEY,
  unit_key      TEXT NOT NULL REFERENCES public.qa_units(unit_key) ON DELETE CASCADE,
  "check"       TEXT NOT NULL,                 -- identity|facts|style|look_for|tips|hours|coords|photos|aliases|consistency
  severity      TEXT NOT NULL CHECK (severity IN ('hard','soft','info')),
  level         SMALLINT CHECK (level BETWEEN 0 AND 3),  -- change severity when a change was applied
  detail        TEXT NOT NULL,
  "before"      TEXT,
  "after"       TEXT,
  evidence_url  TEXT,
  quote         TEXT,                          -- verbatim, ≤30 words
  model         TEXT,
  applied       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_findings_unit_idx ON public.qa_findings (unit_key);
COMMENT ON TABLE public.qa_findings IS 'One row per finding. A changed fact always carries evidence_url + quote. level = change severity 0-3 (0 cosmetic, 1 style, 2 factual, 3 critical).';

-- ── Photos: every blob judged, mapped to its source ───────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_photos (
  id            BIGSERIAL PRIMARY KEY,
  unit_key      TEXT NOT NULL REFERENCES public.qa_units(unit_key) ON DELETE CASCADE,
  blob_url      TEXT,
  source_url    TEXT,                          -- resolved upload.wikimedia.org URL (or other source)
  file_page     TEXT,                          -- https://commons.wikimedia.org/wiki/File:…
  author        TEXT,
  licence       TEXT,
  width         INTEGER,
  height        INTEGER,
  bytes_before  INTEGER,
  bytes_after   INTEGER,
  year          INTEGER,
  proven        BOOLEAN,                       -- tied to the QID (or vision+geo), see prompt H.9
  verdict       TEXT NOT NULL CHECK (verdict IN ('keep','replace','remove','add','shrink','unresolved','candidate','rejected')),
  reason        TEXT,
  slide_index   SMALLINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_photos_unit_idx ON public.qa_photos (unit_key);
COMMENT ON TABLE public.qa_photos IS 'Photo audit per unit. author + licence + file_page are the attribution record (CC BY / BY-SA need a credit line in the app).';

-- ── Aliases ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_aliases (
  id               BIGSERIAL PRIMARY KEY,
  unit_key         TEXT NOT NULL REFERENCES public.qa_units(unit_key) ON DELETE CASCADE,
  qid              TEXT,
  alias            TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  language         TEXT,
  source           TEXT NOT NULL,              -- wikidata_label|wikidata_alias|wp_title|wp_redirect|db_key|db_list|db_classification|user_log|ai_proposal|form_variant
  accepted         BOOLEAN NOT NULL,
  ambiguous        BOOLEAN NOT NULL DEFAULT false,  -- names another real place too → city-qualified only
  reason           TEXT,
  written          JSONB NOT NULL DEFAULT '{}'::jsonb, -- {classification:bool, guide_keys:[...], photo_keys:[...]}
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_key, alias_normalized)
);
COMMENT ON TABLE public.qa_aliases IS 'Alias curation per unit. accepted=false rows are kept as a record and never written to app tables. ambiguous=true → only the (alias, city) bucket, never the '''' bucket.';

-- ── SEO/GEO handoff ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_changes (
  id                      BIGSERIAL PRIMARY KEY,
  unit_key                TEXT NOT NULL REFERENCES public.qa_units(unit_key) ON DELETE CASCADE,
  qid                     TEXT,
  name                    TEXT NOT NULL,
  city                    TEXT NOT NULL DEFAULT '',
  wave                    INTEGER,
  changed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity                SMALLINT NOT NULL CHECK (severity BETWEEN 0 AND 3),      -- text level
  seo_severity            SMALLINT NOT NULL CHECK (seo_severity BETWEEN 0 AND 3),  -- max over all changes
  changed_parts           TEXT[] NOT NULL,     -- title|script|key_facts|look_for|tips|about|photo_hero|photo_other|photo_size|coords|hours|city|identity|quarantine|aliases
  en_payload_md5_before   TEXT,
  en_payload_md5_after    TEXT,
  coords_before           JSONB,
  coords_after            JSONB,
  hero_before             JSONB,               -- {blob, file_page, author, licence}
  hero_after              JSONB,
  translations_action     TEXT CHECK (translations_action IN ('deleted','kept','not_needed','held_for_beka')),
  translations_deleted    TEXT[] NOT NULL DEFAULT '{}',
  aliases                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{alias, language}] for JSON-LD alternateName
  explore_pages           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{path, lang, role: own|hub|neighbour}]
  maps_query              TEXT,                -- "<name>, <city>": Google Maps must be opened by name, never by coordinates (Beka 2026-11-08)
  seo_action              TEXT NOT NULL CHECK (seo_action IN ('regenerate_page','update_photo','update_geo','redirect','unpublish')),
  seo_status              TEXT NOT NULL DEFAULT 'pending' CHECK (seo_status IN ('pending','done','skipped')),
  seo_done_at             TIMESTAMPTZ,
  seo_done_by             TEXT,
  seo_note                TEXT
);
CREATE INDEX IF NOT EXISTS qa_changes_pending_idx ON public.qa_changes (seo_status, seo_severity DESC);
COMMENT ON TABLE public.qa_changes IS
  'Written by the content QA agent, consumed by the page generator / SEO agent. Rules: rebuild an EN page from the CURRENT cached_guides EN editors row only (if its md5 differs from en_payload_md5_after the content changed again — re-read). Rebuild a non-EN page only from a translation row created AFTER changed_at; until one exists leave the page and mark skipped. No paid translation for /explore/ (Beka 2026-10-15). Photo changes: 1280px hero + 500px card via Special:FilePath with author/licence credit. Coordinate changes: also rebuild neighbours'' nearby lists and the city hub. redirect: 301 old→new path. unpublish: drop from sitemap-explore.xml and llms.txt; Beka decides 410 vs keep. Mark done with seo_done_by.';
COMMENT ON COLUMN public.qa_changes.severity IS 'Text change level: 0 cosmetic, 1 style, 2 factual (any fact/chip changed), 3 critical (wrong place/city, regenerated, policy, misleading tip).';
COMMENT ON COLUMN public.qa_changes.seo_severity IS 'Max over text and non-text changes. Photos: hero 2, other 1, size-only 0. Coords: filled 1, moved beyond threshold 2, >50 km or other city 3. Hours: 1.';

CREATE OR REPLACE VIEW public.qa_seo_pending
WITH (security_invoker = true) AS
SELECT c.*, u.hits, u.priority, u.audited_at
  FROM public.qa_changes c
  JOIN public.qa_units u USING (unit_key)
 WHERE c.seo_status = 'pending'
 ORDER BY c.seo_severity DESC, u.hits DESC NULLS LAST, u.priority NULLS LAST;

-- ── RLS: service role only ────────────────────────────────────────────────────
ALTER TABLE public.qa_units    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_photos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_changes  ENABLE ROW LEVEL SECURITY;

-- ── Queue functions (same pattern as the factory) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.qa_claim_units(p_worker TEXT, p_limit INTEGER)
RETURNS SETOF public.qa_units LANGUAGE sql SET search_path = public AS $$
  UPDATE public.qa_units u
     SET status = 'claimed', claimed_by = p_worker, claimed_at = now(),
         attempts = u.attempts + 1, updated_at = now()
   WHERE u.unit_key IN (
     SELECT unit_key FROM public.qa_units
      WHERE status = 'queued'
      ORDER BY priority NULLS LAST, hits DESC, unit_key
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING u.*;
$$;

CREATE OR REPLACE FUNCTION public.qa_release_stale(p_minutes INTEGER DEFAULT 30)
RETURNS INTEGER LANGUAGE sql SET search_path = public AS $$
  WITH r AS (
    UPDATE public.qa_units SET status = 'queued', claimed_by = NULL, updated_at = now()
     WHERE status = 'claimed' AND claimed_at < now() - make_interval(mins => p_minutes)
    RETURNING 1)
  SELECT count(*)::INTEGER FROM r;
$$;

-- Snapshot an app table before a wave's first write. Idempotent (CREATE TABLE IF NOT EXISTS).
CREATE OR REPLACE FUNCTION public.qa_backup_table(p_source TEXT, p_target TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_source !~ '^[a-z_]+$' OR p_target !~ '^[a-z_0-9]+_backup_[0-9]{8}_[a-z0-9]+$' THEN
    RAISE EXCEPTION 'bad table name';
  END IF;
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I AS TABLE public.%I', p_target, p_source);
  RETURN p_target;
END $$;

REVOKE EXECUTE ON FUNCTION public.qa_claim_units(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qa_release_stale(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qa_backup_table(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Progress at a glance.
CREATE OR REPLACE VIEW public.qa_progress WITH (security_invoker = true) AS
SELECT status, verdict, count(*) AS units, min(updated_at) AS first_update, max(updated_at) AS last_update
  FROM public.qa_units GROUP BY status, verdict;
