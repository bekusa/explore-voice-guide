/**
 * Coordinate resolution for /api/attractions.
 *
 * Claude is no longer asked for lat/lng at all — it hallucinated them
 * confidently (Bora Bora at +151 instead of −151, Rome at lng 2.32).
 * Coordinates now come from exactly two trusted sources:
 *
 *   1. The `attraction_coords` Supabase table (6k+ validated rows) —
 *      one batched PostgREST `name_key=in.(...)` lookup.
 *   2. Nominatim, for the few names that miss, sequentially at 1 req/s
 *      per their usage policy, HARD CAPPED at 3 calls per request so
 *      we add at most ~3.5 s to a route that already runs ~45 s
 *      against Claude inside a ~100 s Worker budget.
 *
 * Nominatim hits are written back into `attraction_coords` with
 * confidence='single_source' so the next visitor reads them instantly.
 *
 * Anything still unresolved gets lat: null, lng: null. We never invent
 * or approximate — a list without pins is fine, a wrong pin is not.
 */

const MAX_NOMINATIM_CALLS = 3;
const NOMINATIM_GAP_MS = 1100;
const UA = "Lokali/1.0 (contact@lokali.travel)";

type Attraction = Record<string, unknown>;
type Coord = { lat: number; lng: number };

// Same env-var choice as sharedCache.server.ts: the SUPABASE_* pair is
// rewritten by Lovable on publish and points at the wrong project.
function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      "[resolveCoords] EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY missing — coordinates disabled",
    );
    return null;
  }
  return { url: url.replace(/\/+$/, ""), key };
}

function nameKey(name: unknown): string {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function finite(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** PostgREST `in.(...)` list member — quoted + URL-encoded. */
function encodeInValue(value: string): string {
  return encodeURIComponent(`"${value.replace(/"/g, '""')}"`);
}

async function lookupTable(keys: string[]): Promise<Map<string, Coord>> {
  const out = new Map<string, Coord>();
  const env = getSupabaseEnv();
  if (!env || keys.length === 0) return out;

  const list = keys.map(encodeInValue).join(",");
  const url = `${env.url}/rest/v1/attraction_coords?select=name_key,lat,lng&name_key=in.(${list})`;
  const res = await fetch(url, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  });
  if (!res.ok) {
    console.warn("[resolveCoords] table lookup failed", res.status);
    return out;
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  for (const row of Array.isArray(rows) ? rows : []) {
    const k = typeof row.name_key === "string" ? row.name_key : "";
    const lat = finite(row.lat);
    const lng = finite(row.lng);
    if (k && lat !== null && lng !== null) out.set(k, { lat, lng });
  }
  return out;
}

async function saveCoord(key: string, coord: Coord): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) return;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/attraction_coords?on_conflict=name_key`,
      {
        method: "POST",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          name_key: key,
          lat: coord.lat,
          lng: coord.lng,
          confidence: "single_source",
        }),
      },
    );
    if (!res.ok) console.warn("[resolveCoords] write-back failed", res.status);
  } catch (err) {
    console.warn("[resolveCoords] write-back error", err);
  }
}

async function geocode(name: string, city: string): Promise<Coord | null> {
  const q = encodeURIComponent(city ? `${name}, ${city}` : name);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = finite(data[0]?.lat);
  const lng = finite(data[0]?.lon);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fill lat/lng on every attraction from trusted sources only.
 * Never throws: on any failure the attractions come back with null
 * coordinates.
 */
export async function resolveCoords(
  attractions: Attraction[],
  city: string,
): Promise<Attraction[]> {
  const rows = Array.isArray(attractions) ? attractions : [];
  try {
    const keys = Array.from(
      new Set(rows.map((a) => nameKey(a.name)).filter((k) => k.length > 0)),
    );

    let found = new Map<string, Coord>();
    try {
      found = await lookupTable(keys);
    } catch (err) {
      console.warn("[resolveCoords] table lookup error", err);
    }

    // Misses → Nominatim, sequential, 1 req/s, hard-capped.
    const misses = keys.filter((k) => !found.has(k));
    let calls = 0;
    for (const key of misses) {
      if (calls >= MAX_NOMINATIM_CALLS) break;
      const original = rows.find((a) => nameKey(a.name) === key);
      const name = typeof original?.name === "string" ? original.name : key;
      if (calls > 0) await sleep(NOMINATIM_GAP_MS);
      calls += 1;
      try {
        const hit = await geocode(name, city);
        if (hit) {
          found.set(key, hit);
          await saveCoord(key, hit);
        }
      } catch (err) {
        console.warn("[resolveCoords] nominatim error", err);
      }
    }

    return rows.map((a) => {
      const hit = found.get(nameKey(a.name));
      return hit
        ? { ...a, lat: hit.lat, lng: hit.lng }
        : { ...a, lat: null, lng: null };
    });
  } catch (err) {
    console.warn("[resolveCoords] failed", err);
    return rows.map((a) => ({ ...a, lat: null, lng: null }));
  }
}
