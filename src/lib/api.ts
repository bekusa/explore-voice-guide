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
  // Canonical English form of the query, resolved server-side
  // ("თბილისი" -> "Tbilisi"). The results page mirrors it into the URL
  // so every language collapses to one shareable ?q= address.
  canonicalQuery?: string;
};

export type AttractionsResult = {
  attractions: Attraction[];
  canonicalQuery?: string;
};

export type GuideResponse = {
  script: string;
};

/**
 * Full guide payload (Lokali shape). The /api/guide endpoint returns
 * `script` plus a few optional rich fields that the attraction page
 * renders as chips/lists. Only `script` is guaranteed; UI must
 * tolerate any subset of the others being missing.
 *
 * Historical: `nearby_suggestions: string[]` used to live here as
 * well, but the section was retired (LLM-suggested neighbours were
 * uneven and felt redundant next to the on-page Map). Removed from
 * the prompt + types + cache so we stop paying tokens to generate
 * data we throw away.
 */
export type GuideData = {
  title?: string;
  script: string;
  estimated_duration_seconds?: number;
  key_facts?: string[];
  tips?: string[];
  look_for?: string[];
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

/**
 * Hard timeout for every postJSON call. Originally set to 30 s in
 * Phase 4, but that turned out to silently cut off the heaviest
 * endpoint — `/api/guide` calls Sonnet with maxTokens=8192 and a
 * structured response (script + key_facts + tips + look_for +
 * nearby_suggestions). Sonnet's non-streaming Messages API returns
 * the WHOLE payload at once, so for a full Lokali guide on a complex
 * attraction the call routinely runs 30-50 s. The 30-s ceiling
 * killed those mid-generation and the attraction page rendered
 * About + Story (cheap, from /api/attractions) but no guide chips,
 * tips, or stops — Beka caught it: "მხოლოდ About this place და
 * The Story მოაქვს მარტო."
 *
 * 90 s gives Sonnet comfortable margin for the worst case (~70 s
 * generation on a cold Cloudflare Worker) while still bounding
 * runaway requests. Anything past 90 s is genuinely gone — the
 * LoadingMessages cycle still has a hard stop, but it's far enough
 * out that legitimate Sonnet responses always land first.
 *
 * Why a constant rather than per-caller: every fetch helper in this
 * file (fetchAttractions, fetchGuideData, fetchMoreAttractions,
 * fetchPlacePhoto, fetchMuseumHighlights) routes through postJSON,
 * so one ceiling covers all of them. Caller can still race its own
 * AbortController on top if it needs an earlier bail.
 */
const REQUEST_TIMEOUT_MS = 120_000;

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  // Wire up an AbortController so the fetch actually stops on timeout
  // instead of leaving a dangling socket. Without this, a hung n8n
  // webhook would keep LoadingMessages cycling indefinitely; Beka
  // hit this on a flaky mobile network.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    const text = await res.text();
    return tolerantParse<T>(text);
  } catch (err) {
    // Translate the AbortError to a clearer message so the toast the
    // UI shows says "timed out" instead of generic "aborted".
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type AttractionFilters = {
  /** User-selected interest tags, e.g. ["history", "couples"]. */
  interests?: string[];
};

/**
 * Apply `stripParenSuffix` to every name field on an attractions
 * response. Beka caught "Bridge of Peace (Peace Bridge)" — Claude
 * routinely emits parenthetical synonyms in the `name` field despite
 * the prompt asking it not to. The full bracketed string breaks every
 * downstream lookup (Wikipedia photo lookup, Google Maps click,
 * /api/guide fetch) because no canonical record matches it exactly.
 * Cleaning here means every consumer — results card, attraction page,
 * saved items, city pages — sees the clean form. The Supabase cache
 * row keeps the original Claude output; the stripping happens on the
 * read path so a future prompt fix can re-introduce richer names
 * without invalidating the cache.
 */
function cleanAttractionNames<T extends { name?: string; name_en?: string }>(
  list: T[] | undefined | null,
): T[] {
  if (!Array.isArray(list)) return [];
  return list.map((row) => {
    if (!row) return row;
    const next = { ...row };
    if (typeof next.name === "string") next.name = stripParenSuffix(next.name);
    if (typeof next.name_en === "string") next.name_en = stripParenSuffix(next.name_en);
    return next;
  });
}

export async function fetchAttractionsWithMeta(
  query: string,
  language = "ka",
  filters: AttractionFilters = {},
): Promise<AttractionsResult> {
  const interests = (filters.interests ?? []).filter(Boolean);
  const data = await postJSON<AttractionsResponse | Attraction[]>(ATTRACTIONS_URL, {
    query,
    city: query,
    country: "",
    language,
    interests,
  });
  const list = Array.isArray(data) ? data : (data.attractions ?? []);
  const canonicalQuery =
    !Array.isArray(data) && typeof data.canonicalQuery === "string"
      ? data.canonicalQuery
      : undefined;
  return { attractions: cleanAttractionNames(list), canonicalQuery };
}

export async function fetchAttractions(
  query: string,
  language = "ka",
  filters: AttractionFilters = {},
): Promise<Attraction[]> {
  // n8n workflow reads body.city / body.country (it triages LANDMARK / COUNTRY
  // / CITY mode based on the contents). Send both `query` (legacy) and
  // `city` / `country` so it works whichever shape the workflow expects.
  // The `interests` filter is an extra hint the prompt can use to bias
  // the curated list — empty / undefined means "no preference". The
  // legacy `duration` filter (originally for audio-guide length) was
  // retired entirely; the guide now has a single standard length.
  const interests = (filters.interests ?? []).filter(Boolean);
  const data = await postJSON<AttractionsResponse | Attraction[]>(ATTRACTIONS_URL, {
    query,
    city: query,
    country: "",
    language,
    interests,
  });
  // Tolerate both wrapped and bare-array shapes
  const list = Array.isArray(data) ? data : (data.attractions ?? []);
  return cleanAttractionNames(list);
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
    exclude: excludeNames,
    count,
  });
  const list = Array.isArray(data) ? data : (data.attractions ?? []);
  return cleanAttractionNames(list);
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
  city?: string,
): Promise<GuideData> {
  // Lazy import — keeps SSR clean (guideCache + prefs touch localStorage)
  const { getCachedGuideData, setCachedGuideData } = await import("./guideCache");
  const { getInterest } = await import("./interestPreference");
  const { normalizeInterest } = await import("./interests");
  const effectiveInterest = normalizeInterest(interest ?? getInterest());

  // 1. Cache hit → instant offline-friendly result
  const cached = getCachedGuideData(attraction, language, effectiveInterest);
  if (cached && cached.script) return cached;

  // 2. Network — and persist for next time. Send city when we have
  // one so the server can disambiguate generic names ("Grand Palace",
  // "Riyki Park"); the absence of city here used to make Claude
  // fabricate facts from the wrong continent.
  const raw = await postJSON<unknown>(GUIDE_URL, {
    attraction,
    language,
    interest: effectiveInterest,
    // Send as array too for forward-compat if we ever ship multi-pick.
    interests: [effectiveInterest],
    ...(city && city.trim() ? { city: city.trim() } : {}),
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
  // Museum name when known. The server route uses this to prefer
  // the museum's own collection API (when supported — currently the
  // Met Museum) over Wikipedia for artwork-scoped lookups. Beka
  // caught Wikipedia matching the wrong picture for several Met
  // highlights; the Met's own API returns curator-attributed images.
  museum: string | null = null,
  // Artist name when known. Forwarded to /api/photo so it can reject
  // Wikipedia hits that landed on the artist's biography page
  // ("The Turkish Bath Ingres" → Ingres's portrait photo; "The Swing
  // Fragonard" → Fragonard's sketch). Filter only — does NOT vary
  // the cache key, because the same (name, scope, city, museum)
  // tuple should always converge to the same final URL.
  artist: string | null = null,
): Promise<string | null> {
  const cleaned = name.trim();
  if (!cleaned) return null;

  const cleanCity = city?.trim() || "";
  const cleanMuseum = museum?.trim() || "";
  const cleanArtist = artist?.trim() || "";
  const cacheKey = `${scope ?? ""}:${language}:${cleanCity}:${cleanMuseum}:${cleaned}`;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey) ?? null;

  try {
    const cityParam = cleanCity ? `&city=${encodeURIComponent(cleanCity)}` : "";
    const scopeParam = scope ? `&scope=${encodeURIComponent(scope)}` : "";
    const museumParam = cleanMuseum ? `&museum=${encodeURIComponent(cleanMuseum)}` : "";
    const artistParam = cleanArtist ? `&artist=${encodeURIComponent(cleanArtist)}` : "";
    // 15-s ceiling — shorter than the 30-s POST timeout because
    // photo lookup is fire-and-forget: the card already renders
    // with the MapPin placeholder, and a slow Wikipedia / Google
    // Places lookup just keeps the placeholder there a beat longer.
    // Better to give up early than to hang the AbortController for
    // 30 s when nothing is waiting on the result anyway.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(
        `/api/photo?q=${encodeURIComponent(cleaned)}&lang=${encodeURIComponent(language)}${cityParam}${scopeParam}${museumParam}${artistParam}`,
        { signal: ac.signal },
      );
    } finally {
      clearTimeout(timer);
    }
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
 * Per-session in-memory cache for /api/photo-gallery results. Same
 * shape as photoCache above but stores `string[]` instead of a
 * single URL. Keyed on (name, language, city) so different cities
 * don't collide for ambiguous names (Grand Palace Bangkok vs.
 * Grand Palace anywhere else).
 */
