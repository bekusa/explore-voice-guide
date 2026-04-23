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

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  const data = await res.json();
  return data as T;
}

export async function fetchAttractions(
  query: string,
  language = "ka",
): Promise<Attraction[]> {
  const data = await postJSON<AttractionsResponse | Attraction[]>(
    ATTRACTIONS_URL,
    { query, language },
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
 * Stable, URL-safe id derived from an attraction name.
 * Used to round-trip between /results and /attraction/$id without a backend.
 */
export function attractionSlug(name: string): string {
  return encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, "-"));
}

export function unslugAttraction(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ");
}
