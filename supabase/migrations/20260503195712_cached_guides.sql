-- Shared, server-side cache for AI-generated content (Lokali guides
-- and attraction lists). The frontend localStorage cache is per-user;
-- this table makes the first hit on a popular place pay the Claude
-- bill, and every subsequent visitor — across all browsers, devices,
-- and sessions — gets an instant edge response.
--
-- Two tables, one shape, because the upstream payloads differ:
--   cached_guides       — output of n8n /webhook/guide
--   cached_attractions  — output of n8n /webhook/attractions
--
-- Cache keys are normalized so trivial input drift ("Narikala
-- Fortress" vs " narikala  fortress ") collapses to the same row.
--
-- No RLS policies are added — only the Cloudflare Worker (with
-- service-role key) reads/writes these tables. RLS stays enabled so
-- anon clients can't poke at the cache directly.

-- ──────────────────────────────────────────────────────────────────
-- 1. Guides cache (rich payload: script + chips + tips + nearby)
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.cached_guides (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased, whitespace-collapsed place name. Same shape the
  -- frontend uses for its localStorage cache key, so a manual sync
  -- is straightforward later.
  name_normalized text not null,
  -- Language code as sent to n8n: "en", "ka", "es", "zh-cn"…
  language text not null,
  -- Interest bias: "history" / "art" / "food" / etc. "history" is
  -- the default bucket when the user hasn't picked one.
  interest text not null,
  -- Full n8n response payload. We keep it as raw JSON so any future
  -- field added by the workflow flows through without a migration.
  payload jsonb not null,
  -- Soft analytics — increment on every cache hit so we can spot
  -- popular places and pre-warm them, or pick what to retire when
  -- the table grows.
  hit_count int not null default 1,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (name_normalized, language, interest)
);

-- The lookup index is implicit from the unique constraint, but make
-- "show me hot rows" fast for the eventual stats dashboard.
create index if not exists cached_guides_popular
  on public.cached_guides (hit_count desc);

alter table public.cached_guides enable row level security;

-- ──────────────────────────────────────────────────────────────────
-- 2. Attractions cache (city / country / landmark search results)
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.cached_attractions (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased, whitespace-collapsed search query — usually a city
  -- ("Tbilisi", "Rome") but can also be a single landmark.
  query_normalized text not null,
  language text not null,
  -- The result list depends on filters too. Empty filters
  -- ({"interests": [], "duration": ""}) collapses to a stable string
  -- so "no preference" hits a single shared row.
  filters_key text not null default '{}',
  payload jsonb not null,
  hit_count int not null default 1,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (query_normalized, language, filters_key)
);

create index if not exists cached_attractions_popular
  on public.cached_attractions (hit_count desc);

alter table public.cached_attractions enable row level security;
