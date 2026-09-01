/**
 * GET /api/place-details?name=...&city=...&lat=...&lng=...
 *
 * Practical visit info for one attraction: opening hours, website,
 * phone, address. Beka 2026-09-01.
 *
 * ── The one rule this endpoint exists to obey ─────────────────────
 * "არ გინდა დაგენერირების დაწყება, ეხლა რომ გამოიძახებ ახლიდან მარტო
 *  ეგ დატა მიამატოს ... ცალკე ჩავწეროთ რომ არსებული ინფო არ დაზიანდეს"
 *
 * This route NEVER touches cached_guides or cached_attractions, never
 * calls Claude, and never triggers generation. It reads and writes
 * exactly one table — cached_place_details — which did not exist
 * before this feature. Every guide already in the cache stays byte-for
 * byte as it was; nothing needs regenerating.
 *
 * ── Why Google and not the model ──────────────────────────────────
 * Opening hours are live facts. An LLM asked for them will produce
 * confident, plausible, wrong ones — and unlike a shaky historical
 * detail, a wrong opening time sends a user to a locked door. So the
 * data comes from Google Places, or it is omitted.
 *
 * ── Cost control ──────────────────────────────────────────────────
 * Two Google calls on a cold miss (Find Place → Details), zero on a
 * hit. Results are cached globally for 30 days, and MISSES are cached
 * too — plenty of the attractions Claude names ("the old Soviet mosaic
 * on Pekini Avenue") simply aren't Google Places entries, and without
 * a negative cache each of those would re-pay a Find Place call on
 * every single pageview.
 *
 * ── Language ──────────────────────────────────────────────────────
 * The response is language-NEUTRAL by design: structured `periods`
 * (day 0-6 + "HHMM"), not prose. The client renders weekday names and
 * times through the app's own i18n and Intl, so all 45 languages are
 * served from ONE cached row. Asking Google per-locale would multiply
 * both rows and quota by 45 for strings we can format ourselves.
 *
 * Client wrapper: `fetchPlaceDetails` in src/lib/api.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import {
  getCachedPlaceDetails,
  putCachedPlaceDetails,
  type OpeningPeriod,
  type PlaceDetails,
} from "@/lib/sharedCache.server";

/**
 * Same env var /api/photo uses — one Google Cloud key, one place to
 * rotate when Beka moves the API services to another Google account.
 * No literal fallback: a committed `AIzaSy…` key is exactly what the
 * pre-Capacitor security review flagged.
 */
const GOOGLE_KEY =
  typeof process !== "undefined" ? (process.env?.GOOGLE_PLACES_KEY ?? "") : "";

/**
 * How long a cached row stays fresh. 30 days is the compromise:
 * seasonal hour changes (most museums switch on 1 April / 1 November)
 * are picked up within a month, while a popular attraction costs ~12
 * Google calls a year instead of one per visitor.
 */
const PLACE_DETAILS_TTL_DAYS = 30;
const TTL_MS = PLACE_DETAILS_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Guard against a pathological `name` being pasted into an outbound URL. */
const MAX_INPUT = 160;

function clean(raw: string | null, max = MAX_INPUT): string {
  return (raw ?? "").trim().slice(0, max);
}

/** Finite, in-range coordinate or null — never forward junk to Google. */
function coord(raw: string | null, limit: number): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

type GoogleCandidate = { place_id?: string };
type GoogleDetailsResult = {
  place_id?: string;
  formatted_address?: string;
  international_phone_number?: string;
  formatted_phone_number?: string;
  website?: string;
  url?: string;
  business_status?: string;
  utc_offset_minutes?: number;
  geometry?: { location?: { lat?: number; lng?: number } };
  opening_hours?: {
    periods?: OpeningPeriod[];
    weekday_text?: string[];
  };
  /** Google's newer field name; same shape, used when hours differ by service. */
  current_opening_hours?: {
    periods?: OpeningPeriod[];
    weekday_text?: string[];
  };
};

/**
 * Step 1 — resolve a free-text name to a Google place_id.
 *
 * The city qualifier and the coordinate bias both matter: "Old Town"
 * or "Botanical Garden" exist in a hundred cities, and without a
 * locationbias Google happily returns the wrong continent's version.
 * This is the same class of bug that produced Batumi's Metekhi Church
 * in the attractions list.
 */
