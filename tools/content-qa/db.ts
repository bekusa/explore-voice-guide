/**
 * Database access for the QA agent = the factory's PostgREST client, plus a
 * few helpers. Same auth (network secret or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY),
 * same dry-run switch (CF_DRY_RUN=1 → no writes anywhere).
 */
export { db, DRY_RUN, inList } from "../content-factory/db";
import { db, DRY_RUN } from "../content-factory/db";
import { createHash } from "node:crypto";

export const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** Same md5 as Postgres `md5(payload::text)`: jsonb text form, so re-serialise with sorted keys
 *  is NOT equivalent. Always compute from the row text PostgREST returns (payload as string). */
export const payloadMd5 = (payload: unknown) => md5(typeof payload === "string" ? payload : JSON.stringify(payload));

/** PostgREST returns at most 1,000 rows per request; page through. */
export async function selectAll<T = Record<string, unknown>>(table: string, query: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = await db.select<T>(table, `${query}&limit=${pageSize}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** Delete rows matching a PostgREST filter. Refuses to run without a filter. */
export async function deleteWhere(table: string, filter: string): Promise<void> {
  if (!filter || filter.length < 5) throw new Error(`refusing to delete from ${table} without a filter`);
  if (DRY_RUN) return;
  const URL_BASE = (process.env.EXTERNAL_SUPABASE_URL ?? "https://dwyajguhgyjbgkpzjaln.supabase.co").replace(/\/+$/, "");
  const KEY = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ?? "proxy";
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`supabase DELETE ${table} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Snapshot a table before the first write of a wave (idempotent per day). Runs server-side via RPC
 *  qa_backup_table(), created by the migration. */
export async function backupTable(table: string, tag: string): Promise<string> {
  const name = `${table}_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${tag}`;
  if (!DRY_RUN) await db.rpc("qa_backup_table", { p_source: table, p_target: name });
  return name;
}
