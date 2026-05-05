/**
 * UNESCO World Heritage matcher.
 *
 * Strategy: a curated list of ~120 of the most-visited UNESCO sites
 * (the long tail of 1200+ entries doesn't matter for our top-25
 * tourist cities). Matching is case-insensitive substring on either
 * the attraction's name or the city name — Claude's free-form names
 * sometimes append/prepend descriptors ("The Acropolis of Athens",
 * "Acropolis (Athens)"), so substring is more forgiving than an
 * exact lookup.
 *
 * False-positive rate is acceptable: matching "Versailles" anywhere
 * in a string is very unlikely to mis-tag a non-heritage place. We
 * filter out short generic words (e.g. "Park", "Tower", "Castle")
 * by requiring 8+ characters in the matched needle.
 *
 * To extend: just append rows to UNESCO_SITES. Order doesn't matter.
 */

const UNESCO_SITES: string[] = [
  // Italy
  "Colosseum",
  "Roman Forum",
  "Vatican",
  "St. Peter's Basilica",
  "Pantheon",
  "Historic Centre of Rome",
  "Historic Centre of Florence",
  "Florence Cathedral",
  "Duomo di Firenze",
  "Uffizi Gallery",
  "Venice and its Lagoon",
  "St Mark's Basilica",
  "Doge's Palace",
  "Piazza San Marco",
  "Pisa Cathedral",
  "Leaning Tower of Pisa",
  "Pompeii",
  "Herculaneum",
  "Cinque Terre",
  "Amalfi Coast",
  "Mount Etna",

  // France
  "Banks of the Seine",
  "Notre-Dame de Paris",
  "Notre Dame Cathedral",
  "Louvre",
  "Palace of Versailles",
  "Mont-Saint-Michel",
  "Mont Saint-Michel",
  "Chartres Cathedral",
  "Carcassonne",
  "Pont du Gard",
  "Palais des Papes",
  "Avignon",

  // Spain
  "Alhambra",
  "Generalife",
  "Sagrada Familia",
  "Park Güell",
  "Park Guell",
  "Casa Batlló",
  "Casa Mila",
  "Palau de la Música Catalana",
  "Hospital de Sant Pau",
  "Works of Antoni Gaudí",
  "El Escorial",
  "Aranjuez",
  "Toledo",
  "Segovia Aqueduct",
  "Alcazar of Seville",
  "Seville Cathedral",
  "Mosque-Cathedral of Córdoba",

  // United Kingdom
  "Tower of London",
  "Westminster Abbey",
  "Palace of Westminster",
  "Maritime Greenwich",
  "Kew Gardens",
  "Royal Botanic Gardens, Kew",
  "Stonehenge",
  "Bath",
  "Edinburgh Old Town",
  "Edinburgh New Town",
  "Hadrian's Wall",
  "Giant's Causeway",

  // Greece
  "Acropolis",
  "Parthenon",
  "Delphi",
  "Olympia",
  "Mystras",
  "Mount Athos",
  "Meteora",
  "Knossos",
  "Rhodes Old Town",

  // Turkey
  "Hagia Sophia",
  "Blue Mosque",
  "Sultan Ahmed Mosque",
  "Topkapi Palace",
  "Historic Areas of Istanbul",
  "Cappadocia",
  "Göreme",
  "Ephesus",
  "Pamukkale",
  "Hierapolis",
  "Troy",

  // Czech Republic / Austria / Germany / Netherlands
  "Historic Centre of Prague",
  "Český Krumlov",
  "Cesky Krumlov",
  "Historic Centre of Vienna",
  "Schönbrunn Palace",
  "Schloss Schönbrunn",
  "Museum Island",
  "Cologne Cathedral",
  "Brandenburg Gate",
  "Speicherstadt",
  "Aachen Cathedral",
  "Würzburg Residence",
  "Canal Ring",
  "Singel",
  "Kinderdijk",

  // Portugal
  "Tower of Belém",
  "Torre de Belém",
  "Jerónimos Monastery",
  "Mosteiro dos Jerónimos",
  "Sintra",
  "Pena Palace",
  "Alto Douro",

  // Morocco / Egypt / Middle East / Israel
  "Medina of Marrakech",
  "Koutoubia",
  "Bahia Palace",
  "Medina of Fes",
  "Volubilis",
  "Pyramids of Giza",
  "Great Pyramid",
  "Sphinx",
  "Memphis",
  "Saqqara",
  "Historic Cairo",
  "Khan el-Khalili",
  "Abu Simbel",
  "Karnak",
  "Luxor",
  "Valley of the Kings",
  "Petra",
  "Wadi Rum",
  "Old City of Jerusalem",
  "Western Wall",
  "Dome of the Rock",

  // Asia (cities in Top-25 + global icons)
  "Singapore Botanic Gardens",
  "Cultural Landscape of Bali",
  "Tanah Lot",
  "Borobudur",
  "Prambanan",
  "Angkor Wat",
  "Angkor Thom",
  "Bayon",
  "Ta Prohm",
  "Sukhothai",
  "Ayutthaya",
  "Halong Bay",
  "Hoi An",
  "Hue",
  "Phong Nha",
  "Great Wall of China",
  "Forbidden City",
  "Summer Palace",
  "Temple of Heaven",
  "Terracotta Army",
  "Mausoleum of the First Qin Emperor",
  "Mogao Caves",
  "Potala Palace",
  "Macau Historic Centre",
  "Kyoto Historic Monuments",
  "Kiyomizu-dera",
  "Kinkaku-ji",
  "Ryoan-ji",
  "Nara Historic Monuments",
  "Tōdai-ji",
  "Himeji Castle",
  "Itsukushima Shrine",
  "Mount Fuji",
  "Hiroshima Peace Memorial",
  "Genbaku Dome",
  "Taj Mahal",
  "Red Fort",
  "Qutub Minar",
  "Humayun's Tomb",
  "Khajuraho",
  "Hampi",
  "Ajanta Caves",
  "Ellora Caves",
  "Sundarbans",

  // Americas
  "Statue of Liberty",
  "Independence Hall",
  "Mesa Verde",
  "Yellowstone",
  "Yosemite",
  "Grand Canyon",
  "Everglades",
  "Mammoth Cave",
  "Olympic National Park",
  "Redwood",
  "Carlsbad Caverns",
  "Machu Picchu",
  "Cusco",
  "Sacred Valley",
  "Nazca Lines",
  "Chichen Itza",
  "Chichén Itzá",
  "Teotihuacan",
  "Palenque",
  "Tikal",
  "Tulum",
  "Historic Centre of Mexico City",
  "Iguazu",
  "Iguaçu",
  "Galapagos",
  "Easter Island",
  "Rapa Nui",
  "Christ the Redeemer",
  "Sugarloaf Mountain",
  "Cartagena",
  "Quito Old Town",

  // Russia / Caucasus / Eastern Europe
  "Kremlin",
  "Red Square",
  "St. Basil's Cathedral",
  "Hermitage",
  "Historic Centre of Saint Petersburg",
  "Lake Baikal",
  "Mtskheta",
  "Jvari Monastery",
  "Svetitskhoveli",
  "Gelati Monastery",
  "Bagrati Cathedral",
  "Upper Svaneti",
  "Yerevan",
  "Echmiadzin",
  "Geghard",
  "Khor Virap",
  "Wieliczka Salt Mine",
  "Auschwitz Birkenau",
  "Old Town of Krakow",
  "Bran Castle",
  "Painted Churches of Moldavia",
  "Dubrovnik Old Town",
  "Plitvice Lakes",
  "Diocletian's Palace",
  "Stari Most",
  "Mostar",

  // Scandinavia / Africa
  "Bryggen",
  "Geirangerfjord",
  "Nærøyfjord",
  "West Norwegian Fjords",
  "Robben Island",
  "Cape Floral Region",
  "Serengeti",
  "Ngorongoro",
  "Kilimanjaro",
  "Stone Town of Zanzibar",
  "Lalibela",
  "Aksum",
  "Victoria Falls",
  "Okavango Delta",

  // Australia / Oceania
  "Sydney Opera House",
  "Great Barrier Reef",
  "Uluru",
  "Kakadu",
  "Daintree",
  "Tongariro",
];

const UNESCO_NEEDLES = UNESCO_SITES.map((s) => s.toLowerCase()).filter((s) => s.length >= 8);

/**
 * Heuristic: returns true if `attractionName` (or the optional
 * city / type fields) looks like a UNESCO World Heritage site.
 */
export function isUnescoSite(
  attractionName: string | null | undefined,
  context?: { city?: string | null; type?: string | null; description?: string | null },
): boolean {
  if (!attractionName) return false;

  const haystack = [
    attractionName,
    context?.city ?? "",
    context?.type ?? "",
    context?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("unesco")) return true;

  for (const needle of UNESCO_NEEDLES) {
    if (haystack.includes(needle)) return true;
  }
  return false;
}
