# Content QA agent (`tools/content-qa/`)

Walks every published place ONE AT A TIME, audits what the user sees (guide text, chips, photos,
hours, map pin, aliases), fixes what is wrong with evidence, and records every change for the
SEO/GEO agent. Same architecture as `tools/content-factory/`: the Claude Code session is the
orchestrator, the checks are code, models are called only through `claude -p` on the Max plan.

The full rulebook is the project doc `claude/content-qa-agent-prompt-2026-11-01.md` (also in
`Audioguide/content-qa-agent-prompt-2026-11-01.md`). This README is the operator's view.

## Decisions already made (Beka, 2026-11-03) → `config.ts`

| Question | Decision |
|---|---|
| Max usage | After the factory queue is empty, up to 100% weekly (runner waits for `content_factory_progress` to show 0 queued guides; `CQ_FORCE=1` overrides) |
| Scope / order | All units, factory rank first, then app-born guides by hits |
| Translations | Delete at text level 2–3 (facts / critical), keep at 0–1; translated city lists only at 3 |
| Audio | Never deleted — `cached_audio` is keyed by the text hash, new text ⇒ new audio |
| Photos | Wikimedia ladder first; Openverse only for units still < 3 after it (not implemented yet) |
| Hours | Verify existing rows; Google for the top 1,000 by hits (≈$35, paid — needs Beka's go in Phase 2); OSM for the rest |
| Official-site facts | On for all units, ≤3 fetches each |
| Alias languages | EN + local + 17 core UI languages |
| Stop points | Only after the 20-unit pilot. Waves then run alone and report |

## Sub-agents (Beka 2026-11-08)

`agents/*.md` → copy to repo `.claude/agents/`. The cloud session orchestrates five specialists per unit
(alias-curator, text-editor, geo-verifier, photo-curator, reviewer); they call `cli.ts` for the mechanical
work and return JSON. `agents/ORCHESTRATION.md` has the flow. `run.ts` is the headless fallback.

Google Maps links: by NAME (`config.mapsLink`), never by coordinates — four code sites to fix are listed in
the prompt under PROPOSED APP DIFFS.

## Files

```
config.ts        all thresholds and Beka's decisions
db.ts            factory PostgREST client + md5, paging, delete, backup RPC
migrations/      20261108120000_content_qa.sql  → copy to supabase/migrations and apply first
types.ts         Unit, Finding, CheckResult
wiki.ts          Wikidata / Wikipedia REST / Commons / Overpass, paced, Retry-After aware
unit.ts          buildUnit(): one place from every table · seedUnits(): fill qa_units
aliases.ts       collect → judge (AI as judge only) → write classifications / guide keys
vision.ts        image classification via claude -p with the Read tool only
checks/photos.ts inventory · identity by QID · metadata · vision · ladder · shrink · write
checks/index.ts  identity/facts/style/chips/hours/coords/consistency — TO IMPLEMENT (stubs)
severity.ts      change levels 0–3, translation rule, seo_action
run.ts           seed | measure | audit (headless pipeline)
cli.ts           unit | aliases | photos | evidence | factcheck | style | gate1 | coords | hours — called by sub-agents
agents/          five sub-agent definitions + ORCHESTRATION.md
smoke.ts         Phase 0 read-only smoke test
```

Imports from the app (`@/lib/cacheKey`, `@/lib/guidePostprocess`, `@/lib/azureBlob.server`) and from
the factory (`transport`, `gate1`, `evidence`, `gate3`, `repair`, `publish`) — never copies.

## Running (factory cloud environment: Supabase network secret present)

```bash
npm install
# 0. apply migrations/20261108120000_content_qa.sql (Supabase MCP apply_migration)
npx tsx tools/content-qa/run.ts seed          # fills qa_units, idempotent
npx tsx tools/content-qa/run.ts measure       # counts + secrets present?
CF_DRY_RUN=1 npx tsx tools/content-qa/smoke.ts
CF_DRY_RUN=1 npx tsx tools/content-qa/run.ts audit --limit 20            # Phase 1, no writes
CQ_WORKER=qa-1 CQ_PATH_CHECK_OK=1 AZURE_SAS=… npx tsx tools/content-qa/run.ts audit --limit 20 --wave 0   # Phase 2
CQ_WORKER=qa-1 CQ_PATH_CHECK_OK=1 AZURE_SAS=… npx tsx tools/content-qa/run.ts audit --limit 500 --minutes 240 --wave 1
```

Environment:
- `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` — `proxy` with the network secret, or the real key.
- `AZURE_SAS` — Read+Write, no delete, 7–14 days, container `attractions` of `lokaliphotos`. Without
  it photos are audited and candidates recorded, nothing is written.
- `WIKIMEDIA_TOKEN` — optional; raises Commons API limits (cloud IPs get 429 otherwise).
- `CQ_PATH_CHECK_OK=1` — set only after the translation path check passed this wave (one paid Gemini
  call, done by hand per the prompt). Without it translations are held, never deleted.
- `QA_VISION_DISABLED=1` — makes vision return "unsure" (nothing removed on its strength).
- `CF_DRY_RUN=1` — no writes anywhere (shared with the factory).

## What is still to build (in this order)

1. `checks/identity.ts`, `checks/facts.ts` (wrap factory `getEvidence` → `factCheck` → `repairGuide`),
   `checks/style.ts`, `checks/chips.ts`, `checks/coords.ts`, `checks/hours.ts`, `checks/consistency.ts`
   — each per its prompt section; return `patch`, never write `cached_*` directly.
2. Photo ladder step for Openverse (config `externalSources`), only when a unit is still < 3.
3. `explore_pages` filling in `qa_changes` (grep `public/explore` for the QID sameAs) — or leave it
   to the SEO agent, which already reads `qa_seo_pending`.
4. Phase 1 HTML review file (before/after diff, contact sheet, map links).

## Safety rails (hard)

- Never calls `/api/guide`, `/api/attractions`, `/api/photo`, `/api/place-details` (paid on a miss).
- Never edits `src/`; proposes diffs in the report.
- Backups of all six app tables before the first write of a wave (`qa_backup_table`).
- Writes the identical payload to every key of a unit; alias keys are insert-only.
- A defect pattern in > 5% of units, or errors > 5%, pauses the wave (rule 10).
- 5-hour window ≥ 90% → wait; weekly ≥ ceiling → stop.
