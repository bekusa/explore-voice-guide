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
 * ONE Google call on a cold miss, zero on a hit. Results are cached
 * globally for 30 days, and MISSES are cached too — plenty of the
 * attractions Claude names ("the old Soviet mosaic on Pekini Avenue")
 * simply aren't Google Places entries, and without a negative cache
 * each of those would re-pay a search call on every single pageview.
 *
 * Places is the expensive part of the Google bill (Text Search is the
 * priciest SKU on the platform), so the caching here is not a nicety —
 * it is the difference between paying once per place ever and paying
 * once per visitor.
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

/* ─── Places API (NEW) ─────────────────────────────────────────────
 *
 * This endpoint deliberately uses `places.googleapis.com/v1` and NOT
 * the older `maps.googleapis.com/maps/api/place/*` endpoints.
 *
 * Beka is moving the Google API services to a different Google
 * account, which means a NEW Cloud project — and Google froze the
 * legacy Places API on 2025-03-01: **legacy Places cannot be enabled
 * on a new Cloud project at all**. Existing projects keep working,
 * new ones get "REQUEST_DENIED / API not enabled" forever. Writing
 * this against the legacy API would therefore have produced a feature
 * that works today and dies the moment the key is swapped, with a
 * failure mode that looks like a bad key rather than a dead API.
 *
 * The New API also happens to be nicer here: one Text Search returns
 * the place id, and `skipHttpRedirect` lets us read a photo URL as
 * JSON instead of parsing a 302 Location header.
 */

/** Places API (New) returns hours as {day, hour, minute} objects. */
type NewApiPeriod = {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
};
type NewApiHours = {
  periods?: NewApiPeriod[];
  weekdayDescriptions?: string[];
};
type NewApiPlace = {
  id?: string;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
  location?: { latitude?: number; longitude?: number };
  regularOpeningHours?: NewApiHours;
  currentOpeningHours?: NewApiHours;
};

/**
 * Convert the New API's {day, hour, minute} to the {day, time:"HHMM"}
 * shape we store and the client renders.
 *
 * Done at the API boundary on purpose: the cache rows, the client
 * type, and PracticalInfo.tsx all keep the one schedule format, so a
 * future provider swap touches only this function. Rows written by an
 * earlier version stay readable.
 */
function toStoredPeriods(periods: NewApiPeriod[] | undefined): OpeningPeriod[] | null {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const out: OpeningPeriod[] = [];
  for (const p of periods) {
    const od = p.open?.day;
    if (typeof od !== "number") continue;
    const open = {
      day: od,
      time: `${pad(p.open?.hour ?? 0)}${pad(p.open?.minute ?? 0)}`,
    };
    // A missing `close` is meaningful — it marks an open-ended /
    // 24-hour period — so it must stay absent rather than default.
    if (typeof p.close?.day === "number") {
      out.push({
        open,
        close: {
          day: p.close.day,
          time: `${pad(p.close.hour ?? 0)}${pad(p.close.minute ?? 0)}`,
        },
      });
    } else {
      out.push({ open });
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * One Text Search call that returns the place AND all the practical
 * fields in a single round trip.
 *
 * The legacy implementation needed two calls (Find Place → Details).
 * The New API's field mask lets us ask for the detail fields directly
 * on the search response, which halves both the latency and the
 * per-lookup cost on a cache miss.
 *
 * The city qualifier and the coordinate bias both matter: "Old Town"
 * and "Botanical Garden" exist in a hundred cities, and unbiased
 * Google happily returns the wrong continent's version — the same
 * class of bug that put Metekhi Church in Batumi.
 */
async function lookupPlace(
  name: string,
  city: string,
  lat: number | null,
  lng: number | null,
): Promise<PlaceDetails | null> {
  // Billed per field mask, so this list is exactly what we render —
  // nothing speculative.
  const fieldMask = [
    "places.id",
    "places.formattedAddress",
    "places.internationalPhoneNumber",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.googleMapsUri",
    "places.businessStatus",
    "places.utcOffsetMinutes",
    "places.location",
    "places.regularOpeningHours",
    "places.currentOpeningHours",
  ].join(",");

  const body: Record<string, unknown> = {
    textQuery: city ? `${name}, ${city}` : name,
    maxResultCount: 1,
    // English keeps the match stable across our 45 UI languages; the
    // fields we keep are language-neutral anyway (see file header).
    languageCode: "en",
  };
  if (lat !== null && lng !== null) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 20000 },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Header auth, not ?key= — the New API's convention, and it
      // keeps the key out of any URL that might get logged.
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // 403 here almost always means "Places API (New) is not enabled on
    // this Cloud project" rather than a bad key — worth spelling out,
    // because that is the exact failure the account move can cause.
    const detail = await res.text().catch(() => "");
    console.warn("[api.place-details] searchText HTTP", res.status, detail.slice(0, 200));
    return null;
  }

  const json = (await res.json()) as { places?: NewApiPlace[] };
  const p = json.places?.[0];
  if (!p) return null; // genuine no-match — caller negative-caches it

  // Prefer currentOpeningHours (reflects holiday overrides) and fall
  // back to the regular schedule.
  const hours = p.currentOpeningHours ?? p.regularOpeningHours;

  return {
    placeId: p.id ?? null,
    address: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    periods: toStoredPeriods(hours?.periods),
    weekdayText: hours?.weekdayDescriptions ?? null,
    businessStatus: p.businessStatus ?? null,
    utcOffsetMinutes: typeof p.utcOffsetMinutes === "number" ? p.utcOffsetMinutes : null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
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

        // 3. Cold path: ONE Google call (Text Search with a field mask
        //    that already carries the detail fields).
        let details: PlaceDetails | null = null;
        try {
          details = await lookupPlace(name, city, lat, lng);
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
