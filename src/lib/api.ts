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
  // Lazy import — keeps SSR clean (guideCache touches localStorage)
  const { getCachedGuide, setCachedGuide } = await import("./guideCache");

  // 1. Cache hit → instant offline-friendly result
  const cached = getCachedGuide(attraction, language);
  if (cached) return cached;

  // 2. Network — and persist for next time
  const data = await postJSON<GuideResponse | { script?: string }>(
    GUIDE_URL,
    { attraction, language },
  );
  const script = data.script ?? "";
  if (script) setCachedGuide(attraction, language, script);
  return script;
}

/** Network-only variant: bypass cache + always refresh. Used by the bulk download. */
export async function fetchGuideFresh(
  attraction: string,
  language = "ka",
): Promise<string> {
  const { setCachedGuide } = await import("./guideCache");
  const data = await postJSON<GuideResponse | { script?: string }>(
    GUIDE_URL,
    { attraction, language },
  );
  const script = data.script ?? "";
  if (script) setCachedGuide(attraction, language, script);
  return script;
}

/**
 * Photo lookup — calls our `/api/photo` server route, which proxies to
 * Google Places HTTP API (with Wikipedia fallback) and caches results.
 *
 * Why server-side: Lovable's CSP blocks `eval`, which broke the Google
 * Maps JS SDK (PlacesService.findPlaceFromQuery silently returned nothing).
 * The server route avoids the SDK entirely — also faster (no script load)
 * and lets us add Wikipedia as a fallback when Google has no match.
 *
 * Cache here is per-tab; the server has its own in-memory cache, and the
 * response carries Cache-Control: max-age=86400 for browser caching too.
 */
const photoCache = new Map<string, string | null>();

export async function fetchPlacePhoto(
  name: string,
  language = "ka",
  // Optional city/region context — helps Google disambiguate generic
  // names. E.g. searching "ბოტანიკური ბაღი" alone returns nothing, but
  // "ბოტანიკური ბაღი + Batumi" finds Batumi Botanical Garden.
  city: string | null = null,
): Promise<string | null> {
  const cleaned = name.trim();
  if (!cleaned) return null;

  const cleanCity = city?.trim() || "";
  const cacheKey = `${language}:${cleanCity}:${cleaned}`;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey) ?? null;

  try {
    const cityParam = cleanCity
      ? `&city=${encodeURIComponent(cleanCity)}`
      : "";
    const res = await fetch(
      `/api/photo?q=${encodeURIComponent(cleaned)}&lang=${encodeURIComponent(language)}${cityParam}`,
    );
    if (!res.ok) {
      photoCache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as { url: string | null };
    photoCache.set(cacheKey, data.url);
    return data.url;
  } catch {
    photoCache.set(cacheKey, null);
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