const galleryCache = new Map<string, string[]>();

/**
 * Fetch the multi-photo gallery for an attraction or museum from
 * /api/photo-gallery. Server pulls images from Wikipedia's media-
 * list endpoint, filters out flags / logos / plans, returns up to 8
 * URLs at the highest available srcset resolution.
 *
 * Returns `[]` when the lookup misses (no Wikipedia article matched,
 * or the article had no usable photos). Caller is expected to fall
 * back to /api/photo's single image in that case.
 */
export async function fetchPlaceGallery(
  name: string,
  language = "en",
  city: string | null = null,
): Promise<string[]> {
  const cleaned = name.trim();
  if (!cleaned) return [];
  const cleanCity = city?.trim() || "";
  const cacheKey = `${language}:${cleanCity}:${cleaned}`;
  const cached = galleryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const cityParam = cleanCity
      ? `&city=${encodeURIComponent(cleanCity)}`
      : "";
    // Same 15-s ceiling as fetchPlacePhoto — Wikipedia media-list +
    // optional title resolution can take a beat on cold workers,
    // but a slow gallery should never block the hero (which falls
    // back to the single-photo lookup or the placeholder glyph
    // already on screen).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(
        `/api/photo-gallery?q=${encodeURIComponent(cleaned)}&lang=${encodeURIComponent(language)}${cityParam}`,
        { signal: ac.signal },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return [];
    const data = (await res.json()) as { urls?: string[] };
    const urls = Array.isArray(data.urls) ? data.urls : [];
    // Only cache non-empty results in session memory — same logic
    // as the single-photo path: a server-side fix shouldn't be
    // hidden behind a sticky empty array for the rest of the
    // session.
    if (urls.length > 0) galleryCache.set(cacheKey, urls);
    return urls;
  } catch {
    return [];
  }
}

