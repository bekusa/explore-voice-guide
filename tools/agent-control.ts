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
  const [system, ...note] = process.argv.slice(2);
  if (system !== "factory" && system !== "qa" && system !== "seo") {
    console.log("usage: npx tsx tools/agent-control.ts <factory|qa|seo> [note]");
    process.exit(2);
  }
  const c = await heartbeat(system, note.join(" ") || undefined);
  console.log(JSON.stringify(c ?? { desired_state: "run", max_weekly_pct: null, note: "no control table or no database access — run under your own config" }));
  process.exit(c?.desired_state === "pause" ? 3 : 0);
}
