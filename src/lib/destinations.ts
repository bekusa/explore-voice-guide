/**
 * Curated destination catalog. Each entry powers:
 *  - the editorial home page (featured, collections)
 *  - per-destination pages at /destination/$slug
 *  - hero / SEO metadata
 *  - geolocation auto-detect (nearest city by lat/lng)
 *
 * Add new destinations by appending to DESTINATIONS — the home page,
 * collection rows, and detail route all read from this single source.
 */

import abanotubaniImg from "@/assets/abanotubani.jpg";
import samebaImg from "@/assets/sameba.jpg";
import rustaveliImg from "@/assets/rustaveli.jpg";
import tbilisiHero from "@/assets/tbilisi-hero.jpg";
import romeImg from "@/assets/destinations/rome.jpg";
import istanbulImg from "@/assets/destinations/istanbul.jpg";
import kyotoImg from "@/assets/destinations/kyoto.jpg";
import lisbonImg from "@/assets/destinations/lisbon.jpg";
import marrakechImg from "@/assets/destinations/marrakech.jpg";
import cuscoImg from "@/assets/destinations/cusco.jpg";
import pragueImg from "@/assets/destinations/prague.jpg";
import cairoImg from "@/assets/destinations/cairo.jpg";
import athensImg from "@/assets/destinations/athens.jpg";
import edinburghImg from "@/assets/destinations/edinburgh.jpg";
import varanasiImg from "@/assets/destinations/varanasi.jpg";

export type Collection = "ancient" | "sacred" | "coastal" | "imperial" | "mystic";

export type FeaturedTour = {
  id: string;
  title: string;
  subtitle: string;
  img: string;
  duration: string;
  rating: number;
  stops: number;
  distance: string;
  category: string;
  description: string;
};

export type Destination = {
  slug: string;
  city: string;
  country: string;
  /** Display-friendly tagline shown on the hero. Italicized portion picked by '|'. */
  tagline: string;
  /** Two-sentence editorial blurb. */
  blurb: string;
  /** Cinematic hero image (portrait-ish, 1280x1600 recommended). */
  hero: string;
  /** Latitude / longitude — used to find the nearest city via geolocation. */
  lat: number;
  lng: number;
  /** Short three-word vibe tags surfaced on cards. */
  vibe: string[];
  /** Which curated collections this destination belongs to. */
  collections: Collection[];
  /** Hand-picked tours within the city (drives /destination/$slug). */
  featured: FeaturedTour[];
};

export const COLLECTIONS: { id: Collection; label: string; tagline: string }[] = [
  { id: "ancient", label: "Ancient Worlds", tagline: "Where empires left their bones" },
  { id: "sacred", label: "Sacred Cities", tagline: "Pilgrim routes and silent chapels" },
  { id: "coastal", label: "By the Water", tagline: "Harbour towns at golden hour" },
  { id: "imperial", label: "Imperial Capitals", tagline: "Palaces, opera, and revolution" },
  { id: "mystic", label: "Mystic Routes", tagline: "Bazaars, lanterns, and incense" },
];

