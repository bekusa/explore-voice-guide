-- Control panel for the three agent systems (factory, qa, seo). Own tables only; app tables untouched.
-- The dashboard writes desired_state / max_weekly_pct through agent_set_control();
-- each agent calls agent_heartbeat(<system>) before every unit of work (tools/agent-control.ts),
-- obeys what it returns, and by calling it acknowledges the command (seen_state, seen_at).

CREATE TABLE IF NOT EXISTS public.agent_control (
  system          TEXT PRIMARY KEY CHECK (system IN ('factory','qa','seo')),
  desired_state   TEXT NOT NULL DEFAULT 'run' CHECK (desired_state IN ('run','pause')),
  max_weekly_pct  INTEGER NOT NULL DEFAULT 100 CHECK (max_weekly_pct BETWEEN 10 AND 100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT,
  seen_state      TEXT,
  seen_at         TIMESTAMPTZ,
  agent_note      TEXT
);
COMMENT ON TABLE public.agent_control IS
  'One row per agent system. desired_state run|pause and max_weekly_pct (ceiling of the Max plan weekly window, %) are set by Beka from the dashboard. Agents: call agent_heartbeat(system, note) before each unit / at the start of each run; if it returns pause, claim nothing new, finish the unit in hand, then poll every 5 minutes. Never write desired_state yourself.';

CREATE TABLE IF NOT EXISTS public.agent_control_log (
  id      BIGSERIAL PRIMARY KEY,
  system  TEXT NOT NULL,
  field   TEXT NOT NULL,
  old     TEXT,
  new     TEXT,
  by      TEXT,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.agent_control (system, max_weekly_pct, updated_by) VALUES
  ('factory', 100, 'init'), ('qa', 100, 'init'), ('seo', 50, 'init')
ON CONFLICT (system) DO NOTHING;

ALTER TABLE public.agent_control     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_control_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.agent_set_control(p_system TEXT, p_state TEXT DEFAULT NULL, p_max_weekly INTEGER DEFAULT NULL, p_by TEXT DEFAULT 'dashboard')
RETURNS public.agent_control LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_control;
BEGIN
  SELECT * INTO r FROM public.agent_control WHERE system = p_system FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown system %', p_system; END IF;
  IF p_state IS NOT NULL AND p_state IS DISTINCT FROM r.desired_state THEN
    INSERT INTO public.agent_control_log (system, field, old, new, by) VALUES (p_system, 'desired_state', r.desired_state, p_state, p_by);
  END IF;
  IF p_max_weekly IS NOT NULL AND p_max_weekly IS DISTINCT FROM r.max_weekly_pct THEN
    INSERT INTO public.agent_control_log (system, field, old, new, by) VALUES (p_system, 'max_weekly_pct', r.max_weekly_pct::text, p_max_weekly::text, p_by);
  END IF;
  UPDATE public.agent_control
     SET desired_state = COALESCE(p_state, desired_state),
         max_weekly_pct = COALESCE(p_max_weekly, max_weekly_pct),
         updated_at = now(), updated_by = p_by
   WHERE system = p_system RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.agent_heartbeat(p_system TEXT, p_note TEXT DEFAULT NULL)
RETURNS TABLE (desired_state TEXT, max_weekly_pct INTEGER) LANGUAGE sql SET search_path = public AS $$
  UPDATE public.agent_control c
     SET seen_state = c.desired_state, seen_at = now(), agent_note = COALESCE(p_note, c.agent_note)
   WHERE c.system = p_system
  RETURNING c.desired_state, c.max_weekly_pct;
$$;

CREATE OR REPLACE FUNCTION public.qa_requeue_failed(p_by TEXT DEFAULT 'dashboard')
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  WITH r AS (
    UPDATE public.qa_units SET status = 'queued', claimed_by = NULL, updated_at = now()
     WHERE status = 'failed' RETURNING 1)
  SELECT count(*)::INTEGER INTO n FROM r;
  INSERT INTO public.agent_control_log (system, field, old, new, by) VALUES ('qa', 'requeue_failed', NULL, n::text, p_by);
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.agent_set_control(TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agent_heartbeat(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qa_requeue_failed(TEXT) FROM PUBLIC, anon, authenticated;