/**
 * Strip a trailing parenthetical suffix off an attraction / artwork
 * name. The /api/attractions prompt asks Claude not to emit
 * parenthetical synonyms in the `name` field, but it routinely slips
 * one in anyway — "Bridge of Peace (Peace Bridge)", "Liberty Square
 * (Tavisuplebis Moedani)", "Old Town (Historic District)". Those
 * synonyms break every downstream lookup: Wikipedia and Google Maps
 * have no article whose title matches the full bracketed string, so
 * the click-through lands on a different place than the card
 * advertised (Beka caught this on Bridge of Peace — clicking the card
 * took him to a completely different bridge).
 *
 * Removes ONLY the final trailing parenthesised group ("X (Y)" → "X").
 * Earlier parentheticals are left alone (rare, but e.g. a saint name
 * inside an attraction title like "St. Mary's (Smetown) Park" stays
 * intact). Whitespace before the paren is trimmed. Returns the
 * original input if no trailing paren exists or if stripping would
 * leave an empty string.
 */
export function stripParenSuffix(name: string): string {
  if (!name) return name;
  const stripped = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped.length > 0 ? stripped : name;
}

/**
 * Stable, URL-safe id derived from an attraction name. Routes through
 * `stripParenSuffix` first so a name that Claude emitted with a
 * synonym suffix and a name a user typed without the suffix collapse
 * to the same slug — keeps the /attraction/$id cache key stable
 * regardless of which variant the click came from.
 */
export function attractionSlug(name: string): string {
  return encodeURIComponent(stripParenSuffix(name).trim().toLowerCase().replace(/\s+/g, "-"));
}

export function unslugAttraction(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ");
}

