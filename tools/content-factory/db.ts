/**
 * Minimal PostgREST client for the factory.
 *
 * Auth, two supported setups:
 *  1. Network secret (recommended): the cloud environment's agent proxy
 *     attaches the service-role key to requests for the Supabase host,
 *     so the key never enters the session. Set
 *     EXTERNAL_SUPABASE_SERVICE_ROLE_KEY=proxy (any placeholder) so the
 *     app modules that insist on the variable (resolveCoords) still run.
 *  2. Environment variable: EXTERNAL_SUPABASE_SERVICE_ROLE_KEY holds the
 *     real key.
 * Either way we send the headers; with a network secret the proxy
 * replaces their value.
 */
const URL_BASE = (process.env.EXTERNAL_SUPABASE_URL ?? "https://dwyajguhgyjbgkpzjaln.supabase.co").replace(/\/+$/, "");
const KEY = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ?? "proxy";
export const DRY_RUN = process.env.CF_DRY_RUN === "1";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra };
}

async function req<T>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: headers(extra),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${method} ${path.split("?")[0]} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  select<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
    return req<T[]>("GET", `${table}?${query}`);
  },
  /** Insert or merge on the given conflict columns. No-op in dry-run. */
  async upsert(table: string, rows: unknown[], onConflict: string, returning = false): Promise<unknown[] | null> {
    if (DRY_RUN || rows.length === 0) return null;
    return req("POST", `${table}?on_conflict=${encodeURIComponent(onConflict)}`, rows, {
      Prefer: `resolution=merge-duplicates,return=${returning ? "representation" : "minimal"}`,
    });
  },
  /** Insert, skipping rows that already exist (never overwrites). */
  async insertIgnore(table: string, rows: unknown[], onConflict: string): Promise<void> {
    if (DRY_RUN || rows.length === 0) return;
    await req("POST", `${table}?on_conflict=${encodeURIComponent(onConflict)}`, rows, {
      Prefer: "resolution=ignore-duplicates,return=minimal",
    });
  },
  async insert<T = Record<string, unknown>>(table: string, rows: unknown[]): Promise<T[]> {
    if (DRY_RUN) return [];
    return req<T[]>("POST", table, rows, { Prefer: "return=representation" });
  },
  async update(table: string, filter: string, patch: Record<string, unknown>): Promise<void> {
    if (DRY_RUN) return;
    await req("PATCH", `${table}?${filter}`, patch, { Prefer: "return=minimal" });
  },
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    return req<T>("POST", `rpc/${fn}`, args);
  },
};

export const inList = (values: string[]) =>
  `in.(${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).map(encodeURIComponent).join(",")})`;
