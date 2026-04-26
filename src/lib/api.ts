/**
 * n8n webhook client for attractions + narrated guides.
 */

export type Attraction = {
  name: string;
  description?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  duration?: string;
  image_url?: string;
  category?: string;
  [key: string]: unknown;
};

export type AttractionsResponse = {
  attractions: Attraction[];
};

export type GuideResponse = {
  script: string;
};

// Same-origin proxy routes (avoid n8n CORS by relaying through our server).
const ATTRACTIONS_URL = "/api/attractions";
const GUIDE_URL = "/api/guide";

/**
 * Walk the string char-by-char and return the first balanced {...} or [...]
 * block, respecting JSON string escaping AND mixed-bracket nesting.
 */
function extractBalancedJson(text: string): string | null {
  const stack: string[] = [];
  let start = -1;
  let inStr = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inStr) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inStr = false;
      continue;
    }

    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{" || c === "[") {
      if (stack.length === 0) start = i;
      stack.push(c);
    } else if (c === "}" || c === "]") {
      const expectedOpen = c === "}" ? "{" : "[";
      if (stack.length > 0 && stack[stack.length - 1] === expectedOpen) {
        stack.pop();
        if (stack.length === 0 && start >= 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Unwrap common LLM envelope shapes: Anthropic Messages API returns
 * { content: [{ type: "text", text: "..." }] }. Some n8n workflows pass
 * this through verbatim; pull the text field out and recurse.
 */
function unwrapEnvelope(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const obj = parsed as Record<string, unknown>;

  // Anthropic Messages API shape
  if (Array.isArray(obj.content) && obj.content.length > 0) {
    const first = obj.content[0] as { type?: string; text?: string };
    if (first?.type === "text" && typeof first.text === "string") {
      try {
        return JSON.parse(first.text);
      } catch {
        const inner = extractBalancedJson(first.text);
        if (inner) {
          try {
            return JSON.parse(inner);
          } catch {
            // fall through
          }
        }
      }
    }
  }

  // n8n sometimes wraps as { json: {...} } or { data: {...} }
  if (obj.json && typeof obj.json === "object") return obj.json;
  if (obj.data && typeof obj.data === "object") return obj.data;

  return parsed;
}

/**
 * Tolerant JSON parser — n8n/Claude often wrap JSON in ```json ... ``` fences,
 * the Anthropic message envelope, or prepend/append stray text. Strip noise
 * progressively until something parses.
 */
function tolerantParse<T>(text: string): T {
  const trimmed = text.trim();

  // 1. Try direct parse, then unwrap any LLM envelope.
  try {
    const parsed = JSON.parse(trimmed);
    return unwrapEnvelope(parsed) as T;
  } catch {
    // fall through
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```).
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      return unwrapEnvelope(parsed) as T;
    } catch {
      // fall through
    }
  }

  // 3. Find a balanced JSON block anywhere in the text.
  const balanced = extractBalancedJson(trimmed);
  if (balanced) {
    try {
      const parsed = JSON.parse(balanced);
      return unwrapEnvelope(parsed) as T;
    } catch {
      // fall through
    }
  }

  // 4. Last resort: greedy regex for "attractions" key.
  const attrMatch = trimmed.match(/\{\s*"attractions"\s*:[\s\S]*?\]\s*\}/);
  if (attrMatch) {
    try {
      return JSON.parse(attrMatch[0]) as T;
    } catch {
      // fall through
    }
  }

  // Diagnostic — first 200 chars of what we got, so the user can copy it.
  const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
  throw new Error(
    `Could not parse response as JSON. Got: ${preview}${
      trimmed.length > 200 ? "…" : ""
    }`,
  );
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  const text = await res.text();
  return tolerantParse<T>(text);
}

export async function fetchAttractions(
  query: string,
  language = "ka",
): Promise<Attraction[]> {
  // n8n workflow reads body.city / body.country (it triages LANDMARK / COUNTRY
  // / CITY mode based on the contents). Send both `query` (legacy) and
  // `city` / `country` so it works whichever shape the workflow expects.
  const data = await postJSON<AttractionsResponse | Attraction[]>(
    ATTRACTIONS_URL,
    {
      query,
      city: query,
      country: "",
      language,
    },
  );
  // Tolerate both wrapped and bare-array shapes
  if (Array.isArray(data)) return data;
  return data.attractions ?? [];
}

export async function fetchGuide(
  attraction: string,
  language = "ka",
): Promise<string> {
  const data = await postJSON<GuideResponse | { script?: string }>(
    GUIDE_URL,
    { attraction, language },
  );
  return data.script ?? "";
}

/**
 * Google Places API — fast attraction photo lookup via Maps JS SDK.
 *
 * Uses `PlacesService.findPlaceFromQuery` (legacy, ~150-300ms typical).
 * Loads the Maps JS script lazily on first call, then reuses.
 * Results are cached per-name in-memory to avoid re-billing.
 *
 * Set VITE_GOOGLE_MAPS_API_KEY in .env (and on Lovable) to override the default.
 * The key MUST be referrer-restricted in Google Cloud Console to your domains.
 */
const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ??
  "AIzaSyD5j2rdYvTOfReGLsar9CfScLegbLipAmg";

// Loose typing — Google Maps SDK ships without bundled types and we don't
// want a heavy @types/google.maps dependency just for one API call.
type AnyGoogle = {
  maps: {
    places: {
      PlacesService: new (attrContainer: HTMLElement) => {
        findPlaceFromQuery: (
          req: { query: string; fields: string[] },
          callback: (
            results:
              | Array<{
                  photos?: Array<{
                    getUrl: (opts: { maxWidth: number; maxHeight: number }) => string;
                  }>;
                }>
              | null,
            status: string,
          ) => void,
        ) => void;
      };
      PlacesServiceStatus: { OK: string };
    };
  };
};

declare global {
  interface Window {
    google?: AnyGoogle;
  }
}

let googleMapsPromise: Promise<AnyGoogle> | null = null;

function loadGoogleMaps(): Promise<AnyGoogle> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps requires a browser"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps loaded but Places library missing"));
      }
    };
    script.onerror = () =>
      reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

const photoCache = new Map<string, string | null>();

export async function fetchPlacePhoto(
  name: string,
  // language is accepted for API parity but not used by Places JS SDK
  _language = "ka",
): Promise<string | null> {
  const cleaned = name.trim();
  if (!cleaned) return null;

  if (photoCache.has(cleaned)) return photoCache.get(cleaned) ?? null;

  try {
    const g = await loadGoogleMaps();
    const url = await new Promise<string | null>((resolve) => {
      const service = new g.maps.places.PlacesService(
        document.createElement("div"),
      );
      service.findPlaceFromQuery(
        { query: cleaned, fields: ["photos", "name"] },
        (results, status) => {
          if (
            status === g.maps.places.PlacesServiceStatus.OK &&
            results?.[0]?.photos?.[0]
          ) {
            resolve(
              results[0].photos[0].getUrl({ maxWidth: 400, maxHeight: 240 }),
            );
          } else {
            resolve(null);
          }
        },
      );
    });

    photoCache.set(cleaned, url);
    return url;
  } catch {
    photoCache.set(cleaned, null);
    return null;
  }
}

/**
 * Stable, URL-safe id derived from an attraction name.
 * Used to round-trip between /results and /attraction/$id without a backend.
 */
export function attractionSlug(name: string): string {
  return encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, "-"));
}

export function unslugAttraction(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ");
}