async function findPlaceId(
  name: string,
  city: string,
  lat: number | null,
  lng: number | null,
): Promise<string | null> {
  const input = city ? `${name}, ${city}` : name;
  const bias =
    lat !== null && lng !== null
      ? `&locationbias=${encodeURIComponent(`circle:20000@${lat},${lng}`)}`
      : "";
  const url =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}` +
    `&inputtype=textquery&fields=place_id${bias}` +
    `&key=${encodeURIComponent(GOOGLE_KEY)}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[api.place-details] findplace HTTP", res.status);
    return null;
  }
  const json = (await res.json()) as {
    status?: string;
    candidates?: GoogleCandidate[];
  };
  if (json.status !== "OK") {
    // ZERO_RESULTS is normal and expected — see the negative-cache note
    // in the file header. Anything else (OVER_QUERY_LIMIT,
    // REQUEST_DENIED) is a configuration problem worth seeing in logs.
    if (json.status !== "ZERO_RESULTS") {
      console.warn("[api.place-details] findplace status", json.status);
    }
    return null;
  }
  return json.candidates?.[0]?.place_id ?? null;
}

/** Step 2 — pull the practical fields for a resolved place_id. */
async function fetchDetails(placeId: string): Promise<PlaceDetails | null> {
  // Explicit field list — Google bills per field group, so asking for
  // everything would cost several times more per call for data we
  // don't render.
  const fields = [
    "place_id",
    "formatted_address",
    "international_phone_number",
    "formatted_phone_number",
    "website",
    "url",
    "business_status",
    "utc_offset",
    "geometry/location",
    "opening_hours",
    "current_opening_hours",
  ].join(",");

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&key=${encodeURIComponent(GOOGLE_KEY)}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[api.place-details] details HTTP", res.status);
    return null;
  }
  const json = (await res.json()) as {
    status?: string;
    result?: GoogleDetailsResult;
  };
  if (json.status !== "OK" || !json.result) {
    console.warn("[api.place-details] details status", json.status);
    return null;
  }

  const r = json.result;
  // Prefer current_opening_hours (reflects holiday overrides) and fall
  // back to the regular schedule.
  const hours = r.current_opening_hours ?? r.opening_hours;

  return {
    placeId: r.place_id ?? placeId,
    address: r.formatted_address ?? null,
    phone: r.international_phone_number ?? r.formatted_phone_number ?? null,
    website: r.website ?? null,
    mapsUrl: r.url ?? null,
    periods: hours?.periods ?? null,
    weekdayText: hours?.weekday_text ?? null,
    businessStatus: r.business_status ?? null,
    utcOffsetMinutes: r.utc_offset_minutes ?? null,
    lat: r.geometry?.location?.lat ?? null,
    lng: r.geometry?.location?.lng ?? null,
    notFound: false,
  };
}

export const Route = createFileRoute("/api/place-details")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const name = clean(url.searchParams.get("name"));
        const city = clean(url.searchParams.get("city"), 80);
        const lat = coord(url.searchParams.get("lat"), 90);
        const lng = coord(url.searchParams.get("lng"), 180);

        if (!name) return corsJson({ error: "name required" }, { status: 400 });

        const key = { name, city };

        // 1. Cache first — always, and including negative rows.
        const hit = await getCachedPlaceDetails(key, TTL_MS);
        if (hit) {
          return corsJson(hit.notFound ? { notFound: true } : hit, {
            // Let the CDN and the WebView hold it for a day. The row
            // itself lives 30 days; a 24h edge cache just keeps repeat
            // views off Supabase entirely.
            headers: { "Cache-Control": "public, max-age=86400" },
          });
        }

        // 2. No key configured → behave exactly as before this endpoint
        //    existed. The attraction page treats an empty response as
        //    "no practical info" and renders nothing; it must never
        //    surface an error to the user over an optional block.
        if (!GOOGLE_KEY) {
          console.warn("[api.place-details] GOOGLE_PLACES_KEY missing");
          return corsJson({ notFound: true });
        }

        // 3. Cold path: two Google calls.
        let details: PlaceDetails | null = null;
        try {
          const placeId = await findPlaceId(name, city, lat, lng);
          if (placeId) details = await fetchDetails(placeId);
        } catch (err) {
          console.warn("[api.place-details] lookup threw", err);
          // Transient network/quota failure — do NOT write a notFound
          // row for it, or a 30-second Google outage would blank this
          // block for 30 days. Just return empty and retry next time.
          return corsJson({ notFound: true });
        }

        const payload: PlaceDetails = details ?? { notFound: true };

        // 4. Cache write — AWAITED. Cloudflare Workers kill floating
        //    promises the instant the Response is returned; the
        //    classification cache sat at 0 rows for weeks because of
        //    exactly this. One small upsert next to two Google
        //    round-trips the caller already paid is imperceptible.
        try {
          await putCachedPlaceDetails(key, payload);
        } catch (err) {
          console.warn("[api.place-details] cache write failed", err);
        }

        return corsJson(payload);
      },
    },
  },
});
