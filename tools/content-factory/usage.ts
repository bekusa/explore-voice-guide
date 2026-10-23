/**
 * Prints the plan's usage windows (5-hour and weekly) with one tiny Haiku call.
 *
 *   npx tsx tools/content-factory/usage.ts
 *
 * Use it before and during a run to see whether the factory's calls are
 * counted against the Max plan (utilization climbs with the run's spend) or
 * paid by the cloud-session credit (utilization stays flat).
 */
import { runClaude } from "./transport";

const r = await runClaude({ system: "Reply with OK.", user: "OK", model: "claude-haiku-4-5", maxBudgetUsd: 0.05, timeoutMs: 90_000 });
const L = r.limits;
const pct = (x?: number) => (x == null ? "?" : `${Math.round(x * 100)}%`);
const at = (t?: number) => (t ? new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "?");
if (!L) {
  console.log(`no usage info returned (call ok=${r.ok}${r.error ? `, error: ${r.error}` : ""})`);
} else {
  console.log(
    `${new Date().toISOString().slice(0, 19)}Z · 5h ${pct(L.fiveHour?.utilization)} (resets ${at(L.fiveHour?.resetsAt)})` +
      ` · 7d ${pct(L.sevenDay?.utilization)} (resets ${at(L.sevenDay?.resetsAt)})` +
      ` · status ${L.status} · overage ${L.overageStatus}${L.isUsingOverage ? " (IN USE)" : ""}`,
  );
}
