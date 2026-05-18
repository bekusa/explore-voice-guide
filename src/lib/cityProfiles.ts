/**
 * Hand-authored editorial profiles for the 3 launch cities (Tbilisi,
 * Rome, Istanbul). These power the /destinations/$slug landing page.
 *
 * Why hand-authored: the city pages are the brand surface — first
 * impression for "is Lokali Monocle-quality or a cheap aggregator?".
 * AI-generated intros tend toward filler ("From ancient temples to
 * modern cafés, this vibrant city offers…"); hand-written copy in
 * Beka's voice keeps the sensory, place-specific feel that the hero
 * blurbs already established.
 *
 * Translation strategy: every English string here flows through the
 * existing /api/translate → localStorage cache pipeline at render
 * time. Adding a new city just means appending to this catalogue —
 * no per-locale duplication needed unless we ever want to lock in
 * a hand-translated Georgian variant.
 *
 * Photo gallery: Unsplash URLs at 1280 width. If a URL ever 404s,
 * swap for a local asset under src/assets/destinations/<slug>/N.webp.
 */

export type CityPractical = {
  /** Best months for visiting, e.g. "May–June, September". */
  season: string;
  /** Primary language(s). */
  language: string;
  /** Currency code + symbol. */
  currency: string;
  /** IANA-ish timezone label, user-readable. */
  tz: string;
  /** Plug type letter(s) (A, C, F…) — useful trip-prep info. */
  plug: string;
};

export type CityProfile = {
  slug: "tbilisi" | "rome" | "istanbul";
  /** City + country for the page header. */
  city: string;
  country: string;
  /** 2–3 short paragraphs of editorial copy. */
  intro: string[];
  practical: CityPractical;
  /** 6–8 cinematic photo URLs for the horizontal gallery. */
  gallery: string[];
  /** 4–6 one-line tips for the etiquette card. */
  etiquette: string[];
  /** Optional opening default for the attractions query — falls back
   *  to `city` if absent. Lets us send "Tbilisi" instead of "Tbilisi
   *  city" for the Anthropic call. */
  attractionQuery?: string;
};

