-- Time Machine cache. Each row holds one AI-generated immersive
-- simulation text, keyed by attraction_id + role + language. Same
-- shape and conventions as cached_museum_highlights / cached_guides:
-- jsonb payload, hit_count for analytics, RLS enabled (only the
-- Cloudflare worker reads/writes via service-role).
--
-- Beka's spec: the Time Machine page lists 34 historical "moments"
-- (Pompeii on August 23 79 AD, the storming of the Bastille, the
-- night Tutankhamun died, …). Each moment can be replayed from the
-- point of view of one of 8 roles (merchant, soldier, servant,
-- foreigner, child, healer, spy, survivor) and in any of the 33+
-- supported UI languages. That's 34 × 8 × 33 ≈ 9 000 distinct
-- simulations — once Claude has generated one, every subsequent
-- visitor on any device should get an instant cache hit.
--
-- Cache key shape mirrors how the frontend triggers a generation:
--   attraction_id  → stable id from ATTRACTIONS in
--                    src/components/TimeMachine.tsx
--                    (e.g. "rhodes_colossus", "pompeii_day",
--                    "bastille", "tbilisi_1795"). Lowercased,
--                    snake_case, no diacritics.
--   role           → the value field on the role chosen in the
--                    "Choose your role *" dropdown
--                    ("merchant" | "soldier" | "servant" |
--                     "foreigner" | "child" | "healer" | "spy" |
--                     "survivor"). Lowercased.
--   language       → language code as we send it to the LLM:
--                    "en", "ka", "es", "zh-cn", "pt-br", …

create table if not exists public.cached_time_machine (
  id uuid primary key default gen_random_uuid(),
  attraction_id text not null,
  role text not null,
  language text not null,
  -- Full LLM payload. Shape (subject to change as the Time Machine
  -- generation prompt evolves):
  --   {
  --     title:   "...",         -- on-screen header
  --     intro:   "...",         -- 1-2 sentence scene-setter
  --     scenes:  [              -- 4-8 first-person beats
  --       { heading, body },
  --     ],
  --     epilogue: "...",        -- short tie-back to the present
  --     duration_seconds: 480
  --   }
  -- Kept as raw JSON so adding a new field later (audio_excerpt_id,
  -- nearby_moments, …) doesn't need a migration.
  payload jsonb not null,
  -- Soft analytics: increment on every cache hit so we can spot
  -- popular (moment, role, language) combos and pre-warm them, or
  -- retire stale rows when the table grows.
  hit_count int not null default 1,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (attraction_id, role, language)
);

create index if not exists cached_time_machine_popular
  on public.cached_time_machine (hit_count desc);

-- Secondary lookup pattern: "show me everything cached for this
-- moment" (e.g. for cache-debug or a future "see other perspectives"
-- UI). The (attraction_id, language) prefix of the unique constraint
-- already covers most of this, but a dedicated index on attraction_id
-- alone keeps the per-moment scan cheap regardless of language.
create index if not exists cached_time_machine_by_attraction
  on public.cached_time_machine (attraction_id);

alter table public.cached_time_machine enable row level security;
