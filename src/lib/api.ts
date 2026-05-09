/**
 * n8n webhook client for attractions + narrated guides.
 */

export type Attraction = {
  /**
   * Display name. May be in the user's language (e.g. "ძველი თბილისი")
   * for non-English locales — translatePayload.server.ts now translates
   * this field along with the description prose so result cards read
   * natively in the user's selected language.
   */
  name: string;
  /**
   * The original English name, preserved during translation. Use this
   * for any technical handle that needs to stay stable across locales:
   * UNESCO catalogue matching, Wikipedia/Google Places photo lookups,
   * shareable slugs across users in different languages. Only set on
   * payloads that came through translateAttractionsPayload — English
   * baseline rows just have `name`.
   */
  name_en?: string;
  description?: string;
  /** New n8n workflow shape: short factual outside-view description. */
  outside_desc?: string;
  /** New n8n workflow shape: longer "what a local would tell you" view. */
  insider_desc?: string;
  /** New n8n workflow shape: e.g. "პარკი / სანაპირო", "მუზეუმი". */
  type?: string;
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

/**
 * Full guide payload (Lokali shape). The n8n /guide workflow returns
 * `script` plus a few optional rich fields that the attraction page
 * renders as chips/lists. Only `script` is guaranteed; UI must
 * tolerate any subset of the others being missing.
 */
export type GuideData = {
  title?: string;
  script: string;
  estimated_duration_seconds?: number;
  key_facts?: string[];
  tips?: string[];
  look_for?: string[];
  nearby_suggestions?: string[];
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
 * Repair JSON that has unescaped control characters inside string
 * literals — Claude / GPT regularly emit content like:
 *   "outside_desc": "ძველი სამყაროს ერთ-ერთი
 *   შვიდი საოცრება..."
 * with a real newline inside the quotes. Strict JSON.parse rejects
 * that; this walker re-escapes the offending bytes only when we're
 * inside a string and not already inside an escape sequence.
 */
function repairJsonStrings(text: string): string {
  let inStr = false;
  let escape = false;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        out += c;
        escape = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inStr = false;
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        continue;
      }
      if (c === "\r") {
        out += "\\r";
        continue;
      }
      if (c === "\t") {
        out += "\\t";
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  return out;
}

/**
 * Tolerant JSON parser — n8n/Claude often wrap JSON in ```json ... ``` fences,
 * the Anthropic message envelope, or prepend/append stray text. Strip noise
 * progressively until something parses.
 */
function tolerantParse<T>(text: string): T {
  const trimmed = text.trim();

  // 0. Empty body — n8n workflow returned nothing (timeout, silent
  // failure, unfamiliar query). Throw a clear, distinct error so the
  // upstream caller can surface friendly UX ("No results for X")
  // instead of the generic "Could not parse" preview.
  if (trimmed.length === 0) {
    throw new Error("Empty response from upstream — workflow may have timed out");
  }

  // 1. Try direct parse, then unwrap any LLM envelope.
  try {
    const parsed = JSON.parse(trimmed);
    return unwrapEnvelope(parsed) as T;
  } catch {
    // fall through
  }

  // 1.5. Re-try after repairing unescaped newlines/tabs inside strings.
  // Most "Could not parse response as JSON" failures we've seen on the
  // attractions endpoint were Claude emitting a multi-line description
  // with literal \n inside the string body — strict JSON.parse rejects
  // that, but it's trivial to repair.
  try {
    const parsed = JSON.parse(repairJsonStrings(trimmed));
    return unwrapEnvelope(parsed) as T;
  } catch {
    // fall through
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```).
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(repairJsonStrings(fenceMatch[1].trim()));
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
      try {
        const parsed = JSON.parse(repairJsonStrings(balanced));
        return unwrapEnvelope(parsed) as T;
      } catch {
        // fall through
      }
    }
  }

  // 4. Last resort: greedy regex for "attractions" key.
  const attrMatch = trimmed.match(/\{\s*"attractions"\s*:[\s\S]*?\]\s*\}/);
  if (attrMatch) {
    try {
      return JSON.parse(attrMatch[0]) as T;
    } catch {
      try {
        return JSON.parse(repairJsonStrings(attrMatch[0])) as T;
      } catch {
        // fall through
      }
    }
  }

  // Diagnostic — first 200 chars of what we got, so the user can copy it.
  const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
  throw new Error(
    `Could not parse response as JSON. Got: ${preview}${trimmed.length > 200 ? "…" : ""}`,
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

export type AttractionFilters = {
  /** User-selected interest tags, e.g. ["history", "couples"]. */
  interests?: string[];
  /**
   * Preferred audio-guide narration length: "short" | "medium" | "long".
   * NOTE: this is how long the spoken guide should run, not how long
   * the user will spend walking the route on the ground.
   */
  duration?: string;
};

export async function fetchAttractions(
  query: string,
  language = "ka",
  filters: AttractionFilters = {},
): Promise<Attraction[]> {
  // n8n workflow reads body.city / body.country (it triages LANDMARK / COUNTRY
  // / CITY mode based on the contents). Send both `query` (legacy) and
  // `city` / `country` so it works whichever shape the workflow expects.
  // Filters (`interests`, `duration`) are extra hints the n8n prompt can
  // use to bias the curated list — empty / undefined means "no preference".
  const interests = (filters.interests ?? []).filter(Boolean);
  const data = await postJSON<AttractionsResponse | Attraction[]>(ATTRACTIONS_URL, {
    query,
    city: query,
    country: "",
    language,
    interests,
    duration: filters.duration ?? "",
  });
  // Tolerate both wrapped and bare-array shapes
  if (Array.isArray(data)) return data;
  return data.attractions ?? [];
}

/**
 * Background-prefetch additional attractions (pages 2-3) for a query
 * already shown on /results. The server hits n8n with `exclude` (the
 * names already on screen) and `count` (how many more to find), then
 * merges the new items into the Supabase cache rows so the next
 * visitor reads the full ≤30-item set in one cache hit. Returns ONLY
 * the new attractions — the caller already has the first page in
 * state and can append locally.
 *
 * Called immediately after the first page paints in /results.tsx, so
 * by the time the user taps "Next" pages 2-3 are usually already
 * warm. Failure is silent: a rejected promise just means the user
 * keeps the first page they had.
 */
export async function fetchMoreAttractions(
  query: string,
  language: string,
  excludeNames: string[],
  count: number,
  filters: AttractionFilters = {},
): Promise<Attraction[]> {
  if (excludeNames.length === 0 || count <= 0) return [];
  const interests = (filters.interests ?? []).filter(Boolean);
  const data = await postJSON<AttractionsResponse | Attraction[]>(ATTRACTIONS_URL, {
    query,
    city: query,
    country: "",
    language,
    interests,
    duration: filters.duration ?? "",
    exclude: excludeNames,
    count,
  });
  if (Array.isArray(data)) return data;
  return data.attractions ?? [];
}

/**
 * Coerce a raw n8n response into a GuideData with safe defaults.
 * Tolerates: a bare string (uses it as script), a partial object
 * (fills in only what's present), or noise (returns empty script).
 */
function normalizeGuide(raw: unknown, fallbackTitle: string): GuideData {
  if (typeof raw === "string") return { title: fallbackTitle, script: raw };
  if (!raw || typeof raw !== "object") {
    return { title: fallbackTitle, script: "" };
  }
  const obj = raw as Record<string, unknown>;
  const asStringArray = (v: unknown): string[] | undefined =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined;
  return {
    title: typeof obj.title === "string" ? obj.title : fallbackTitle,
    script: typeof obj.script === "string" ? obj.script : "",
    estimated_duration_seconds:
      typeof obj.estimated_duration_seconds === "number"
        ? obj.estimated_duration_seconds
        : undefined,
    key_facts: asStringArray(obj.key_facts),
    tips: asStringArray(obj.tips),
    look_for: asStringArray(obj.look_for),
    nearby_suggestions: asStringArray(obj.nearby_suggestions),
  };
}

export async function fetchGuide(attraction: string, language = "ka"): Promise<string> {
  // Back-compat wrapper — the rest of the app expects just a string.
  // New rich callers should use fetchGuideData() instead. Reads the
  // global interest preference inside fetchGuideData().
  const data = await fetchGuideData(attraction, language);
  return data.script;
}

/**
 * Rich Lokali-shape fetch. Returns the full GuideData object
 * (script + optional key_facts/tips/look_for/nearby_suggestions).
 * Cache-first, then network. Persists the full object so chips
 * survive offline.
 *
 * The optional `interest` arg tilts the n8n /webhook/guide content
 * towards a topic (e.g. "photography" → more on framing/light, less
 * on dates). When omitted, falls back to the global interest
 * preference (which itself defaults to History). The interest is sent
 * to n8n in the payload AND mixed into the cache key so different
 * biases don't overwrite each other offline.
 */
export async function fetchGuideData(
  attraction: string,
  language = "ka",
  interest?: string,
): Promise<GuideData> {
  // Lazy import — keeps SSR clean (guideCache + prefs touch localStorage)
  const { getCachedGuideData, setCachedGuideData } = await import("./guideCache");
  const { getInterest } = await import("./interestPreference");
  const { normalizeInterest } = await import("./interests");
  const effectiveInterest = normalizeInterest(interest ?? getInterest());

  // 1. Cache hit → instant offline-friendly result
  const cached = getCachedGuideData(attraction, language, effectiveInterest);
  if (cached && cached.script) return cached;

  // 2. Network — and persist for next time
  const raw = await postJSON<unknown>(GUIDE_URL, {
    attraction,
    language,
    interest: effectiveInterest,
    // Send as array too for forward-compat if we ever ship multi-pick.
    interests: [effectiveInterest],
  });
  const data = normalizeGuide(raw, attraction);
  if (data.script) setCachedGuideData(attraction, language, data, effectiveInterest);
  return data;
}

/** Network-only variant: bypass cache + always refresh. Used by the bulk download. */
export async function fetchGuideFresh(
  attraction: string,
  language = "ka",
  interest?: string,
): Promise<string> {
  const { setCachedGuideData } = await import("./guideCache");
  const { getInterest } = await import("./interestPreference");
  const { normalizeInterest } = await import("./interests");
  const effectiveInterest = normalizeInterest(interest ?? getInterest());
  const raw = await postJSON<unknown>(GUIDE_URL, {
    attraction,
    language,
    interest: effectiveInterest,
    interests: [effectiveInterest],
  });
  const data = normalizeGuide(raw, attraction);
  if (data.script) setCachedGuideData(attraction, language, data, effectiveInterest);
  return data.script;
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
  // Scope hint forwarded to /api/photo. Pass "artwork" for museum
  // highlights — that path skips Google Places entirely (whose
  // region-biased results were returning Tbilisi banks for "Liberty
  // Leading the People") and goes straight to Wikipedia.
  scope: "artwork" | null = null,
): Promise<string | null> {
  const cleaned = name.trim();
  if (!cleaned) return null;

  const cleanCity = city?.trim() || "";
  const cacheKey = `${scope ?? ""}:${language}:${cleanCity}:${cleaned}`;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey) ?? null;

  try {
    const cityParam = cleanCity ? `&city=${encodeURIComponent(cleanCity)}` : "";
    const scopeParam = scope ? `&scope=${encodeURIComponent(scope)}` : "";
    const res = await fetch(
      `/api/photo?q=${encodeURIComponent(cleaned)}&lang=${encodeURIComponent(language)}${cityParam}${scopeParam}`,
    );
    if (!res.ok) {
      // Don't cache misses — server-side fixes (User-Agent, retry
      // strategy) shouldn't be hidden behind a stale null in browser
      // memory for the rest of the session. Beka caught this when
      // the highlights stayed empty after an api.photo.ts fix
      // because every photoCache entry was a sticky null.
      return null;
    }
    const data = (await res.json()) as { url: string | null };
    if (data.url) photoCache.set(cacheKey, data.url);
    return data.url;
  } catch {
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

/**
 * Detect the language of a search query / place name from its script,
 * so the n8n workflow returns results in the same language the user
 * typed. Without this, anonymous users (no Supabase profile) always
 * fell back to "ka" and got Georgian results even when searching
 * "Batumi" or "Paris" in English.
 *
 * Heuristic: pick the script of the majority of letter characters.
 * Falls back to the supplied default (usually the user's preferred
 * UI language) when the input is empty or all whitespace/punctuation.
 */
export function detectQueryLanguage(text: string, fallback = "en"): string {
  if (!text) return fallback;
  const counts: Record<string, number> = { ka: 0, ru: 0, ar: 0, zh: 0, ja: 0, ko: 0, latin: 0 };
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (!code) continue;
    if (code >= 0x10a0 && code <= 0x10ff) counts.ka++;
    else if (code >= 0x0400 && code <= 0x04ff) counts.ru++;
    else if (code >= 0x0600 && code <= 0x06ff) counts.ar++;
    else if (code >= 0x4e00 && code <= 0x9fff) counts.zh++;
    else if (code >= 0x3040 && code <= 0x30ff) counts.ja++;
    else if (code >= 0xac00 && code <= 0xd7af) counts.ko++;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) counts.latin++;
  }
  // Pick the script with the most hits. If the strongest signal is
  // Latin (or there's no signal at all), defer to the caller's
  // fallback — usually the user's preferred UI language. This keeps a
  // Georgian-speaking user on Georgian even when they tap an
  // English-named attraction like "Narikala Fortress".
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [top, topCount] = ranked[0];
  if (!topCount) return fallback;
  return top === "latin" ? fallback : top;
}

/* ─── Museum highlights ─── */

export type MuseumHighlight = {
  /** Display name in the user's language. */
  name: string;
  /** English source name preserved for technical handles. */
  name_en?: string;
  /** Short period or date label (e.g. "Renaissance", "Modern"). */
  era?: string;
  /** 1-sentence factual summary. */
  brief?: string;
  /** 2-4 sentence vivid story. */
  story?: string;
  /** Gallery / wing reference. */
  location_hint?: string;
};

export type MuseumHighlightsResponse = {
  highlights: MuseumHighlight[];
  error?: string;
};

const HIGHLIGHTS_URL = "/api/museum-highlights";

/**
 * Fetch the curated "must-see top 30" payload for one museum. Cached
 * server-side per (museum_id, language); first hit on a fresh
 * (museum, lang) tuple takes ~30-60 s (Sonnet generates rich
 * curator-voice copy), every subsequent visitor reads the cached
 * row in ~50-100 ms.
 *
 * `museumId` must be one of the ids in src/lib/topMuseums.ts.
 * Anything unknown returns an empty list rather than throwing.
 */
export async function fetchMuseumHighlights(
  museumId: string,
  language: string,
): Promise<MuseumHighlight[]> {
  const data = await postJSON<MuseumHighlightsResponse>(HIGHLIGHTS_URL, {
    museumId,
    language,
  });
  return Array.isArray(data?.highlights) ? data.highlights : [];
}
