# tools/seo-agent — Lokali's standing SEO/GEO agent

The agent that measures, decides, executes and reports on lokali.travel's organic visibility (Google, Bing, Yandex for Russian) and AI-answer citations (ChatGPT, Perplexity, Google AI Overviews / AI Mode, Gemini, Claude). It is a system of files in this repo so that any Claude Code cloud session or scheduled run behaves the same.

Nothing in this folder is part of the app build.

## Files

| File | What it is |
|---|---|
| `AGENT.md` | The operating prompt (versioned). Read it in full at the start of every run. |
| `RULES.md` | IMMUTABLE CORE (only Beka changes it) + mutable rules (the monthly retro may tune them). |
| `config.json` | Every tunable: thresholds, samples, model routing, ceilings, languages, pinned skills. |
| `decisions.md` | Dated, one line per decision: who decided, what it replaces. Standing approvals live here after ONBOARDING. |
| `backlog.md` | Tickets with ICE, standing/ASK, status, exact change, where, how to verify. |
| `experiments.md` | Hypotheses, cohorts, metrics, results (WORKSTREAM J). |
| `CHANGELOG.md` | Every change to AGENT.md / config.json / RULES.md with the evidence behind it. |
| `precheck.py` | Offline pre-deploy checks over `public/` (sitemaps, canonicals, hreflang, robots, JSON-LD, forbidden strings). Used by the pipeline and the PostToolUse hook. |
| `hooks/` | Claude Code hooks wired from `.claude/settings.json` (see below). |
| `keywords/`, `snapshots/`, `reports/`, `geo-panel/` | State: created on the first run; committed. |
| `data/` | Raw exports per run (`data/<yyyy-ww>/`); gitignored. |
| `.active` | Marker created at the start of a run (`touch tools/seo-agent/.active`), renamed to `.inactive` at the end. Agent-only hook rules apply only while it exists and is younger than 6 hours. |
| `PAUSE` | Kill switch: if this file exists, the agent only writes a read-only status report. |

## Starting a run

1. In a Claude Code session on this repo (cloud session or scheduled task), use the skill `seo-agent-run` or say: "Run the Lokali SEO agent in ONBOARDING mode" (first time) / "… WEEKLY mode" / "… MONTHLY mode".
2. The agent reads `AGENT.md`, `RULES.md`, `config.json`, `decisions.md`, `backlog.md`; checks `PAUSE`; touches `.active`; checks the Max usage windows (`npx tsx tools/content-factory/usage.ts`) and, if OpenRush is connected, its credits; then follows the cadence in `AGENT.md`.
3. It ends by writing `reports/<yyyy-mm-dd>-<mode>.md`, updating state files, committing on a branch `seo/<date>-<topic>` (cloud) and renaming `.active` to `.inactive`.

On Beka's computer (mounted folder): never run git, never delete; state is written and Beka commits from GitHub Desktop.

## Secrets (names only; values live in the cloud environment's secrets or Lovable Project Secrets)

- `GSC_SERVICE_ACCOUNT_JSON` — Search Console API service account key (full JSON). Setup: Google Cloud "Lokali" project → enable Search Console API → Service Accounts → create → JSON key → Search Console property → Users → add the service-account email (Full). Also used by claude-seo's `/seo google setup`.
- `BING_WMT_API_KEY` — Bing Webmaster Tools API key (Settings → API access) after importing the property from Search Console.
- `PSI_API_KEY` — optional PageSpeed Insights key (raises quota).
- `EXTERNAL_SUPABASE_URL`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` — same as the content factory (read-only use except the writes named in AGENT.md).

Search Console can alternatively be connected inside the OpenRush dashboard (Connections → Search Console); then `get_search_performance` works through the OpenRush MCP (2 credits per call).

## Hooks

`.claude/settings.json` wires three hooks to `hooks/run.sh <name>`:

- `pre_bash` (PreToolUse on Bash): always blocks `rm -rf`, force pushes, `git reset --hard`, `curl … | bash`, `DROP/TRUNCATE`, printing secrets. While `.active` exists (and is <6 h old) it also blocks calls to the paid lokali.travel endpoints, `DELETE` on non-`seo_*` tables and ad-hoc deploy commands. Other sessions in this repo (content factory, Beka) are not affected by the agent-only rules.
- `post_write` (PostToolUse on Write/Edit): runs `precheck.py --file <path>` on anything written under `public/`; blocks on hard failures (invalid sitemap XML, robots blocking a search-index bot, noindex on a sitemap URL, forbidden price/hours strings in blog pages, invalid JSON-LD).
- `on_stop` (Stop): while `.active` exists, refuses to end the session until a report for this run and the state files were written.

Hook scripts need `python3` (or `python`) on PATH; if neither exists the hook exits 0 and logs nothing.

## Pre-deploy checks

```
python3 tools/seo-agent/precheck.py --all            # full offline check, 50-URL sample
python3 tools/seo-agent/precheck.py --all --sample 200
python3 tools/seo-agent/precheck.py --file public/explore/en/istanbul.html
```

Exit code 1 = hard failure (do not deploy). Warnings are printed but do not fail.

## What the agent never does

Generate or translate guide content (content factory / Gemini), edit guide text (content QA agent), spend money or deploy outside the pipeline, touch `src/`, edit static pages by hand, run git on Beka's mount. See `RULES.md`.
