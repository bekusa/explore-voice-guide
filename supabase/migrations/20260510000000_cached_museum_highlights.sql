-- Museum highlights cache. Each row holds the AI-generated "top 30
-- must-see objects" payload for one museum, keyed by museum_id +
-- language. Same shape and conventions as cached_guides /
-- cached_attractions: jsonb payload, hit_count for analytics, RLS
-- enabled (only the Cloudflare worker reads/writes via service-role).
--
-- Beka's spec: when the user lands on a museum (Louvre, British
-- Museum, …) the attraction page shows a "must-see" section with
-- ~30 highlights paginated 10 per page. The list is generated once
-- per (museum, language) by Claude Sonnet (quality matters, same
-- reasoning as the guide route) and pinned here so subsequent
-- visitors get an instant cache hit.

create table if not exists public.cached_museum_highlights (
  id uuid primary key default gen_random_uuid(),
  -- Stable museum identifier — matches the ids in
  -- src/lib/topMuseums.ts (e.g. "louvre", "british-museum",
  -- "metropolitan-museum-of-art"). Lowercased, hyphenated, no
  -- diacritics.
  museum_id text not null,
  -- Language code as we send it to the LLM: "en", "ka", "es",
  -- "zh-cn", "pt-br", …
  language text not null,
  -- Full LLM payload. Shape:
  --   {
  --     highlights: [
  --       { name, era, brief, story, location_hint, image_url? },
  --       …
  --     ]
  --   }
  -- Kept as raw JSON so adding a new highlight field later (say,
  -- "audio_excerpt_id") doesn't need a migration.
  payload jsonb not null,
  -- Soft analytics: increment on every cache hit so we can spot
  -- popular museums and pre-warm them, or retire stale rows when
  -- the table grows.
  hit_count int not null default 1,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (museum_id, language)
);

create index if not exists cached_museum_highlights_popular
  on public.cached_museum_highlights (hit_count desc);

alter table public.cached_museum_highlights enable row level security;
