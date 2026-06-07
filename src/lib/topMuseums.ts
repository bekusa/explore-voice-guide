/**
 * Top 15 museums — curated, hand-picked for the home strip and the
 * dedicated /museums page. Beka's brief (2026-06-06): replace the
 * previous 30-entry list with a tight global top-15 spanning art,
 * archaeology, and civilization-defining collections. Each photo is
 * bundled under public/images/museums/ so the cards paint instantly
 * without a /api/photo round-trip.
 *
 * Why it lives in code, not in the cache: this is editorial product
 * surface, not data we want the LLM rolling its own version of every
 * day. The blurb / city / country fields stay in English here and get
 * translated on the fly in the UI via useTranslated() (same pattern
 * as TimeMachine.tsx).
 *
 * Adding a new museum:
 *   1. Drop a high-quality 800-1024 px wide photo into
 *      `public/images/museums/`.
 *   2. Append to MUSEUMS below with the matching `image` path.
 *   3. The `id` is what URLs and cache rows key on — keep it stable
 *      (lowercase, hyphenated, no diacritics).
 *   4. The `name` should match how the museum's own English-language
 *      site refers to itself; translation kicks in at render time.
 */

export type Museum = {
  /** Stable identifier — used for URLs and cache keys. */
  id: string;
  /** Display name, in English. Translated on the client. */
  name: string;
  /** Host city, in English. Translated on the client. */
  city: string;
  /** Host country, in English. Translated on the client. */
  country: string;
  /** One-line teaser, in English. Translated on the client. */
  blurb: string;
  /** Photo URL — local bundled asset under public/images/museums/. */
  image: string;
  /** Decorative glyph for the card header. */
  emoji: string;
};

