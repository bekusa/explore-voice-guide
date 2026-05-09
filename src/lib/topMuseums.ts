/**
 * Top 20 museums — curated, hand-picked for the home strip and the
 * dedicated /museums page. Beka's brief: pick a globally recognisable
 * set spanning art, history, and culture, anchored in cities Lokali
 * already covers. Order roughly by international visibility +
 * collection significance — the first ~10 are universal must-knows,
 * the rest are deep-cut prestige institutions.
 *
 * Why it lives in code, not in the cache: this is editorial product
 * surface, not data we want the LLM rolling its own version of every
 * day. The blurb / city / country fields stay in English here and get
 * translated on the fly in the UI via useTranslated() (same pattern
 * as TimeMachine.tsx).
 *
 * Adding a new museum:
 *   1. Append to MUSEUMS below.
 *   2. The id is what URLs and cache rows key on — keep it stable
 *      (lowercase, hyphenated, no diacritics).
 *   3. The `name` should match how the museum's own English-language
 *      site refers to itself; translation kicks in at render time.
 *   4. `image` is a LoremFlickr deterministic seeded URL — the lock
 *      ensures the same image returns every time.
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
  /** Photo URL — themed, deterministic so the same image is returned. */
  image: string;
  /** Decorative glyph for the card header. */
  emoji: string;
};

// LoremFlickr — themed photos with deterministic seeding so the same
// keyword combination always returns the same image (no flicker on
// re-render). Same helper TimeMachine uses.
const img = (keywords: string) => {
  const seed = Math.abs([...keywords].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
  return `https://loremflickr.com/900/540/${encodeURIComponent(keywords)}?lock=${seed}`;
};

export const MUSEUMS: Museum[] = [
  {
    id: "louvre",
    name: "Louvre",
    city: "Paris",
    country: "France",
    blurb: "World's most-visited museum, from the Mona Lisa to the Code of Hammurabi.",
    image: img("louvre,paris,museum"),
    emoji: "🖼️",
  },
  {
    id: "british-museum",
    name: "British Museum",
    city: "London",
    country: "United Kingdom",
    blurb: "Two million years of human history under one Bloomsbury roof.",
    image: img("british,museum,london"),
    emoji: "🗿",
  },
  {
    id: "metropolitan-museum-of-art",
    name: "Metropolitan Museum of Art",
    city: "New York",
    country: "United States",
    blurb: "Five thousand years of art on the edge of Central Park.",
    image: img("metropolitan,museum,new,york"),
    emoji: "🏛️",
  },
  {
    id: "vatican-museums",
    name: "Vatican Museums",
    city: "Vatican City",
    country: "Vatican City",
    blurb: "Papal collections culminating in Michelangelo's Sistine Chapel.",
    image: img("vatican,museum,sistine"),
    emoji: "⛪",
  },
  {
    id: "state-hermitage",
    name: "State Hermitage Museum",
    city: "Saint Petersburg",
    country: "Russia",
    blurb: "Catherine the Great's empire of art across six baroque buildings.",
    image: img("hermitage,saint,petersburg"),
    emoji: "👑",
  },
  {
    id: "uffizi-gallery",
    name: "Uffizi Gallery",
    city: "Florence",
    country: "Italy",
    blurb: "The Renaissance in one building — Botticelli, Caravaggio, da Vinci.",
    image: img("uffizi,florence,renaissance"),
    emoji: "🎨",
  },
  {
    id: "prado-museum",
    name: "Prado Museum",
    city: "Madrid",
    country: "Spain",
    blurb: "Velázquez, Goya, El Greco — Spanish royal collection at full volume.",
    image: img("prado,madrid,museum"),
    emoji: "🖌️",
  },
  {
    id: "national-gallery",
    name: "National Gallery",
    city: "London",
    country: "United Kingdom",
    blurb: "Western European painting from the 13th to the 20th century.",
    image: img("national,gallery,london"),
    emoji: "🖼️",
  },
  {
    id: "rijksmuseum",
    name: "Rijksmuseum",
    city: "Amsterdam",
    country: "Netherlands",
    blurb: "Vermeer, Rembrandt, and the soul of the Dutch Golden Age.",
    image: img("rijksmuseum,amsterdam,dutch"),
    emoji: "🌷",
  },
  {
    id: "musee-dorsay",
    name: "Musée d'Orsay",
    city: "Paris",
    country: "France",
    blurb: "Impressionism inside a converted Belle Époque railway station.",
    image: img("orsay,impressionism,paris"),
    emoji: "🚂",
  },
  {
    id: "moma",
    name: "Museum of Modern Art (MoMA)",
    city: "New York",
    country: "United States",
    blurb: "Van Gogh's Starry Night, Picasso's Demoiselles, the modern canon.",
    image: img("moma,modern,new,york"),
    emoji: "✨",
  },
  {
    id: "tate-modern",
    name: "Tate Modern",
    city: "London",
    country: "United Kingdom",
    blurb: "A power station turned global temple of contemporary art.",
    image: img("tate,modern,london,thames"),
    emoji: "🔌",
  },
  {
    id: "acropolis-museum",
    name: "Acropolis Museum",
    city: "Athens",
    country: "Greece",
    blurb: "Glass-floored temple to the Parthenon's marbles, in their hometown.",
    image: img("acropolis,athens,museum"),
    emoji: "🏛️",
  },
  {
    id: "egyptian-museum",
    name: "Egyptian Museum",
    city: "Cairo",
    country: "Egypt",
    blurb: "Tutankhamun's gold mask and 120,000 years of pharaonic Egypt.",
    image: img("egyptian,museum,cairo,pharaoh"),
    emoji: "🪦",
  },
  {
    id: "anthropology-museum-mexico",
    name: "National Museum of Anthropology",
    city: "Mexico City",
    country: "Mexico",
    blurb: "Aztec sun stone, Mayan jade, the deepest pre-Columbian collection.",
    image: img("anthropology,mexico,aztec"),
    emoji: "🌞",
  },
  {
    id: "national-gallery-of-art",
    name: "National Gallery of Art",
    city: "Washington",
    country: "United States",
    blurb: "Free admission, da Vinci on this side of the Atlantic.",
    image: img("national,gallery,washington"),
    emoji: "🇺🇸",
  },
  {
    id: "pergamon-museum",
    name: "Pergamon Museum",
    city: "Berlin",
    country: "Germany",
    blurb: "The Ishtar Gate of Babylon and the Pergamon Altar, reassembled in full.",
    image: img("pergamon,berlin,babylon"),
    emoji: "🏺",
  },
  {
    id: "topkapi-palace-museum",
    name: "Topkapı Palace Museum",
    city: "Istanbul",
    country: "Turkey",
    blurb: "The Ottoman sultans' palace, harem, and treasury — overlooking the Bosphorus.",
    image: img("topkapi,istanbul,palace"),
    emoji: "🏯",
  },
  {
    id: "galleria-dellaccademia",
    name: "Galleria dell'Accademia",
    city: "Florence",
    country: "Italy",
    blurb: "Michelangelo's David in person, plus the unfinished Prisoners.",
    image: img("accademia,florence,david"),
    emoji: "🗿",
  },
  {
    id: "reina-sofia",
    name: "Reina Sofía",
    city: "Madrid",
    country: "Spain",
    blurb: "Picasso's Guernica anchors a 20th-century Spanish art masterclass.",
    image: img("reina,sofia,madrid,picasso"),
    emoji: "🎨",
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
