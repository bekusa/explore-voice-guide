/**
 * GET /api/classify-query?q=...
 *
 * Stage-0 routing classifier for the search bar. Takes the user's
 * raw query and answers ONE question:
 *
 *   Is this a SPECIFIC ATTRACTION (Sagrada Família, Eiffel Tower,
 *   Statue of Liberty) — send the user straight to
 *   /attraction/<slug>?
 *
 *   Or is it a PLACE (Barcelona, Spain, Tuscany) — send them to
 *   /results?q=... where the AI returns top attractions?
 *
 * Returns JSON:
 *   { kind: "attraction" | "place" | "other",
 *     name?, city?, country?, slug? }
 *
 * Caching: hits cached_classifications first (free, ~50ms global
 * lookup). On miss, calls Claude Haiku (small, cheap) and writes the
 * result back so the next request is a hit. Same fan-out pattern
 * sharedCache.server.ts uses for all other caches in the app.
 *
 * Client wrapper: see `classifySearchQuery` in src/lib/api.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { callClaude } from "@/lib/anthropic.server";
import { corsJson, corsPreflight } from "@/lib/cors.server";
import {
  getCachedClassification,
  putCachedClassification,
  type Classification,
} from "@/lib/sharedCache.server";

const SYSTEM_PROMPT = `You are a travel search classifier. The user typed a string into a search bar. Decide how to route them.

OUTPUT RULES:
- Reply with ONLY a valid JSON object. No prose, no markdown fences.
- First character must be { — last must be }.

CLASSIFY into one of three kinds:
  "attraction" — a specific named landmark, museum, monument, park, beach, neighborhood that the user clearly wants to read about directly. Examples: "Sagrada Familia", "Eiffel Tower", "Trevi Fountain", "Acropolis", "Bourbon Street", "Times Square", "Brandenburg Gate", "Statue of Liberty", "Louvre", "Mtskheta", "Borobudur".
  "place" — a city, region, country, archipelago, or broad area. The user wants a list of attractions inside that place. Examples: "Barcelona", "Spain", "Tuscany", "Bali", "Bangkok", "Iceland", "Cape Cod", "Tbilisi".
  "other" — gibberish, unrecognized name, or something not travel-related ("asdfgh", "weather", "best pizza", "covid rules"). Send to results page for a graceful fallback.

DISAMBIGUATION RULES:
- If a query is a famous landmark whose name is the same as the city ("Vatican City" = both city-state AND popular destination → "place"; "Mecca" = the city → "place"), prefer "place" unless the wording is clearly about a single building.
- A street name on its own ("Las Ramblas", "Champs-Élysées") is an "attraction" — the street IS the destination.
- Country queries always → "place".
- If the query is a museum, palace, fortress, cathedral, bridge, square, monument, statue, gallery, tower, gate, market, garden, beach, viewpoint → "attraction".

OUTPUT SHAPE:
{
  "kind": "attraction" | "place" | "other",
  "name": "Canonical English name",
  "city": "Containing city if kind=attraction",
  "country": "Containing country if kind=place",
  "slug": "kebab-case-slug-for-attraction"
}

FIELDS:
- "name": canonical English spelling. For "sagrada familia" return "Sagrada Familia" (NOT "Sagrada Família" with the diacritic — slugs are ASCII; keep the canonical name ASCII-friendly too). For "rome italy" return "Rome". For "asdfgh" return "" (empty).
- "city": ONLY when kind="attraction". The city the attraction sits in. "" for places/other.
- "country": ONLY when kind="place" and unambiguous ("Tuscany" → Italy; "Barcelona" → Spain). "" otherwise.
- "slug": ONLY when kind="attraction". Lowercase ASCII, words joined by hyphens, no punctuation. "Sagrada Familia" → "sagrada-familia". "" for places/other.
- Always include all four keys (with empty strings when not applicable). Don't omit any.

EXAMPLES:
Query: "sagrada familia"
{"kind":"attraction","name":"Sagrada Familia","city":"Barcelona","country":"","slug":"sagrada-familia"}

Query: "Barcelona"
{"kind":"place","name":"Barcelona","city":"","country":"Spain","slug":""}

Query: "Tuscany"
{"kind":"place","name":"Tuscany","city":"","country":"Italy","slug":""}

Query: "Mtskheta"
{"kind":"place","name":"Mtskheta","city":"","country":"Georgia","slug":""}

Query: "narikala fortress"
{"kind":"attraction","name":"Narikala Fortress","city":"Tbilisi","country":"","slug":"narikala-fortress"}

Query: "asdfgh"
{"kind":"other","name":"","city":"","country":"","slug":""}`;

/**
 * Defensively coerce Haiku's raw text into a strict Classification.
 * Haiku is good but occasionally adds an extra field or emits a kind
 * outside our enum — we normalise here so the downstream cache only
 * ever stores valid shapes.
 */
function parseClassification(raw: string): Classification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind;
  if (kind !== "attraction" && kind !== "place" && kind !== "other") return null;
  const out: Classification = { kind };
  if (typeof obj.name === "string" && obj.name.trim()) out.name = obj.name.trim();
  if (typeof obj.city === "string" && obj.city.trim()) out.city = obj.city.trim();
  if (typeof obj.country === "string" && obj.country.trim())
    out.country = obj.country.trim();
  if (typeof obj.slug === "string" && obj.slug.trim()) out.slug = obj.slug.trim();
  return out;
}

export const Route = createFileRoute("/api/classify-query")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) {
          return corsJson({ error: "Missing q" }, { status: 400 });
        }
        // Guard against obviously bad input — empty / very long
        // strings would burn Haiku tokens for no benefit.
        if (q.length > 200) {
          return corsJson({ kind: "other" } satisfies Classification);
        }

        // Cache hit → instant return.
        const cached = await getCachedClassification(q);
        if (cached) {
          return corsJson(cached);
        }

        // Cache miss → Haiku call.
        let classification: Classification | null = null;
        try {
          const text = await callClaude({
            model: "claude-haiku-4-5",
            system: SYSTEM_PROMPT,
            user: q,
            // The JSON shape we ask for is tiny — 100 tokens is roomy
            // headroom and a hard ceiling against runaway prose.
            maxTokens: 128,
            // Tight: we want consistent routing, not creative reads.
            temperature: 0,
          });
          classification = parseClassification(text);
        } catch (err) {
          console.warn("[api.classify-query] Haiku call failed", err);
        }

        // Haiku failed or returned garbage → fall back to "other" so
        // the client routes to /results (safe default, same as before
        // this endpoint existed).
        if (!classification) {
          classification = { kind: "other" };
        }

        // Fire-and-forget cache write. A failed write logs but doesn't
        // block the user — they already paid the Haiku latency.
        void putCachedClassification(q, classification);

        return corsJson(classification);
      },
    },
  },
});