export const MUSEUMS: Museum[] = [
  {
    id: "louvre",
    name: "Louvre",
    city: "Paris",
    country: "France",
    blurb: "World's most-visited museum, from the Mona Lisa to the Code of Hammurabi.",
    image: "/images/museums/louvre.jpg",
    emoji: "🖼️",
  },
  {
    id: "metropolitan-museum-of-art",
    name: "The Metropolitan Museum of Art",
    city: "New York",
    country: "United States",
    blurb: "Five thousand years of art on the edge of Central Park.",
    image: "/images/museums/Metropolitan_Museum_of_Art.jpg",
    emoji: "🏛️",
  },
  {
    id: "british-museum",
    name: "The British Museum",
    city: "London",
    country: "United Kingdom",
    blurb: "Two million years of human history under one Bloomsbury roof.",
    image: "/images/museums/British_Museum.jpg",
    emoji: "🗿",
  },
  {
    id: "grand-egyptian-museum",
    name: "The Grand Egyptian Museum (GEM)",
    city: "Giza",
    country: "Egypt",
    blurb:
      "World's largest archaeology museum — Tutankhamun's full treasure on display beside the Pyramids of Giza.",
    image: "/images/museums/Grand_Egyptian_Museum.jpg",
    emoji: "🪦",
  },
  {
    id: "vatican-museums",
    name: "Vatican Museums",
    city: "Vatican City",
    country: "Vatican City",
    blurb: "Papal collections culminating in Michelangelo's Sistine Chapel.",
    image: "/images/museums/Vatican_Museums.jpg",
    emoji: "⛪",
  },
  {
    id: "museo-nacional-del-prado",
    name: "Museo Nacional del Prado",
    city: "Madrid",
    country: "Spain",
    blurb: "Velázquez, Goya, El Greco — Spanish royal collection at full volume.",
    image: "/images/museums/Museo_Nacional_del_Prado.jpg",
    emoji: "🖌️",
  },
  {
    id: "galleria-degli-uffizi",
    name: "Galleria degli Uffizi",
    city: "Florence",
    country: "Italy",
    blurb: "The Renaissance in one building — Botticelli, Caravaggio, da Vinci.",
    image: "/images/museums/Galleria_degli_Uffizi.jpg",
    emoji: "🎨",
  },
  {
    id: "rijksmuseum",
    name: "Rijksmuseum",
    city: "Amsterdam",
    country: "Netherlands",
    blurb: "Vermeer, Rembrandt, and the soul of the Dutch Golden Age.",
    image: "/images/museums/rijksmuseum.jpg",
    emoji: "🌷",
  },
  {
    id: "musee-dorsay",
    name: "Musée d'Orsay",
    city: "Paris",
    country: "France",
    blurb: "Impressionism inside a converted Belle Époque railway station.",
    image: "/images/museums/Musee_d_Orsay.jpg",
    emoji: "🚂",
  },
  {
    id: "the-national-gallery",
    name: "The National Gallery",
    city: "London",
    country: "United Kingdom",
    blurb: "Western European painting from the 13th to the 20th century, on Trafalgar Square.",
    image: "/images/museums/The_National_Gallery_UK.JPG",
    emoji: "🖼️",
  },
  {
    id: "acropolis-museum",
    name: "Acropolis Museum",
    city: "Athens",
    country: "Greece",
    blurb: "Glass-floored temple to the Parthenon's marbles, in their hometown.",
    image: "/images/museums/The_Acropolis_Museum.jpg",
    emoji: "🏛️",
  },
  {
    id: "national-palace-museum",
    name: "National Palace Museum",
    city: "Taipei",
    country: "Taiwan",
    blurb:
      "The world's largest collection of Chinese imperial art — eight centuries of jade, porcelain, painting.",
    image: "/images/museums/National_Palace_Museum.jpg",
    emoji: "🐉",
  },
  {
    id: "smithsonian-natural-history",
    name: "Smithsonian National Museum of Natural History",
    city: "Washington, D.C.",
    country: "United States",
    blurb:
      "The Hope Diamond, a 14-metre blue whale, and 145 million natural specimens — free entry on the National Mall.",
    image: "/images/museums/Smithsonian_National_Museum_of_Natural_History.jpg",
    emoji: "🦕",
  },
  {
    id: "national-museum-of-anthropology",
    name: "National Museum of Anthropology",
    city: "Mexico City",
    country: "Mexico",
    blurb: "Aztec sun stone, Mayan jade, the deepest pre-Columbian collection.",
    image: "/images/museums/Musee_National_Anthropologie.jpg",
    emoji: "🌞",
  },
  {
    id: "moma",
    name: "The Museum of Modern Art (MoMA)",
    city: "New York",
    country: "United States",
    blurb: "Van Gogh's Starry Night, Picasso's Demoiselles, the modern canon.",
    image: "/images/museums/The_Museum_of_Modern_Art_(MoMA).jpg",
    emoji: "✨",
  },
];

export const MUSEUMS_BY_ID = new Map<string, Museum>(MUSEUMS.map((m) => [m.id, m]));

/**
 * Find a museum that matches a free-form attraction name. Used by the
 * attraction page to decide whether to show the "must-see highlights"
 * section (only renders for the curated set, since highlights cost a
 * Sonnet call to generate per museum).
 *
 * Matching strategy: case-insensitive contains check against either
 * the museum's full name or its id. Order is important — iterate
 * MUSEUMS in declared order so a query like "Louvre Paris" hits the
 * Louvre row even though "Paris" is also a city in many other names.
 */
export function findMuseumByName(name: string | null | undefined): Museum | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  for (const m of MUSEUMS) {
    if (needle === m.name.toLowerCase()) return m;
    if (needle === m.id) return m;
    // Allow short-form matches: "louvre" → "Louvre", "british museum" → "British Museum"
    if (needle.includes(m.id.replace(/-/g, " "))) return m;
    if (m.name.toLowerCase().includes(needle) && needle.length >= 5) return m;
    if (needle.includes(m.name.toLowerCase()) && m.name.length >= 5) return m;
  }
  return null;
}
