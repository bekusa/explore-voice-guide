import attrTbilisi from "@/assets/attr-tbilisi.jpg";
import attrKyoto from "@/assets/attr-kyoto.jpg";
import attrSantorini from "@/assets/attr-santorini.jpg";
import attrMarrakech from "@/assets/attr-marrakech.jpg";
import attrRome from "@/assets/attr-rome.jpg";
import attrBarcelona from "@/assets/attr-barcelona.jpg";

export interface Attraction {
  id: string;
  name: string;
  city: string;
  country: string;
  image: string;
  rating: number;
  durationMin: number;
  stops: number;
  description: string;
  hours: string;
  lat: number;
  lng: number;
  scriptParagraphs: string[];
}

const attractions: Attraction[] = [
  {
    id: "tbilisi-old-town",
    name: "Tbilisi Old Town",
    city: "Tbilisi", country: "Georgia",
    image: attrTbilisi, rating: 4.9, durationMin: 38, stops: 9,
    hours: "Always open", lat: 41.6934, lng: 44.8015,
    description: "Wind through Narikala fortress, sulphur baths and the wooden balconies of Sololaki — a centuries-old crossroads of caravans, faiths and feasts.",
    scriptParagraphs: [
      "Welcome to Tbilisi, a city carved into the cliffs above the Kura river. For fifteen centuries, travelers have warmed themselves in its sulphur baths and shared bread under its vine-covered balconies.",
      "Look up at Narikala. The fortress has watched over this valley since the fourth century — Persian shahs, Mongol khans and Russian tsars all left their marks on its walls.",
      "As we descend into Abanotubani, breathe in. That faint hint of sulphur is why Tbilisi exists. Legend says King Vakhtang, hunting here in the 5th century, found the springs and decided his city would rise from this warm earth.",
    ],
  },
  {
    id: "kyoto-fushimi-inari",
    name: "Fushimi Inari Shrine",
    city: "Kyoto", country: "Japan",
    image: attrKyoto, rating: 4.95, durationMin: 42, stops: 11,
    hours: "Open 24h", lat: 34.9671, lng: 135.7727,
    description: "Walk beneath ten thousand vermilion torii gates climbing the wooded slopes of Inari mountain, where rice, foxes and prayer have intertwined for thirteen centuries.",
    scriptParagraphs: [
      "You are standing at the gateway to Fushimi Inari, the most photographed shrine in Japan. But step past the cameras — the real shrine begins where the crowds thin out.",
      "Each torii gate you pass was donated by a family or business. Read the kanji on the back — those are names of people who asked the kami of rice and prosperity for a favor, and received it.",
      "Watch for the fox statues. Inari's messengers, they always come in pairs — one with a key to the rice granary, one with a jewel containing the spirit of the harvest.",
    ],
  },
  {
    id: "santorini-oia",
    name: "Oia at Sunset",
    city: "Santorini", country: "Greece",
    image: attrSantorini, rating: 4.85, durationMin: 35, stops: 8,
    hours: "Best 18:00 – 21:00", lat: 36.4615, lng: 25.3754,
    description: "From whitewashed cube houses to blue-domed chapels perched on a flooded volcano, Oia is the Aegean at its most cinematic.",
    scriptParagraphs: [
      "You are standing on the rim of a drowned volcano. Three and a half thousand years ago, the eruption beneath your feet may have ended the Minoan civilisation — and inspired the legend of Atlantis.",
      "Notice the houses. Their cubist white-and-blue forms are not for tourists — they are folk architecture, perfected over centuries to reflect the brutal Aegean sun and shelter against the meltemi wind.",
      "As the sun lowers, count the blue domes. Each one belongs to a different family chapel, lit only on the saint's day for which it was named.",
    ],
  },
  {
    id: "marrakech-medina",
    name: "Marrakech Medina",
    city: "Marrakech", country: "Morocco",
    image: attrMarrakech, rating: 4.8, durationMin: 29, stops: 7,
    hours: "Souks 9:00 – 21:00", lat: 31.6258, lng: -7.9891,
    description: "Lose yourself in lantern-lit alleys filled with spice, leather, and the call to prayer rising over the red walls of the imperial city.",
    scriptParagraphs: [
      "Welcome to the medina of Marrakech, founded a thousand years ago by Berber warriors who painted their walls with the red earth of the Atlas plains.",
      "Listen. That distant rhythm is the storyteller's drum in Jemaa el-Fnaa — the only public square in the world inscribed by UNESCO for its sound, not its stones.",
      "As you weave through the souks, remember: every alley is named for a craft. Dyers, coppersmiths, leather tanners — the medina is a medieval city map written in trades.",
    ],
  },
  {
    id: "rome-colosseum",
    name: "Colosseum & Forum",
    city: "Rome", country: "Italy",
    image: attrRome, rating: 4.92, durationMin: 48, stops: 12,
    hours: "9:00 – 19:15", lat: 41.8902, lng: 12.4922,
    description: "Stand inside the largest amphitheatre ever built, where 50,000 Romans roared as gladiators, beasts and naval battles unfolded on shifting sand.",
    scriptParagraphs: [
      "Welcome to the Flavian Amphitheatre — the Colosseum. For four centuries, this oval of stone hosted the bloodiest spectacle in human history.",
      "Look down into the hypogeum. Beneath the wooden floor, a labyrinth of cells, lifts and trapdoors brought lions, tigers and condemned prisoners up to the sand in dramatic surprise.",
      "And look up. The walls you see are only two thirds of the original height — much of the Colosseum was quarried during the Renaissance to build St. Peter's Basilica.",
    ],
  },
  {
    id: "barcelona-park-guell",
    name: "Park Güell",
    city: "Barcelona", country: "Spain",
    image: attrBarcelona, rating: 4.78, durationMin: 33, stops: 9,
    hours: "9:30 – 19:30", lat: 41.4145, lng: 2.1527,
    description: "Climb Gaudí's dreamlike garden city, where mosaic dragons and undulating benches frame the Mediterranean horizon.",
    scriptParagraphs: [
      "Welcome to Park Güell, a failed real-estate project that became Antoni Gaudí's most playful masterpiece. Eusebi Güell wanted a garden city for the Catalan elite — only two houses ever sold.",
      "The mosaic salamander you just passed is made of trencadís — broken tiles assembled like fragments of memory. Gaudí saw nature as the only true architect.",
      "From the serpentine bench above, the entire city unfolds. The Mediterranean, the Sagrada Família, and Gaudí's lifelong dialogue between geometry and the sea.",
    ],
  },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function listAttractions(): Promise<Attraction[]> {
  await wait(450);
  return attractions;
}

export async function searchAttractions(q: string): Promise<Attraction[]> {
  await wait(500);
  if (!q.trim()) return attractions;
  const ql = q.toLowerCase();
  return attractions.filter(
    (a) => a.name.toLowerCase().includes(ql) ||
           a.city.toLowerCase().includes(ql) ||
           a.country.toLowerCase().includes(ql),
  );
}

export async function getAttraction(id: string): Promise<Attraction | undefined> {
  await wait(250);
  return attractions.find((a) => a.id === id);
}

export const FEATURED_CITIES = [
  { city: "Tbilisi", flag: "🇬🇪" },
  { city: "Kyoto", flag: "🇯🇵" },
  { city: "Santorini", flag: "🇬🇷" },
  { city: "Marrakech", flag: "🇲🇦" },
  { city: "Rome", flag: "🇮🇹" },
  { city: "Barcelona", flag: "🇪🇸" },
];
