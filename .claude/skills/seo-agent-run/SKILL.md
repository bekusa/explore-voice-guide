---
name: seo-agent-run
description: Start a Lokali SEO/GEO agent run in this repo — ONBOARDING (first time), WEEKLY, MONTHLY, QUARTERLY or AD HOC. Use when asked to run the SEO agent, do the weekly or monthly SEO run, onboard the SEO agent, or check SEO/GEO status for lokali.travel.
---

# seo-agent-run

The agent's body lives in `tools/seo-agent/` (AGENT.md, RULES.md, config.json, state files) and `.claude/agents/` (sub-agents). This skill is the entry point; it does not replace AGENT.md.

## Steps

1. Read, in this order: `tools/seo-agent/RULES.md`, `tools/seo-agent/AGENT.md`, `tools/seo-agent/config.json`, `tools/seo-agent/decisions.md`, `tools/seo-agent/backlog.md`, `tools/seo-agent/experiments.md`, the latest file in `tools/seo-agent/reports/` if any.
2. Kill switch: if `tools/seo-agent/PAUSE` exists, write a read-only status report and stop.
3. Mark the run: `touch tools/seo-agent/.active` (the hooks enforce the agent-only rules while it exists).
4. Pick the mode from the request or the calendar: the first run ever is ONBOARDING; the first run of a month is MONTHLY; every third MONTHLY is QUARTERLY; otherwise WEEKLY; a question from Beka is AD HOC.
5. Usage and budget: read the Max windows (`npx tsx tools/content-factory/usage.ts` when available) and, if the OpenRush MCP is present, `describe_capabilities` + `list_connections`; stop if either Max window is already ≥50% or if `config.json: standing_approvals_confirmed` is false and the mode is not ONBOARDING (then run ONBOARDING instead, or report what is missing).
6. Detect tools and access (ENVIRONMENT in AGENT.md) and write the list into the report.
7. Follow the mode's steps in AGENT.md → OPERATING CADENCE, using the sub-agents in `.claude/agents/` through the Agent tool (seo-crawler, seo-indexing, seo-editor, geo-monitor, link-scout, alias-curator, trend-scout, seo-verifier). Keep their parallelism small; usage counts toward the 50% ceiling.
8. Any change to the site goes through the deployment pipeline (AGENT.md OPERATING MODEL §7): branch `seo/<yyyy-mm-dd>-<topic>` → `npm run build` → `python3 tools/seo-agent/precheck.py --all` → seo-verifier → merge → Lovable `deploy_project` → post-checks → rollback on failure. Only while `config.json: standing_approvals_confirmed` is true; otherwise every change is a proposal in the report.
9. Write `tools/seo-agent/reports/<yyyy-mm-dd>-<mode>.md` in the REPORT FORMAT (Georgian), update `backlog.md`, `decisions.md`, `experiments.md`, `snapshots/<yyyy-ww>.json`, and `CHANGELOG.md` if AGENT.md/config.json changed.
10. Commit the state on the branch (cloud session) or leave the files for Beka to commit (his mounted folder: no git). Rename the marker: `mv tools/seo-agent/.active tools/seo-agent/.inactive`.
11. Give Beka the report text in the reply, in Georgian, one screen first.

## Never
Generate or translate guide content; edit guide text; touch `src/`; hand-edit `public/explore/`; spend money; deploy outside the pipeline; run git on Beka's mount; reveal or print secrets.
