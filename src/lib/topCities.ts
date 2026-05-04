/**
 * Top 25 tourist cities, ordered by international visitor share.
 *
 * Used by the Home screen and the Explore page to render a quick
 * one-tap grid of popular destinations. Each card links straight to
 * `/results?q=<city>` so the existing n8n attractions workflow does
 * the heavy lifting — we don't need a per-city catalogue here, just
 * a name + a flag emoji + a hero photo (lazily fetched at render).
 *
 * Ordering rationale: drawn from UNWTO international visitor data,
 * adjusted to surface Tbilisi (Lokali's home market) inside the top
 * tier so locals see a familiar entry point.
 *
 * Adding more cities? Just append rows here — the home + explore
 * grids re-render automatically. Keep `query` exactly as the n8n
 * /webhook/attractions workflow expects it (English city name, no
 * country suffix).
 */
export type TopCity = {
  /** Stable slug — used for React keys and any future deep links. */
  id: string;
  /** Search query passed to /api/attractions (English city name). */
  query: string;
  /** Display name in source language. Translated on render via useTranslated. */
  name: string;
  /** Country label (translated alongside name). */
  country: string;
  /** Emoji flag — purely decorative, never translated. */
  flag: string;
};

export const TOP_CITIES: TopCity[] = [
  { id: "bangkok", query: "Bangkok", name: "Bangkok", country: "Thailand", flag: "🇹🇭" },
  { id: "paris", query: "Paris", name: "Paris", country: "France", flag: "🇫🇷" },
  { id: "london", query: "London", name: "London", country: "United Kingdom", flag: "🇬🇧" },
  { id: "dubai", query: "Dubai", name: "Dubai", country: "UAE", flag: "🇦🇪" },
  { id: "singapore", query: "Singapore", name: "Singapore", country: "Singapore", flag: "🇸🇬" },
  { id: "new-york", query: "New York", name: "New York", country: "USA", flag: "🇺🇸" },
  { id: "istanbul", query: "Istanbul", name: "Istanbul", country: "Turkey", flag: "🇹🇷" },
  { id: "tokyo", query: "Tokyo", name: "Tokyo", country: "Japan", flag: "🇯🇵" },
  { id: "rome", query: "Rome", name: "Rome", country: "Italy", flag: "🇮🇹" },
  { id: "barcelona", query: "Barcelona", name: "Barcelona", country: "Spain", flag: "🇪🇸" },
  { id: "antalya", query: "Antalya", name: "Antalya", country: "Turkey", flag: "🇹🇷" },
  { id: "hong-kong", query: "Hong Kong", name: "Hong Kong", country: "China", flag: "🇭🇰" },
  { id: "madrid", query: "Madrid", name: "Madrid", country: "Spain", flag: "🇪🇸" },
  { id: "amsterdam", query: "Amsterdam", name: "Amsterdam", country: "Netherlands", flag: "🇳🇱" },
  { id: "vienna", query: "Vienna", name: "Vienna", country: "Austria", flag: "🇦🇹" },
  { id: "berlin", query: "Berlin", name: "Berlin", country: "Germany", flag: "🇩🇪" },
  { id: "prague", query: "Prague", name: "Prague", country: "Czech Republic", flag: "🇨🇿" },
  { id: "athens", query: "Athens", name: "Athens", country: "Greece", flag: "🇬🇷" },
  { id: "florence", query: "Florence", name: "Florence", country: "Italy", flag: "🇮🇹" },
  { id: "venice", query: "Venice", name: "Venice", country: "Italy", flag: "🇮🇹" },
  { id: "lisbon", query: "Lisbon", name: "Lisbon", country: "Portugal", flag: "🇵🇹" },
  { id: "marrakech", query: "Marrakech", name: "Marrakech", country: "Morocco", flag: "🇲🇦" },
  { id: "cairo", query: "Cairo", name: "Cairo", country: "Egypt", flag: "🇪🇬" },
  { id: "tbilisi", query: "Tbilisi", name: "Tbilisi", country: "Georgia", flag: "🇬🇪" },
  { id: "bali", query: "Bali", name: "Bali", country: "Indonesia", flag: "🇮🇩" },
];
