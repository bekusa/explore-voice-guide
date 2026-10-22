# Content factory

Offline generation of `cached_guides` and `cached_attractions` with the app's
own prompts, on Claude subscription credits (cloud session credits / Max)
instead of the paid Anthropic API. Plan and decisions:
`claude/content-factory-plan-2026-10.md` (claude.ai project "Audioguide").

Not part of the app build: nothing in `src/` imports this folder, and Vite
only bundles what `src/` imports.

## Why the output is identical to what a user gets

The factory imports, not copies, everything the live routes run:
`src/lib/prompts.ts` (prompts), `src/lib/guidePostprocess.ts` (duration,
spoken years), `parseClaudeJson`, `resolveCoords`, and the cache-key
normalizers in `src/lib/cacheKey.ts`. Only the transport differs:
`claude -p --model claude-sonnet-4-5` with the app's system prompt, no
tools, no thinking (`transport.ts`).

## Files

| file | what |
|---|---|
| `config.ts` | models, budgets, gate thresholds, first-wave filters |
| `transport.ts` | one model call = one `claude -p` process |
| `generate.ts` | guide / city list generation, mirrors the live routes |
| `gate1.ts` | contract checks (length, chips, TTS rules, prices…) — code |
| `gate2.ts` | grounding: years vs evidence, list items vs city location — code |
| `gate3.ts` | fact-check against Wikipedia/Wikidata evidence — model |
| `repair.ts` | fixes only the flagged sentences (marked `edited`) |
| `evidence.ts` | Wikipedia article text + Wikidata facts, cached in `content_evidence` |
| `publish.ts` | writes the app's cache rows; never overwrites existing ones |
| `prepare.ts` | target CSVs → worklist (city resolution via Wikidata) → `content_jobs` |
| `run.ts` | the loop: claim → generate → gates → publish |
| `try.ts` | generate a few items and print the gate results, no writes |

## Commands

```bash
npm install
# worklist (no writes); add --load to fill target_* and queue content_jobs
CF_DRY_RUN=1 npx tsx tools/content-factory/prepare.ts top-20000-guide-targets.csv top-5000-city-targets.csv
# dry run on 5 local jobs
CF_DRY_RUN=1 npx tsx tools/content-factory/run.ts --local worklist.json --kind guide --limit 5
# real run (needs Supabase access, see below)
npx tsx tools/content-factory/run.ts --lane cloud --kind guide --limit 200 --minutes 100
npx tsx tools/content-factory/run.ts --lane cloud --kind attractions --limit 100 --minutes 100
```

## Supabase access

Preferred: a **network secret** on the cloud environment for host
`dwyajguhgyjbgkpzjaln.supabase.co` (headers `apikey` and
`Authorization: Bearer`), so the key never enters the session.
Alternative: environment variable `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`.

## Progress

```sql
select * from content_factory_progress order by kind, status;
select verdict, count(*) from content_audit group by 1;
```