/**
 * Attraction-page hand-off hint.
 *
 * Background — until 2026-06-18 we passed `name`, `city`, and `photo`
 * as URL search params to every `/attraction/$id` navigation so the
 * landing page could render the right photo (carousel slide 1) and
 * disambiguate the city for photo lookup without re-fetching. That
 * worked, but produced URLs like:
 *
 *   /attraction/metekhi-church?name=Metekhi+Church&city=Tbilisi&photo=https%3A%2F%2F...
 *
 * which is ugly to share and bad for SEO — Google sees four URLs for
 * the same content (clean, +name, +name+city, +name+city+photo) and
 * has to canonicalise them itself.
 *
 * The fix: linkers stash the same data into sessionStorage under a
 * slug-keyed entry just before navigating. The attraction page reads
 * it on mount. URL stays clean (`/attraction/metekhi-church`) but the
 * UX is identical — no photo flicker, right city disambiguation, right
 * capitalised name in the header. The hint is overwritten on every new
 * card click so we never serve a stale photo for the same slug across
 * cities (e.g. clicking "Cathedral" first in Tbilisi then in Rome).
 *
 * Search-param fallback is kept inside the route: old shared bookmarks
 * and Google-indexed URLs that still carry the params keep working.
 * Canonical link tag on the route head tells Google the clean URL is
 * the one to index, so SEO signals consolidate to one URL.
 */
export type AttractionHint = {
  name?: string;
  city?: string;
  photo?: string;
};

const ATTRACTION_HINT_PREFIX = "tg.attractionHint.";

export function setAttractionHint(slug: string, hint: AttractionHint): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${ATTRACTION_HINT_PREFIX}${slug}`,
      JSON.stringify(hint),
    );
  } catch {
    // quota exceeded or sessionStorage disabled (private mode in some
    // browsers) — fall back to the search-param path silently.
  }
}

export function getAttractionHint(slug: string): AttractionHint | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${ATTRACTION_HINT_PREFIX}${slug}`);
    if (!raw) return null;
    return JSON.parse(raw) as AttractionHint;
  } catch {
    return null;
  }
}

/**
 * Stage-0 search-bar routing classifier (client wrapper).
 *
 * Hits `/api/classify-query` to decide whether the user's typed query
 * names a CITY/REGION/COUNTRY ("place" → list of attractions on
 * /results) or a SPECIFIC ATTRACTION ("attraction" → straight to
 * /attraction/<slug>). Server uses Claude Haiku for unknown queries
 * and a Supabase cache for known ones — see api.classify-query.ts.
 *
 * Fail-soft: any network/server error returns `{kind:"other"}` so
 * the caller falls back to /results, which is the original behaviour
 * before this classifier existed. No throws from this function.
 */
export type SearchClassification = {
  kind: "attraction" | "place" | "other";
  name?: string;
  city?: string;
  country?: string;
  slug?: string;
};

export async function classifySearchQuery(
  query: string,
): Promise<SearchClassification> {
  const q = query.trim();
  if (!q) return { kind: "other" };
  try {
    const res = await fetch(
      `/api/classify-query?q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { kind: "other" };
    const data = (await res.json()) as SearchClassification;
    if (
      data &&
      (data.kind === "attraction" ||
        data.kind === "place" ||
        data.kind === "other")
    ) {
      return data;
    }
    return { kind: "other" };
  } catch {
    return { kind: "other" };
  }
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
export async function reportGuide(payload: {
  slug: string;
  name: string;
  nameEn?: string | null;
  city?: string | null;
  language?: string | null;
  interest?: string | null;
  script?: string | null;
  reason?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  // One-tap, best-effort. /api/report records it in Supabase
  // `guide_reports` via the service-role key. Returns true on a 2xx ok.
  try {
    const res = await postJSON<{ ok?: boolean }>("/api/report", payload);
    return !!res?.ok;
  } catch {
    return false;
  }
}

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
  /** Artist / maker / culture (e.g. "Caravaggio", "Leonardo da Vinci",
   *  "Unknown Egyptian"). Added 2026-05-20 so the photo lookup can
   *  query Wikipedia with the artist's name appended — critical for
   *  works whose canonical Wikipedia article carries the artist in
   *  its title disambiguator ("The Lute Player (Caravaggio)",
   *  "Penitent Magdalene (La Tour)"). Empty string when irrelevant
   *  (architectural features, rooms). */
  artist?: string;
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
