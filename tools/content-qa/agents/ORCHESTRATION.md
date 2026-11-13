# Content QA — orchestration with sub-agents

The cloud Claude Code session is the ORCHESTRATOR. It never reads guide text, photos or evidence
itself: per unit it dispatches five specialist sub-agents (Claude Code `.claude/agents/*.md`, the
files in this folder), each with its own system prompt, tool allow-list and model, and merges their
compact JSON results. Deterministic work stays in code (`tools/content-qa/*.ts`): sub-agents CALL the
code through `npx tsx`, they do not re-implement it.

Why sub-agents here (and not for generation): auditing is judgement over evidence, which benefits
from a narrow, fresh context per domain and from an independent reviewer that has not seen the work.
Generation stayed `claude -p` in the factory because identity with the app's output mattered.
Cost: each sub-agent run carries Claude Code's own system prompt (~11k cached tokens). Budget per
unit is capped in config.ts (maxBudgetPerUnitUsd); the orchestrator stops a unit that exceeds it and
marks it REVIEW.

## Install
Copy `agents/*.md` → repo `.claude/agents/`. The orchestrator uses the Agent tool with
`subagent_type` = the file's `name`.

## Per-unit flow (orchestrator)
```
claim unit (qa_claim_units)
→ npx tsx tools/content-qa/cli.ts unit <unit_key>          # assembles the Unit JSON into a scratch file
→ qa-alias-curator  (reads unit.json)        → aliases.json       (writes qa_aliases, classifications, keys)
→ qa-text-editor    (unit.json, aliases)     → text.json          (findings + patch, NO writes)
→ in parallel: qa-geo-verifier → geo.json ;  qa-photo-curator → photos.json (writes photos if SAS)
→ orchestrator: gate1 + normalizeGuidePayload on the patch → write every key → severity → translations
→ qa-reviewer on every FIXED unit in the pilot, and on a 5% sample afterwards → may flip to REVIEW
→ qa_units / qa_findings / qa_changes → release
```
Sub-agents return ONLY JSON of the shape in their prompt. The orchestrator keeps per-wave tallies,
usage windows, backups and the rule-10 pattern pause (run.ts does this when used headless).

## Shared rules every sub-agent inherits (copy stays in each file)
- Never call lokali.travel paid endpoints (/api/guide, /api/attractions, /api/photo, /api/place-details).
- Never edit src/ or public/explore. Propose diffs as text.
- Every changed fact: evidence_url + verbatim quote ≤30 words, or no change.
- Georgia policy (Abkhazia, Tskhinvali region), conflict zones: monuments only, neutral.
- Report in English JSON; the orchestrator writes Georgian summaries for Beka.
