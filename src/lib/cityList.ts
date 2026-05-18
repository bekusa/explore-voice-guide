/**
 * Curated, ordered list of cities surfaced on the home page (first 10)
 * and the Explore page (full list). Tapping a card navigates to /results
 * with the city name as the query, so the n8n attractions workflow
 * loads its top picks for that city.
 *
 * Names are stored in English; the UI runs them through useTranslated()
 * so they appear in the user's preferred language at render time.
 */
// Curated cities first (positions 0–2): Tbilisi, Rome, Istanbul each
// have a hand-authored landing page at /destinations/$slug. Putting
// them at the top of the list means the Home page's Featured strip
// (which slices the first 10 entries) AND the /destinations browser
// surface them prominently — Beka caught users scrolling past 6+
// search-only cities before reaching the curated three.
// Cards for non-curated cities still work; they route to /results
// instead of the detail page.
export const CITY_LIST: string[] = [
  "Tbilisi",
  "Rome",
  "Istanbul",
  "Bangkok",
  "Paris",
  "London",
  "Dubai",
  "Singapore",
  "New York",
  "Tokyo",
  "Barcelona",
  "Antalya",
  "Hong Kong",
  "Madrid",
  "Amsterdam",
  "Vienna",
  "Berlin",
  "Prague",
  "Athens",
  "Florence",
  "Venice",
  "Lisbon",
  "Marrakech",
  "Cairo",
  "Bali",
];

export const HOME_CITIES = CITY_LIST.slice(0, 10);
