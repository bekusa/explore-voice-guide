# decisions.md — Lokali SEO/GEO agent

One line per decision: date · who · decision · what it replaces/affects. Newest at the bottom. Standing approvals are recorded here after ONBOARDING; until then `config.json: standing_approvals_confirmed = false` and every standing item is treated as ASK.

## Inherited (before the agent existed)

- 2026-08-08 · Beka+Claude · hreflang and sitemap are written from one source: the files on disk; city corrections shipped as 301s in public/_redirects. · replaces the 44-alternates sitemap.
- 2026-08-27 · Beka · robots.txt allows AI search and training crawlers on /explore/, /blog/, /about/; /api/ disallowed; IndexNow key file in public/. · baseline.
- 2026-10-07 · Beka · the blog is hidden only inside the app (window.Capacitor guard); never blocked for mobile or bots. · rejects the "web only" idea.
- 2026-10-15 · Beka · no paid translation or generation to fill new languages on /explore/; do not remind. · stands.
- 2026-10-17 · Beka · 9 "unsure" categories and town/municipality targets deferred; expanding targets to 50,000 rejected. · stands.
- 2026-10-17 · Beka · backlink outreach drafts (iWander → Tour in a Box → AudaTours, one per day) PAUSED until he says go. · ask once in ONBOARDING (Q8).
- 2026-10-22 · Beka · static-page weekly regeneration, two-way app↔/explore/ links, /explore/ analytics: "later". · may be re-proposed only inside a ticket with numbers.
- 2026-10-24 · Beka · wave 1 = ~1,540 EN pages (Wikipedia ≥3k views/month), hubs only with ≥3 guides; first reading at 2 weeks. · stands; gate at 6 weeks (RULES).
- 2026-10-31 · Beka · the 29 disputed-territory pages stay unpublished; do not raise. · stands.
- 2026-11-07 · Beka · iOS App Store links: SPA first, static later via templates after an approved plan; /app smart link proposed. · stands.

## 2026-11-07 (agent design, Beka)

- 2026-11-07 · Beka · SEO/GEO positioning: "audio guide"; aim for first place in the category per language. · replaces nothing (product branding untouched).
- 2026-11-07 · Beka · full automation after one ONBOARDING; standing approvals + a short ALWAYS-ASK list (RULES §3). · replaces the v1 three-level autonomy model.
- 2026-11-07 · Beka · Max usage ceiling 50% (both windows), sub-agents included. · replaces 10%/20% per run.
- 2026-11-07 · Beka · the agent tracks SEO/GEO trends and tests new tags/parameters (WORKSTREAM J); external research services allowed, paid ones only after his yes. · new.
- 2026-11-07 · Beka · the agent writes and improves itself (AGENT.md, config.json, skills) within the IMMUTABLE CORE; models and check counts are tunable with evidence. · new.
- 2026-11-07 · Beka · sub-agents with skills, hooks and rules in the repo (.claude/, tools/seo-agent/). · new.
- 2026-11-07 · Beka · aliases: check and add location aliases where needed (WORKSTREAM K), Tier 1 first. · new.
- 2026-11-07 · Beka · per-page work only on indexed pages (SCOPE tiers); other pages only via templates and the wave gate. · new.
- 2026-11-07 · Beka · multilingual: research each language's queries natively; engines per market. · new.
- 2026-11-07 · Beka · tools to connect: Lovable, Search Console, Bing, etc. OpenRush connected on 2026-11-07 (no owned data yet). · new.
- 2026-11-07 · Claude (proposal, pending Beka) · skills import from original repos only (AgriciDaniel/claude-seo; 11 skills from coreyhaines31/marketingskills), pinned and verifier-reviewed; nothing from aitmpl.com. · awaiting ONBOARDING.

## Standing approvals (to be filled in ONBOARDING)

(empty — see AGENT.md ONBOARDING QUESTIONS 1-12)
