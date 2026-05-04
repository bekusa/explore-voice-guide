/**
 * Curated, ordered list of cities surfaced on the home page and the
 * Explore page. Tapping a card navigates to /results with the city
 * name as the query, so the n8n attractions workflow loads its top
 * picks for that city.
 *
 * Names are stored in English; the UI runs them through useTranslated()
 * so they appear in the user's preferred language at render time.
 */
export const CITY_LIST: string[] = [
  "Bangkok",
  "Paris",
  "London",
  "Dubai",
  "Singapore",
  "New York",
  "Istanbul",
  "Tokyo",
  "Rome",
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
  "Tbilisi",
  "Bali",
];