export const CITY_PROFILES: Record<string, CityProfile> = {
  tbilisi: {
    slug: "tbilisi",
    city: "Tbilisi",
    country: "Georgia",
    intro: [
      "Tbilisi grew up around its sulphur springs — the city's Georgian name, Tpilisi, literally means 'warm place'. Walk Abanotubani's bathhouse alley at dusk and the steam still curls between the brick domes, just as it did when 5th-century legend says the king found his pheasant boiling in a hot stream and decided to build a capital here.",
      "What surprises first-time visitors is how layered it all is: a Persian-tiled mosque on one street, a Russian-style boulevard on the next, and crooked wooden balconies in between that look like they were carved by someone humming. Old Town is small enough to wander without a map; Vake and Vera, the leafy uphill neighbourhoods, reward an afternoon of café-stops.",
      "Come for the food (khinkali dumplings, fresh-baked shotis puri, supra feasts that double as oral history). Stay for the toasts — long, sincere, and the closest thing Georgia has to a national art form.",
    ],
    practical: {
      season: "May–June, September–October",
      language: "Georgian",
      currency: "GEL (₾)",
      tz: "UTC+4",
      plug: "Type C / F",
    },
    gallery: [
      "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1564507004663-b6dfb3c824d5?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1582967788606-a171c1080cb0?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1601271469167-4f48d5a4b76b?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1601822122631-c4f24c1aef38?auto=format&fit=crop&w=1280&q=80",
    ],
    etiquette: [
      "Cover shoulders + knees when entering churches; women cover their hair.",
      "Toast carefully — at a supra (feast) you don't sip wine between toasts, only when one is made.",
      "Don't refuse food. Hosts will keep refilling; leaving the plate empty signals you want more.",
      "Bargaining at flea markets is fine, gentle. At regular shops, prices are fixed.",
      "Tap water is drinkable in central Tbilisi. Sparkling Borjomi water is the local pride.",
    ],
  },

  rome: {
    slug: "rome",
    city: "Rome",
    country: "Italy",
    intro: [
      "Rome is a layer cake of 2,800 years. You'll round a Renaissance piazza and find a column from Caesar's day holding up the corner of a baroque palazzo. Most cities have a historic centre — Rome has historic everything.",
      "The trick is to slow down. Romans don't sprint through their own city; they linger over an espresso, take the long way around the Pantheon, and eat dinner at 21:00 like the laws of physics demand it. Trastevere after dark, the Forum at sunrise, gelato from the place with a queue — these aren't tourist tips, they're how to read the city in its own rhythm.",
      "Skip-the-line tickets for the Colosseum and Vatican are worth every euro. The rest of Rome — the fountains, the side-street trattorias, the cats sunning themselves on broken capitals — is free.",
    ],
    practical: {
      season: "April–June, September–October",
      language: "Italian",
      currency: "EUR (€)",
      tz: "UTC+1 (UTC+2 summer)",
      plug: "Type F / L",
    },
    gallery: [
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1525874684015-58379d421a52?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1529260830199-42c24126f198?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1583321500900-82807e458f3c?auto=format&fit=crop&w=1280&q=80",
    ],
    etiquette: [
      "Dress code at the Vatican + most churches: shoulders + knees covered. They WILL turn you away.",
      "No cappuccino after 11am — it's a breakfast drink and ordering one at dinner reads as a tourist tell.",
      "Don't sit on the Spanish Steps; there's a fine (€250+) and a polizia officer who'll spot you.",
      "Restaurants charge a coperto (~€2–4) per person — that's the bread + cover, not a tip.",
      "Aperitivo (18:00–20:00) is a Roman institution: order a Negroni or Aperol, free snacks come with it.",
    ],
  },

  istanbul: {
    slug: "istanbul",
    city: "Istanbul",
    country: "Türkiye",
    intro: [
      "Istanbul is the only city that sits on two continents — the Bosphorus splits Europe from Asia and ferries cross it every fifteen minutes, full of commuters reading newspapers and tourists trying to look casual about it.",
      "Sultanahmet has the famous postcards (Hagia Sophia, Blue Mosque, Topkapı), but the city really opens up further out: tea gardens in Çukurcuma, Sunday brunch in Karaköy, the antique-spice rush of the Mısır Çarşısı. Walk a different neighbourhood each day and Istanbul keeps unfolding.",
      "Two truths to hold together: it's enormous (16+ million people) and it's intimate (everyone has a tea-glass and an opinion). Plan less, wander more, and accept the offer when someone invites you to sit down.",
    ],
    practical: {
      season: "April–May, September–October",
      language: "Turkish",
      currency: "TRY (₺)",
      tz: "UTC+3",
      plug: "Type C / F",
    },
    gallery: [
      "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1527838832700-5059252407fa?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1572252009286-268acec5ca0a?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1561912774-79769a0a6e5a?auto=format&fit=crop&w=1280&q=80",
      "https://images.unsplash.com/photo-1539768942893-daf53e448371?auto=format&fit=crop&w=1280&q=80",
    ],
    etiquette: [
      "Remove your shoes before entering any mosque; women cover their hair (scarves available at the door).",
      "Don't visit mosques during the five daily prayer times — wait ~30 minutes after the call to prayer (ezan).",
      "Tea (çay) is offered everywhere — refusing once is fine, but accepting builds rapport in shops + bazaars.",
      "Haggling is expected in the Grand Bazaar and Mısır Çarşısı (spice market) — start at ~40% of asking price.",
      "Cards work in Sultanahmet + Beyoğlu; carry small cash (₺10, ₺20) for taxis and tea-houses outside the centre.",
    ],
  },
};

/** Lookup helper. Returns undefined when slug isn't in the catalogue —
 *  the route uses that to render a 404. */
export function getCityProfile(slug: string): CityProfile | undefined {
  return CITY_PROFILES[slug];
}
