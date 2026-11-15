/**
 * agent-control.ts — the dashboard's run/pause switch, shared by the three agent systems
 * (content factory, content QA, SEO/GEO agent).
 *
 * Table public.agent_control (supabase/migrations/20261114000000_agent_control.sql) holds, per
 * system, the command Beka set from the dashboard: desired_state run|pause and max_weekly_pct
 * (ceiling of the Max plan's weekly window, in %). An agent calls agent_heartbeat(system) before
 * every unit of work; the call returns the command and records that the agent has read it, which
 * is what the dashboard shows as "the agent read this command N minutes ago".
 *
 *   import { waitWhilePaused } from "../agent-control";
 *   const c = await waitWhilePaused("factory", { note: "guide 12/200", deadline });
 *   if (c === "deadline") stop; else if (c) weeklyCap = c.max_weekly_pct / 100;
 *
 *   npx tsx tools/agent-control.ts seo "weekly run start"   → prints the command; exit 0 = run, 3 = pause
 *
 * LIVE ACTIVITY (Beka, 2026-11-14: "show me on the dashboard which sub-agent is working on what").
 * Every call that carries a note also appends one row to agent_control_log (field 'activity',
 * by = the agent's name, new = what it is doing). The dashboard shows the newest rows as the live
 * feed and marks the agents that reported in the last few minutes as working now.
 *
 *   npx tsx tools/agent-control.ts qa "Phase 0: reachability tests"
 *       the system's lead agent (factory: run.ts, qa: orchestrator, seo: seo-agent) checks the
 *       switch AND reports; exit 0 = run, 3 = pause
 *   npx tsx tools/agent-control.ts qa --agent qa-text-editor "Hagia Sophia, Istanbul"
 *       a sub-agent reports what it has started; always exits 0 (a report, not a check)
 *   npx tsx tools/agent-control.ts qa --agent qa-text-editor --unit "Hagia Sophia, Istanbul" "checking facts"
 *       the same, naming the ONE unit in work; the dashboard shows the unit and its steps
 *   import { report } from "../agent-control";  report("factory", "fact-checker", "claims", job.name);
 *
 * ONE AT A TIME (Beka, 2026-11-14): every system works on one place / guide / page at a time and
 * one sub-agent at a time on it. No parallel batches. So at any moment there is exactly one unit and
 * one step to show.
 *
 * Keep `what` to one short line a non-developer can read: the place or page, then the step.
 * Never put secrets, keys or full URLs with tokens in it.
 *
 * Notes the dashboard understands (second CLI argument / `note`):
 *   "WAITING: <one-line question>"  the run has stopped and needs Beka's decision → shown as "waiting for you"
 *   "STOPPED: <where / result>"     the run has ended (Stop pressed, queue empty, limit reached)
 *   anything else                    progress, e.g. "wave 2, 340/500"
 * Stop on the dashboard = desired_state pause: finish the unit in hand, poll every 5 minutes for at
 * most 30 minutes (Beka may press Start again), then end the run with a STOPPED note. A new run is
 * started from the dashboard (scheduled tasks "Lokali · … start").
 *
 * If the table is missing or the database is unreachable the helpers return null: the agent then
 * runs under its own config, exactly as before this file existed. Agents never write desired_state.
 */
import { db } from "./content-factory/db";

export type AgentSystem = "factory" | "qa" | "seo";
export interface Control {
  desired_state: "run" | "pause";
  max_weekly_pct: number;
}

export async function heartbeat(system: AgentSystem, note?: string): Promise<Control | null> {
  try {
    const rows = await db.rpc<Control[]>("agent_heartbeat", { p_system: system, p_note: note ?? null });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

/** The agent that speaks for a system when no sub-agent is named. Names match the dashboard's team cards. */
export const LEAD: Record<AgentSystem, string> = { factory: "run.ts", qa: "orchestrator", seo: "seo-agent" };

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);

/** Appends one row to the live feed. Never throws: the dashboard is not allowed to break the work. */
async function logActivity(system: AgentSystem, agent: string, what: string, unit?: string): Promise<void> {
  try {
    await db.insert("agent_control_log", [{ system, field: "activity", old: unit ? oneLine(unit).slice(0, 160) : null, new: oneLine(what), by: oneLine(agent).slice(0, 60) }]);
  } catch {
    /* table missing or no access: nothing to show, nothing to do */
  }
}

/**
 * A sub-agent or a pipeline stage says what it has just started. Updates the system's heartbeat
 * (so the dashboard shows it as working) and appends to the live feed. Fire-and-forget is fine:
 * `void report(...)`. `unit` is the ONE place / guide / page being worked on ("Hagia Sophia, Istanbul");
 * `what` is the step on it ("checking facts"). The dashboard draws the unit's steps from these rows,
 * so always pass the same `unit` text for every step of one unit.
 */
export async function report(system: AgentSystem, agent: string, what: string, unit?: string): Promise<Control | null> {
  const line = oneLine(what);
  const note = unit ? `[${agent}] ${oneLine(unit)} — ${line}` : `[${agent}] ${line}`;
  const [c] = await Promise.all([heartbeat(system, note.slice(0, 300)), logActivity(system, agent, line, unit)]);
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Returns the command once it is "run"; while it is "pause", polls every pollMs. Gives up at `deadline` (epoch ms). */
export async function waitWhilePaused(
  system: AgentSystem,
  opts: { note?: string; deadline?: number; pollMs?: number; log?: (s: string) => void } = {},
): Promise<Control | "deadline" | null> {
  const { note, deadline = Infinity, pollMs = 300_000, log = console.log } = opts;
  for (;;) {
    const c = await heartbeat(system, note);
    if (!c || c.desired_state !== "pause") return c;
    if (Date.now() + pollMs > deadline) return "deadline";
    log(`  paused    from the dashboard (${system}) — checking again in ${Math.round(pollMs / 1000)}s`);
    await sleep(pollMs);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/agent-control.ts")) {
  const args = process.argv.slice(2);
  const system = args.shift();
  if (system !== "factory" && system !== "qa" && system !== "seo") {
    console.log('usage: npx tsx tools/agent-control.ts <factory|qa|seo> [--agent <name>] [--unit "<place, city>"] ["what you are doing"]');
    process.exit(2);
  }
  const take = (flag: string): string | null => { const k = args.indexOf(flag); return k >= 0 ? (args.splice(k, 2)[1] ?? null) : null; };
  const agent = take("--agent");
  const unit = take("--unit") ?? undefined;
  const note = args.join(" ").trim();
  if (agent) {
    // A sub-agent's report: never a check, so never a failing exit code.
    const c = await report(system, agent, note || "started", unit);
    console.log(JSON.stringify({ reported: true, agent, desired_state: c?.desired_state ?? null }));
    process.exit(0);
  }
  const c = await heartbeat(system, note || undefined);
  if (note) await logActivity(system, LEAD[system], note, unit);
  console.log(JSON.stringify(c ?? { desired_state: "run", max_weekly_pct: null, note: "no control table or no database access — run under your own config" }));
  process.exit(c?.desired_state === "pause" ? 3 : 0);
}
