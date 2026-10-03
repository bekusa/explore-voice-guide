-- error_logs — one row per server-side failure, from ANY service.
-- Beka 2026-10-03.
--
-- WHY THIS EXISTS
--   Azure Speech had been returning 401 on every text-to-speech call
--   for five days and nobody knew. The only telemetry the app had was
--   `api_logs`, which records Anthropic calls and nothing else, so a
--   dead Azure key produced exactly zero evidence — the user saw a raw
--   "HTTP 502" toast and the server wrote a console.warn that nobody
--   reads in a Cloudflare Worker.
--
--   Beka's ask: "ილოგებოდეს ესეთი ერორები და ნებისმიერი ერორი
--   საერთოდ" — log these and any error at all.
--
-- WHAT GOES IN
--   Failures only. Successful calls stay out: this table is meant to
--   be scanned by eye ("what broke today?"), and mixing in the happy
--   path would bury the signal. Anthropic keeps its own api_logs row
--   for per-call latency/model stats; a hard failure there writes here
--   too, so this stays the single place to look.
--
-- SIZE
--   Failures are rare by nature, but a broken upstream can produce one
--   row per request. `prune_error_logs()` below keeps 60 days.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id BIGSERIAL PRIMARY KEY,

  -- Which upstream or subsystem failed: 'azure-speech', 'anthropic',
  -- 'google-places', 'gemini', 'supabase', 'internal'.
  service TEXT NOT NULL,

  -- Our route that was executing, e.g. '/api/tts'.
  route TEXT,

  -- Upstream HTTP status when there was one. NULL for thrown errors,
  -- timeouts and aborts — and that NULL is itself diagnostic: it
  -- separates "they said no" from "we never got an answer".
  status INTEGER,

  -- Short machine-ish reason, used for grouping in queries:
  -- 'auth', 'quota', 'timeout', 'bad-response', 'network', 'unknown'.
  kind TEXT,

  -- Human-readable message. NEVER contains a key or token — see the
  -- redaction in logError().
  message TEXT NOT NULL,

  -- Anything useful for reproducing: attraction name, language, voice,
  -- byte counts, upstream body excerpt. JSONB so the shape can vary
  -- per service without a migration each time.
  context JSONB,

  -- How long we waited before giving up. Distinguishes "instant
  -- rejection" (auth) from "waited 100 s" (timeout) at a glance —
  -- which is exactly the question that was unanswerable about the
  -- Azure failure.
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "What is broken right now?" and "when did this start?" — the two
-- queries this table exists to answer.
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx
  ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_service_created_idx
  ON public.error_logs (service, created_at DESC);

-- RLS on, no policies: service-role server code writes, Beka reads in
-- the Supabase UI. The anon client must never see this — context can
-- carry attraction names and upstream messages.
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.error_logs IS
  'Every server-side failure, any service. Written by logError() in src/lib/errorLog.server.ts.';

-- Retention. Call manually or from a scheduled job; 60 days is long
-- enough to spot a monthly pattern (an F0 Azure resource expiring,
-- say) without growing unbounded.
CREATE OR REPLACE FUNCTION public.prune_error_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.error_logs WHERE created_at < now() - interval '60 days';
$$;