export const DESTINATIONS: Destination[] = [
  {
    slug: "tbilisi",
    city: "Tbilisi",
    country: "Georgia",
    tagline: "Lokali|Old Tbilisi",
    blurb:
      "From sulfur baths and crooked balconies to the chants of Sioni — a cinematic walk through the soul of the old town.",
    hero: tbilisiHero,
    lat: 41.7151,
    lng: 44.8271,
    vibe: ["Sulfur baths", "Wine country", "Soviet-era lanes"],
    collections: ["sacred", "mystic"],
    featured: [
      {
        id: "abano",
        title: "Abanotubani Steam",
        subtitle: "Sulfur Baths · Old Town",
        img: abanotubaniImg,
        duration: "18 min",
        rating: 4.92,
        stops: 6,
        distance: "0.4 km",
        category: "Historic",
        description:
          "Brick domes hide centuries-old sulfur baths where Pushkin once lingered. The mineral steam, the painted facades, the muezzin's echo from a nearby mosque — Abanotubani is Tbilisi distilled.",
      },
      {
        id: "sameba",
        title: "Sameba at Dusk",
        subtitle: "Holy Trinity Cathedral",
        img: samebaImg,
        duration: "24 min",
        rating: 4.88,
        stops: 8,
        distance: "1.2 km",
        category: "Sacred",
        description:
          "The largest cathedral in the Caucasus crowns Elia Hill in golden silence. Time the visit for vespers — chants drift through incense as the city lights flicker on below.",
      },
      {
        id: "rustaveli",
        title: "Rustaveli Reverie",
        subtitle: "Avenue of Poets",
        img: rustaveliImg,
        duration: "31 min",
        rating: 4.9,
        stops: 11,
        distance: "0.8 km",
        category: "Culture",
        description:
          "A grand boulevard lined with opera, theatre, and revolution. Walk it slowly: every facade carries a 20th-century story — and a thousand cups of cardamom coffee.",
      },
    ],
  },
  {
    slug: "rome",
    city: "Rome",
    country: "Italy",
    tagline: "Lokali|Eternal Rome",
    blurb:
      "Through the Forum's ghosts, baroque fountains and trastevere supper tables — the city that never quite stops being itself.",
    hero: romeImg,
    lat: 41.9028,
    lng: 12.4964,
    vibe: ["Imperial ruins", "Baroque squares", "Trattoria nights"],
    collections: ["ancient", "imperial"],
    featured: [
      {
        id: "forum",
        title: "Forum at First Light",
        subtitle: "Roman Forum · Palatine",
        img: romeImg,
        duration: "42 min",
        rating: 4.94,
        stops: 9,
        distance: "—",
        category: "Ancient",
        description:
          "Walk the Sacra Via before the crowds — Caesar's pyre, the Vestals' hearth, and the arches that watched an empire rise and fall.",
      },
      {
        id: "trastevere",
        title: "Trastevere by Lamplight",
        subtitle: "Cobbled lanes · Tiber bend",
        img: romeImg,
        duration: "28 min",
        rating: 4.86,
        stops: 7,
        distance: "—",
        category: "Neighbourhood",
        description:
          "Ivy-draped osterias, mosaic-laden basilicas, and the slow rituals of a Roman evening — the side of the city locals keep for themselves.",
      },
    ],
  },
  {
    slug: "istanbul",
    city: "Istanbul",
    country: "Türkiye",
    tagline: "Lokali|the Bosphorus",
    blurb:
      "Two continents, three empires, a thousand minarets — Istanbul drifts between sea, prayer, and bazaar.",
    hero: istanbulImg,
    lat: 41.0082,
    lng: 28.9784,
    vibe: ["Sultanic mosques", "Spice bazaar", "Ferry whistles"],
    collections: ["sacred", "imperial", "coastal", "mystic"],
    featured: [
      {
        id: "sultanahmet",
        title: "Sultanahmet at Dawn",
        subtitle: "Hagia Sophia · Blue Mosque",
        img: istanbulImg,
        duration: "36 min",
        rating: 4.93,
        stops: 8,
        distance: "—",
        category: "Sacred",
        description:
          "Two of humanity's most contested buildings face each other across a single square. Arrive before the call to prayer.",
      },
    ],
  },
  {
    slug: "kyoto",
    city: "Kyoto",
    country: "Japan",
    tagline: "Lokali|Old Kyoto",
    blurb:
      "Lantern-lit alleys of Gion, mossy temples, and the ten thousand vermillion gates of Fushimi — Japan's quiet old soul.",
    hero: kyotoImg,
    lat: 35.0116,
    lng: 135.7681,
    vibe: ["Geisha lanes", "Zen gardens", "Maple shrines"],
    collections: ["sacred", "mystic"],
    featured: [
      {
        id: "gion",
        title: "Gion After Dusk",
        subtitle: "Hanamachi · Shirakawa",
        img: kyotoImg,
        duration: "26 min",
        rating: 4.95,
        stops: 7,
        distance: "—",
        category: "Cultural",
        description:
          "Wooden machiya, paper lanterns, and the soft clack of geta on stone — wander the lanes where the geiko district still keeps its rhythms.",
      },
    ],
  },
  {
    slug: "lisbon",
    city: "Lisbon",
    country: "Portugal",
    tagline: "Lokali|the Tagus",
    blurb:
      "Saudade, fado, and tile-clad hills tipping toward the Atlantic — Lisbon sings its melancholy in azulejo blue.",
    hero: lisbonImg,
    lat: 38.7223,
    lng: -9.1393,
    vibe: ["Tram 28", "Fado houses", "Pastel rooftops"],
    collections: ["coastal"],
    featured: [
      {
        id: "alfama",
        title: "Alfama Above the Tagus",
        subtitle: "Old Moorish quarter",
        img: lisbonImg,
        duration: "32 min",
        rating: 4.89,
        stops: 9,
        distance: "—",
        category: "Historic",
        description:
          "The one neighbourhood the 1755 quake spared. Climb past whitewashed chapels and fado bars to the castle that started it all.",
      },
    ],
  },
  {
    slug: "marrakech",
    city: "Marrakech",
    country: "Morocco",
    tagline: "Lokali|the Red City",
    blurb:
      "Lantern-lit medinas, riad courtyards, and the trance-drum theatre of Jemaa el-Fnaa — sensory overload, in the best way.",
    hero: marrakechImg,
    lat: 31.6295,
    lng: -7.9811,
    vibe: ["Spice souks", "Riad gardens", "Atlas haze"],
    collections: ["mystic"],
    featured: [
      {
        id: "medina",
        title: "Medina by Lantern",
        subtitle: "Souks · Jemaa el-Fnaa",
        img: marrakechImg,
        duration: "30 min",
        rating: 4.87,
        stops: 8,
        distance: "—",
        category: "Bazaar",
        description:
          "Brass smiths, leather tanners, snake charmers, orange-blossom carts — the medina at dusk is half marketplace, half theatre.",
      },
    ],
  },
  {
    slug: "cusco",
    city: "Cusco",
    country: "Peru",
    tagline: "Lokali|the Andes",
    blurb:
      "Inca foundations under colonial arches, terracotta rooftops cascading down the valley — the gateway to the Sacred Valley.",
    hero: cuscoImg,
    lat: -13.5319,
    lng: -71.9675,
    vibe: ["Inca walls", "Andean markets", "Sacred Valley"],
    collections: ["ancient", "sacred"],
    featured: [
      {
        id: "qoricancha",
        title: "Qorikancha & San Blas",
        subtitle: "Sun Temple · artisans' quarter",
        img: cuscoImg,
        duration: "34 min",
        rating: 4.91,
        stops: 8,
        distance: "—",
        category: "Ancient",
        description:
          "The Inca temple of the Sun, sheathed once in gold, now wears a Dominican monastery on its shoulders — a perfect parable of conquest.",
      },
    ],
  },
  {
    slug: "prague",
    city: "Prague",
    country: "Czechia",
    tagline: "Lokali|the Vltava",
    blurb:
      "Gothic spires, baroque alleys, and the alchemists' lane in the castle's shadow — a city that wears every century at once.",
    hero: pragueImg,
    lat: 50.0755,
    lng: 14.4378,
    vibe: ["Gothic spires", "Astronomical clock", "Beer halls"],
    collections: ["imperial"],
    featured: [
      {
        id: "castle",
        title: "Castle to Charles Bridge",
        subtitle: "Hradčany · Malá Strana",
        img: pragueImg,
        duration: "38 min",
        rating: 4.9,
        stops: 10,
        distance: "—",
        category: "Historic",
        description:
          "From the largest ancient castle complex in the world, descend through baroque palaces and silent gardens to the statue-lined bridge below.",
      },
    ],
  },
  {
    slug: "cairo",
    city: "Cairo",
    country: "Egypt",
    tagline: "Lokali|the Nile",
    blurb:
      "Pyramids on the desert edge, Fatimid minarets in the old city, the Nile carrying the centuries — Cairo is a thousand cities stacked.",
    hero: cairoImg,
    lat: 30.0444,
    lng: 31.2357,
    vibe: ["Pyramids", "Khan el-Khalili", "Coptic quarter"],
    collections: ["ancient", "mystic"],
    featured: [
      {
        id: "giza",
        title: "Giza at Sunrise",
        subtitle: "Pyramid plateau",
        img: cairoImg,
        duration: "40 min",
        rating: 4.92,
        stops: 6,
        distance: "—",
        category: "Ancient",
        description:
          "Arrive before the heat — and the crowds — to walk the only surviving Wonder of the Ancient World as the desert turns from rose to gold.",
      },
    ],
  },
  {
    slug: "athens",
    city: "Athens",
    country: "Greece",
    tagline: "Lokali|the Acropolis",
    blurb:
      "Marble columns above a tangle of neoclassical streets — the city that invented the very idea of a city.",
    hero: athensImg,
    lat: 37.9838,
    lng: 23.7275,
    vibe: ["Acropolis", "Plaka tavernas", "Sunset rocks"],
    collections: ["ancient"],
    featured: [
      {
        id: "acropolis",
        title: "Acropolis at Golden Hour",
        subtitle: "Parthenon · Erechtheion",
        img: athensImg,
        duration: "33 min",
        rating: 4.93,
        stops: 7,
        distance: "—",
        category: "Ancient",
        description:
          "Climb the sacred rock as the marble warms to amber. From here, the Aegean light explains 2,500 years of philosophy in a single glance.",
      },
    ],
  },
  {
    slug: "edinburgh",
    city: "Edinburgh",
    country: "Scotland",
    tagline: "Lokali|the Royal Mile",
    blurb:
      "A volcano, a castle, and a literary capital wrapped in misty cobblestones — the most theatrical city in the British Isles.",
    hero: edinburghImg,
    lat: 55.9533,
    lng: -3.1883,
    vibe: ["Castle Rock", "Royal Mile", "Whisky vaults"],
    collections: ["imperial", "mystic"],
    featured: [
      {
        id: "royal-mile",
        title: "Royal Mile by Lamplight",
        subtitle: "Castle to Holyroodhouse",
        img: edinburghImg,
        duration: "37 min",
        rating: 4.88,
        stops: 9,
        distance: "—",
        category: "Historic",
        description:
          "Down a single mile of cobblestone runs a thousand years of conspiracy, plague, and Enlightenment — the spine of old Edinburgh.",
      },
    ],
  },
  {
    slug: "varanasi",
    city: "Varanasi",
    country: "India",
    tagline: "Lokali|the Ganges",
    blurb:
      "The world's oldest continuously lived-in city. Ghats, pyres, sitar drift, and dawn boats — life and death in plain view.",
    hero: varanasiImg,
    lat: 25.3176,
    lng: 82.9739,
    vibe: ["Ghats at dawn", "Aarti rites", "Silk lanes"],
    collections: ["sacred", "mystic"],
    featured: [
      {
        id: "ghats",
        title: "Ghats Before Dawn",
        subtitle: "Dashashwamedh · Manikarnika",
        img: varanasiImg,
        duration: "29 min",
        rating: 4.94,
        stops: 7,
        distance: "—",
        category: "Sacred",
        description:
          "Drift past bathing pilgrims, cremation pyres, and saffron sadhus as the river itself wakes. There is nowhere on earth quite like this hour.",
      },
    ],
  },
  // Three additions for the new Home hero rotation Beka asked for
  // (Tbilisi → Paris → Rome → Bangkok → London). Until Beka drops in
  // local /assets/destinations/{slug}.jpg files we point at curated
  // Unsplash URLs sized for the hero (1280px wide is plenty for the
  // 100dvh × 420dvw frame at the highest DPI we serve).
  {
    slug: "paris",
    city: "Paris",
    country: "France",
    tagline: "Lokali|the Seine",
    blurb:
      "Haussmann boulevards, the river at dusk, and the long flâneur shadow of every café terrace — Paris reads itself aloud if you slow down.",
    hero: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1280&q=80",
    lat: 48.8566,
    lng: 2.3522,
    vibe: ["Boulevards", "Cafés", "Patisseries"],
    collections: ["imperial"],
    featured: [],
  },
  {
    slug: "bangkok",
    city: "Bangkok",
    country: "Thailand",
    tagline: "Lokali|the City of Angels",
    blurb:
      "Khlong canals and gilded temple spires, street-side woks throwing sparks, and the Chao Phraya glowing past the long-tail boats at dusk.",
    hero: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1280&q=80",
    lat: 13.7563,
    lng: 100.5018,
    vibe: ["Street food", "Temples", "River"],
    collections: ["mystic"],
    featured: [],
  },
  {
    slug: "london",
    city: "London",
    country: "United Kingdom",
    tagline: "Lokali|the Thames",
    blurb:
      "Black cabs in the rain, Sunday bells at Westminster, and centuries of empire stacked along a river that still pulls everything together.",
    hero: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1280&q=80",
    lat: 51.5074,
    lng: -0.1278,
    vibe: ["Royal parks", "Pubs", "West End"],
    collections: ["imperial"],
    featured: [],
  },
];

/* ─── Lookups ────────────────────────────────────────────────────── */

export function getDestination(slug: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.slug === slug);
}

export function destinationsByCollection(c: Collection): Destination[] {
  return DESTINATIONS.filter((d) => d.collections.includes(c));
}

/** Great-circle distance (km) — accurate enough for "nearest city". */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestDestination(coords: { lat: number; lng: number }): Destination {
  let best = DESTINATIONS[0];
  let bestD = distanceKm(coords, best);
  for (const d of DESTINATIONS) {
    const dd = distanceKm(coords, d);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

export function searchDestinations(query: string): Destination[] {
  const q = query.trim().toLowerCase();
  if (!q) return DESTINATIONS;
  return DESTINATIONS.filter(
    (d) =>
      d.city.toLowerCase().includes(q) ||
      d.country.toLowerCase().includes(q) ||
      d.vibe.some((v) => v.toLowerCase().includes(q)),
  );
}

/** Default destination shown before geolocation resolves / on first launch. */
export const DEFAULT_DESTINATION_SLUG = "tbilisi";
