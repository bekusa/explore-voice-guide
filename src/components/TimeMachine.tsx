import { useEffect, useMemo, useState } from "react";

type Tier = "MVP" | "TOP 10" | "TOP 20";

interface Attraction {
  id: string;
  name: string;
  emoji: string;
  country: string;
  year: string;
  era: string;
  score: number;
  situation: string;
  desc: string;
  tier: Tier;
  image: string;
}

interface Role {
  value: string;
  label: string;
  hint: string;
}

const ROLES: Role[] = [
  { value: "merchant", label: "Merchant", hint: "Trades everywhere, moves freely" },
  { value: "soldier", label: "Soldier / Guard", hint: "Present at every gate, every era" },
  { value: "servant", label: "Servant", hint: "Sees everything, says little" },
  { value: "foreigner", label: "Foreign Traveler", hint: "Questions are natural, nothing ordinary" },
  { value: "child", label: "Child", hint: "Sees everything for the first time" },
  { value: "healer", label: "Healer", hint: "Needed in war and peace alike" },
  { value: "spy", label: "Spy / Informant", hint: "Trusts no one, notices everything" },
  { value: "survivor", label: "Survivor", hint: "Escaped disaster, war, or the road" },
];

// Themed photos via LoremFlickr (keyword-matched, deterministic with lock seed)
const img = (keywords: string) => {
  const seed = Math.abs([...keywords].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
  return `https://loremflickr.com/900/540/${encodeURIComponent(keywords)}?lock=${seed}`;
};

const ATTRACTIONS: Attraction[] = [
  // MVP
  { id: "rhodes_colossus", name: "Colossus of Rhodes", emoji: "🗿", country: "Greece", year: "278 BC", era: "Hellenistic Age", score: 50, tier: "MVP",
    situation: "The 33-meter bronze statue of Helios is in its 2nd year of construction. 400+ workers on site. The harbor is packed with ships from Egypt, Cyprus, and Carthage. The air smells of molten bronze.",
    desc: "The Colossus of Rhodes — 33m bronze statue of the sun god Helios. Built from the enemy's melted weapons after the Macedonian siege. Took 12 years. Toppled by earthquake in 226 BC.",
    image: img("rhodes,greece,harbor") },
  { id: "alexandria_library", name: "Library of Alexandria", emoji: "📚", country: "Egypt", year: "250 BC", era: "Hellenistic Age", score: 48, tier: "MVP",
    situation: "700,000+ scrolls in one complex. Euclid, Archimedes, Eratosthenes working in the same halls. Every ship entering the harbor is searched and its manuscripts copied.",
    desc: "The greatest library of the ancient world. Every incoming ship was inspected — manuscripts seized and copied. The most ambitious knowledge project in history.",
    image: img("library,scrolls,ancient") },
  { id: "pompeii_day", name: "Pompeii", emoji: "🌋", country: "Italy", year: "August 23, 79 AD", era: "Roman Empire", score: 50, tier: "MVP",
    situation: "A city of 20,000 going about its ordinary day. Markets open, bread baking. Vesuvius looms on the horizon — no one thinks twice. In 6 hours, everything will be buried under 6 meters of ash.",
    desc: "Wealthy Roman city of 20,000. In 79 AD Vesuvius buried it under ash. People couldn't flee — they thought it was routine. Forgotten until 1748. The world's most perfectly 'frozen' city.",
    image: img("pompeii,vesuvius,ruins") },
  { id: "colosseum_opening", name: "The Colosseum", emoji: "🏟️", country: "Italy", year: "80 AD", era: "Roman Empire", score: 47, tier: "MVP",
    situation: "80,000 people fill the amphitheater. Emperor Titus sits in the imperial box. The 100-day games begin — 9,000 animals will die. The roar of the crowd.",
    desc: "Engineered for 50,000–80,000 spectators. 9,000 animals killed in the opening 100 days. Sometimes flooded for mock naval battles. Functioned for 1,500 years.",
    image: img("colosseum,rome") },
  { id: "hagia_sophia", name: "Hagia Sophia", emoji: "🕌", country: "Turkey", year: "537 AD", era: "Byzantine Empire", score: 45, tier: "MVP",
    situation: "5 years, 10,000 workers — today the doors open for the first time. A 56-meter dome floats in the air. Emperor Justinian walks in: 'Solomon, I have surpassed you.'",
    desc: "Byzantine masterpiece — Christian cathedral from 537 to 1453, then Ottoman mosque. 56-meter dome was the world's largest for 1,000 years.",
    image: img("hagia,sophia,istanbul") },
  { id: "bastille", name: "The Bastille", emoji: "🗼", country: "France", year: "July 14, 1789", era: "Age of Enlightenment", score: 48, tier: "MVP",
    situation: "A crowd of 7,000 surrounds the royal prison. Only 7 inmates inside, 82 soldiers defending. The symbol of royal power trembles. Europe's history is about to change.",
    desc: "Symbol of royal authority. Stormed by 7,000 people. Only 7 prisoners inside. Became the defining moment of the French Revolution.",
    image: img("paris,fortress") },
  { id: "titanic", name: "Titanic", emoji: "🚢", country: "Atlantic Ocean", year: "April 14, 1912", era: "Edwardian Era", score: 49, tier: "MVP",
    situation: "2,224 passengers. 11:40 PM — the ship strikes an iceberg. The captain notifies first class. Third-class doors are still locked. The lifeboats are half empty.",
    desc: "The 'unsinkable' liner on its first voyage. 2,224 passengers. Sank in 2 hours 40 minutes. 710 survived. Class inequality determined who lived.",
    image: img("ocean,liner,ship") },
  { id: "thermopylae", name: "Thermopylae", emoji: "⚔️", country: "Greece", year: "480 BC", era: "Greco-Persian Wars", score: 47, tier: "MVP",
    situation: "A Persian army of 300,000 stands before a narrow pass. Leonidas in camp: 'Tonight we dine well.' Everyone knows it's their last meal. Someone tonight will show the Persians another way around.",
    desc: "300 Spartans against 300,000. Three days Leonidas held the pass. A traitor revealed a back route. Every last man fell. 'Go tell the Spartans...' — the epitaph.",
    image: img("spartan,helmet,warrior") },
  { id: "tbilisi_1795", name: "Tbilisi", emoji: "🏯", country: "Georgia", year: "September 12, 1795", era: "18th Century", score: 43, tier: "MVP",
    situation: "A Qajar army of 35,000 closes in. The Battle of Krtsanisi has just been lost. The city empties. Tomorrow brings 3 days of looting, slaughter, and thousands taken into captivity.",
    desc: "Agha Mohammad Khan with 35,000 troops. 3 days of plunder, killing, enslavement. Thousands taken to Persia. The most painful tragedy in Georgian history.",
    image: img("tbilisi,oldcity") },
  { id: "giza_last_year", name: "Giza", emoji: "🔺", country: "Egypt", year: "2560 BC", era: "Old Kingdom", score: 47, tier: "MVP",
    situation: "The Pyramid of Khufu rises to 146 meters. 2.3 million stone blocks. 20,000+ workers. The final sections are being placed. The Pharaoh inspects tomorrow — and there's a miscalculation.",
    desc: "146m tall, 2.3 million blocks. The four corners align with cardinal directions to within 0.05 degrees. How — still debated after 4,500 years.",
    image: img("pyramid,giza,desert") },
  { id: "hiroshima", name: "Hiroshima", emoji: "🌸", country: "Japan", year: "August 5, 1945", era: "World War II", score: 48, tier: "MVP",
    situation: "A city of 350,000 living a normal evening. A bridge, a river, a market. Tomorrow at 8:15 AM, the nuclear bomb. But tonight the city is beautiful. The last normal breath.",
    desc: "August 6, 1945 — first nuclear bomb. 80,000 killed instantly. 140,000 by year's end. August 5 was an ordinary warm evening — the last normal night for 140,000 people.",
    image: img("hiroshima,japan,river") },
  { id: "jerusalem_crucifixion", name: "Jerusalem — Golgotha", emoji: "✝️", country: "Israel", year: "33 AD", era: "Roman Occupation", score: 46, tier: "MVP",
    situation: "Passover. Three crosses on Golgotha. The city works as normal — 80,000+ pilgrims. Most don't know the names of the three men on the hill. The sky slowly darkens.",
    desc: "Passover. Golgotha — just outside the city gate. 80,000+ pilgrims. The city went about its business. The sky was changing.",
    image: img("jerusalem,oldcity") },
  { id: "didgori", name: "Battle of Didgori", emoji: "⚔️", country: "Georgia", year: "August 12, 1121", era: "Georgian Golden Age", score: 50, tier: "MVP",
    situation: "A Seljuk-Persian coalition of 400,000+ faces King David IV with 56,000. A narrow gorge, forested ridges. The 'Desperate Attack' trap is set. One of history's most brilliant military operations.",
    desc: "Victory at 6-to-1 odds — one of the most brilliant military triumphs in history. Launched Georgia's Golden Age. David IV was crowned 'Sword of the Messiah.'",
    image: img("medieval,armor,battle") },
  { id: "trojan_horse", name: "The Trojan Horse", emoji: "🐴", country: "Troy (Turkey)", year: "~1180 BC", era: "Bronze Age", score: 50, tier: "MVP",
    situation: "Last day of a 10-year siege. The Greeks 'retreated' — ships gone from the horizon. Left on the shore: a colossal wooden horse. Cassandra screams: 'Don't bring it inside!' The city celebrates.",
    desc: "Cassandra saw everything clearly, but no one believed her. The foundation of Homer's Iliad and Odyssey. Schliemann proved in 1871 that Troy was real.",
    image: img("troy,ruins,ancient") },
  { id: "first_contact", name: "First Contact", emoji: "🌊", country: "Bahamas", year: "October 12, 1492", era: "Age of Discovery", score: 49, tier: "MVP",
    situation: "Three ships approach the shore. The Taíno people watch — the first Europeans they have ever seen. Neither side understands the other's words. The Taíno offer gold and parrots as gifts.",
    desc: "The Taíno welcomed them with gifts. Columbus wrote: 'Such kind people — they would make good servants.' Within 50 years, the Taíno were virtually extinct.",
    image: img("caribbean,beach,sailing") },

  // TOP 10
  { id: "constantinople_fall", name: "The Fall of Constantinople", emoji: "🏰", country: "Turkey", year: "May 29, 1453", era: "Middle Ages", score: 45, tier: "TOP 10",
    situation: "80,000 Ottoman soldiers outside the walls — 7,000 Byzantine defenders inside. May 29, 1:30 AM. The walls are breaching. A 1,000-year empire meets its final night.",
    desc: "End of the Byzantine Empire after 1,000 years. Emperor Constantine XI fell in battle. Many historians mark this as the end of the Middle Ages.",
    image: img("istanbul,walls,ottoman") },
  { id: "machu_picchu", name: "Machu Picchu", emoji: "⛰️", country: "Peru", year: "1450 AD", era: "Inca Empire", score: 43, tier: "TOP 10",
    situation: "A living city of 1,000 at 2,430 meters in the Andes. Llamas, the Temple of the Sun, stone walls. No European has ever set foot here. The city is fully alive.",
    desc: "Built around 1450 by Emperor Pachacuti. An epidemic forced its sudden abandonment. In 1911, Hiram Bingham 'rediscovered' it.",
    image: img("machu,picchu,peru") },
  { id: "stonehenge", name: "Stonehenge", emoji: "🪨", country: "Britain", year: "2500 BC", era: "Neolithic / Bronze Age", score: 43, tier: "TOP 10",
    situation: "The stones have just been erected — up to 25 tons each, hauled 250 km. People from every corner of Europe are converging. The solstice sun rises exactly on the central axis. Everyone weeps.",
    desc: "Built between 3000 and 2000 BC. Stones up to 25 tons from 250 km away. At midsummer, the sun rises perfectly along the central axis. Purpose still debated.",
    image: img("stonehenge,england") },
  { id: "sistine_chapel", name: "The Sistine Chapel", emoji: "🎨", country: "Italy", year: "1510", era: "Renaissance", score: 44, tier: "TOP 10",
    situation: "4 years of painting the ceiling. 33-year-old Michelangelo suspended every day. His back, neck, and eyes ache. The Pope sees the ceiling for the first time tomorrow.",
    desc: "Pope Julius II commissioned a sculptor to paint a ceiling. Michelangelo worked suspended for 4 years. 500 years later, restorers found dozens of earlier works beneath his frescoes.",
    image: img("fresco,renaissance,ceiling") },
  { id: "olympia_first", name: "Olympia", emoji: "🏛️", country: "Greece", year: "776 BC", era: "Ancient Greece", score: 44, tier: "TOP 10",
    situation: "All wars pause — the Olympic Truce. Athletes from every corner of Greece arrive. The Temple of Zeus. Men compete naked. Women are forbidden even to watch.",
    desc: "The first recorded Olympics, held in honor of Zeus. Every four years wars stopped. Winners received an olive wreath. Held 293 times before Roman Emperor Theodosius banned them.",
    image: img("greek,temple,olympia") },
  { id: "black_plague", name: "The Black Death", emoji: "💀", country: "Britain", year: "1348", era: "Middle Ages", score: 42, tier: "TOP 10",
    situation: "The plague has just reached London. Someone coughs in the street — it's happened before. The city still lives normally. Within 2 years, half of Europe's population will be dead.",
    desc: "The Black Death, 1347–1351 — killed 30–60% of Europe's population. 50 million people. 'Ring Around the Rosie' is from this era. Death became routine.",
    image: img("medieval,london,fog") },
  { id: "socrates", name: "The Trial of Socrates", emoji: "📜", country: "Greece", year: "399 BC", era: "Golden Age of Athens", score: 42, tier: "TOP 10",
    situation: "A jury of 500 citizens. The charge: corrupting the youth. A 70-year-old philosopher chooses death over exile. 28-year-old Plato sits in the front row, writing everything down.",
    desc: "Socrates charged with corrupting youth. 280 convicted, 220 acquitted. He chose death over exile, drank hemlock. Still called a stain on Athenian democracy.",
    image: img("athens,marble,statue") },
  { id: "hannibal_alps", name: "Hannibal Crosses the Alps", emoji: "🏔️", country: "The Alps", year: "218 BC, November", era: "Hellenistic Period", score: 43, tier: "TOP 10",
    situation: "15 days crossing the Alps. 37 elephants, 40,000 soldiers. November frost. At the summit — Italy visible below for the first time. Hannibal commands: 'That is Rome. We descend.'",
    desc: "The most audacious military maneuver in history. 37 elephants (only 3 survived the winter). Of 80,000, fewer than 40,000 reached Italy. Hannibal fought in Italy 15 years — never took Rome.",
    image: img("alps,snow,mountain") },
  { id: "tutankhamun", name: "The Night Tutankhamun Died", emoji: "𓂀", country: "Egypt", year: "1323 BC", era: "New Kingdom", score: 43, tier: "TOP 10",
    situation: "A 19-year-old pharaoh is dying. The palace falls silent. Only 3 people know what really happened. Tomorrow, a new pharaoh will ask you: 'How did he die?'",
    desc: "Pharaoh at age 9, dead at 19. The cause — a 3,000-year mystery. In 1922, Howard Carter found the only intact royal tomb in Egypt. The 'Pharaoh's Curse' — 26 people died between 1923 and 1936.",
    image: img("egypt,tomb,gold") },
  { id: "mozart", name: "Mozart's Requiem", emoji: "🎻", country: "Austria", year: "December 1791", era: "Classical Era", score: 44, tier: "TOP 10",
    situation: "35-year-old Mozart is dying. The Requiem — written for his own funeral — is unfinished. The room is cold. Creditors pound the door. The final note never makes it onto paper.",
    desc: "Cause of death still disputed: syphilis, typhus, poisoning? The Requiem was commissioned anonymously. Mozart never finished it. Süssmayr completed it.",
    image: img("vienna,piano,candle") },

  // TOP 20
  { id: "baghdad_golden", name: "Baghdad", emoji: "🌙", country: "Iraq", year: "900 AD", era: "Islamic Golden Age", score: 38, tier: "TOP 20",
    situation: "The world's largest city — 1 million people. The 'House of Wisdom' translates Greek, Persian, and Indian texts. Al-Khwarizmi is right now inventing algebra.",
    desc: "9th–10th century Baghdad — 1 million people, the largest city on Earth. Al-Khwarizmi invented algebra here. This knowledge rescued medieval Europe.",
    image: img("baghdad,mosque,dome") },
  { id: "carthage", name: "Carthage", emoji: "🐘", country: "Tunisia", year: "218 BC", era: "Hellenistic Period", score: 40, tier: "TOP 20",
    situation: "29-year-old Hannibal has just taken command. Carthage, a city of 700,000, prepares for war. Every family is involved. This city will be erased in 146 BC — but for now, it breathes.",
    desc: "Hannibal swore at age 9: 'I will fight Rome until I die.' At 29, he led 40,000 troops and 37 elephants across the Alps.",
    image: img("tunisia,mediterranean,ruins") },
  { id: "kyoto", name: "Kyoto", emoji: "⛩️", country: "Japan", year: "1600", era: "Sengoku Period", score: 40, tier: "TOP 20",
    situation: "Tomorrow — the Battle of Sekigahara. 160,000+ samurai will clash. The city is silent. Everyone knows tomorrow's battle will decide Japan's future. Tonight, a lord must be chosen.",
    desc: "October 21, 1600 — Sekigahara, Japan's largest civil war. Tokugawa Ieyasu's victory launched a 265-year dynasty. For samurai, choosing the wrong lord meant death.",
    image: img("kyoto,temple,japan") },
  { id: "angkor_wat", name: "Angkor Wat", emoji: "🛕", country: "Cambodia", year: "1150 AD", era: "Khmer Empire", score: 37, tier: "TOP 20",
    situation: "A 400 sq-km complex. 80,000+ people serve it. Angkor — 400,000 souls — is the world's largest city. No European has ever heard of it.",
    desc: "The world's largest religious complex, 400 sq km. In the 12th century, Angkor was the largest city on Earth — nearly 400,000 people.",
    image: img("angkor,cambodia,temple") },
  { id: "great_zimbabwe", name: "Great Zimbabwe", emoji: "🪨", country: "Zimbabwe", year: "1200 AD", era: "Middle Ages", score: 35, tier: "TOP 20",
    situation: "Stone walls 11 meters high, built without mortar. 18,000 residents. Gold and ivory trade — including with China. Europe won't hear of this city until 1871.",
    desc: "11-meter stone walls, 18,000 residents. They traded gold and ivory — even with China. Europe didn't know it existed until 1871.",
    image: img("africa,stone,ruins") },
  { id: "samarcand", name: "Samarkand", emoji: "🕌", country: "Uzbekistan", year: "1400", era: "Middle Ages", score: 39, tier: "TOP 20",
    situation: "Samarkand — the world's center of art, science, and wealth. Every merchant between China and Europe passes through. A Georgian envoy has arrived — one word decides war or peace.",
    desc: "Samarkand under Tamerlane — art, science, architecture. Masters brought from across the world, many as captives. The greatest cultural capital of its era.",
    image: img("samarkand,uzbekistan,tile") },
  { id: "baghdad_mongols", name: "Baghdad — The Mongol Sack", emoji: "🏹", country: "Iraq", year: "February 1258", era: "Middle Ages", score: 38, tier: "TOP 20",
    situation: "Hulagu Khan's 150,000 troops. 13 days of siege. A 36-day sack begins. The library's books thrown into the Tigris — 'the river ran black with ink.' The Golden Age is over.",
    desc: "February 13, 1258 — Baghdad fell in 13 days. 36 days of looting. 'The river ran black with ink.' 800,000 people. The Islamic Golden Age ended here.",
    image: img("siege,fire,ruins") },
  { id: "kiev_batu", name: "Kyiv", emoji: "🏹", country: "Ukraine", year: "December 1240", era: "Middle Ages", score: 37, tier: "TOP 20",
    situation: "Batu Khan's 150,000 cavalry. Kyiv — the greatest Slavic city — holds out for 10 days. December 6. The streets go silent. The city is dying.",
    desc: "150,000 Mongol riders. Kyiv held 10 days. The city lay empty for 8 years. A passing merchant in 1246: 'Skulls everywhere, countless bodies on the ground.'",
    image: img("kyiv,ukraine,ancient") },
];

const TIER_STYLE: Record<Tier, string> = {
  MVP: "bg-[#c9972a] text-black",
  "TOP 10": "bg-orange-500 text-black",
  "TOP 20": "bg-blue-500 text-white",
};

const SCORE_COLOR: Record<Tier, string> = {
  MVP: "bg-gradient-to-r from-[#c9972a] to-amber-300",
  "TOP 10": "bg-gradient-to-r from-orange-500 to-amber-400",
  "TOP 20": "bg-gradient-to-r from-blue-500 to-cyan-400",
};

const LOADING_STAGES = [
  { emoji: "⌛", title: "Time is folding…", sub: "opening the gates of the era" },
  { emoji: "🌀", title: "History awakens…", sub: "shaping the atmosphere" },
  { emoji: "🕯", title: "The candle is lit…", sub: "your character steps forward" },
  { emoji: "📜", title: "The scroll unfolds…", sub: "Claude is finishing the simulation" },
];

interface TimeMachineProps {
  language: string;
  webhookUrl: string;
  onResult?: (data: unknown) => void;
}

export default function TimeMachine({ language, webhookUrl, onResult }: TimeMachineProps) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | Tier>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    total: ATTRACTIONS.length,
    mvp: ATTRACTIONS.filter((a) => a.tier === "MVP").length,
    top10: ATTRACTIONS.filter((a) => a.tier === "TOP 10").length,
    top20: ATTRACTIONS.filter((a) => a.tier === "TOP 20").length,
  }), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ATTRACTIONS.filter((a) => {
      if (tierFilter !== "ALL" && a.tier !== tierFilter) return false;
      if (!q) return true;
      return [a.name, a.country, a.era, a.situation].some((s) => s.toLowerCase().includes(q));
    });
  }, [query, tierFilter]);

  const selected = useMemo(
    () => ATTRACTIONS.find((a) => a.id === selectedId) ?? null,
    [selectedId],
  );

  // Cycle loading stages
  useEffect(() => {
    if (!loading) return;
    setStage(0);
    const id = setInterval(() => setStage((s) => (s + 1) % LOADING_STAGES.length), 2200);
    return () => clearInterval(id);
  }, [loading]);

  const canStart = !!selected && !!role && !loading;

  const handleStart = async () => {
    if (!selected || !role) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: selected.id,
          place_name: selected.name,
          country: selected.country,
          era: selected.era,
          year: selected.year,
          situation: selected.situation,
          character_role: role,
          language,
          duration_minutes: 10,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json().catch(() => ({}));
      onResult?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -200px, #1a1730 0%, #0f0e1a 45%, #07060e 100%)",
        fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
      }}
    >
      {/* HERO */}
      <section className="px-6 pt-16 pb-10 max-w-6xl mx-auto text-center">
        <div
          className="text-xs tracking-[0.35em] mb-4"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "#c9972a" }}
        >
          LOKALI · TIME MACHINE
        </div>
        <h1
          className="text-5xl md:text-7xl font-semibold leading-tight"
          style={{
            backgroundImage: "linear-gradient(90deg,#f6c560 0%,#c9972a 45%,#a83c1e 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          Travel Through Time
        </h1>
        <p className="mt-5 text-lg md:text-xl text-white/70 italic max-w-3xl mx-auto">
          {counts.total} immersive simulations — step inside the moment, become the witness
        </p>

        <div
          className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
        >
          {[
            { k: "TOTAL", v: counts.total },
            { k: "MVP", v: counts.mvp },
            { k: "TOP 10", v: counts.top10 },
            { k: "TOP 20", v: counts.top20 },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded-xl border border-white/10 bg-white/[0.03] py-4"
            >
              <div className="text-3xl font-semibold text-[#c9972a]">{s.v}</div>
              <div className="text-[10px] tracking-[0.3em] text-white/50 mt-1">{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STICKY CONTROLS */}
      <div
        className="sticky top-0 z-30 backdrop-blur-md border-y border-white/10"
        style={{ background: "rgba(7,6,14,0.85)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col md:flex-row gap-3 md:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, country, era…"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9972a]/60"
          />
          <div
            className="flex gap-2"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            {(["ALL", "MVP", "TOP 10", "TOP 20"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`px-3 py-1.5 rounded-md text-[11px] tracking-[0.2em] border transition ${
                  tierFilter === t
                    ? "bg-[#c9972a] text-black border-[#c9972a]"
                    : "border-white/15 text-white/70 hover:border-white/30"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div
            className="text-[11px] tracking-[0.2em] text-white/50 md:ml-2"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            SHOWING {filtered.length} OF {counts.total}
          </div>
        </div>
        {error && (
          <div className="max-w-6xl mx-auto px-6 pb-3 text-sm text-red-400">{error}</div>
        )}
      </div>

      {/* CARD GRID */}
      <section className="max-w-6xl mx-auto px-6 py-10 pb-48">
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
        >
          {filtered.map((a) => {
            const isSelected = selectedId === a.id;
            const isOpen = !!expanded[a.id];
            return (
              <article
                key={a.id}
                onClick={() =>
                  setSelectedId((cur) => (cur === a.id ? null : a.id))
                }
                className={`group relative cursor-pointer rounded-2xl overflow-hidden border bg-[#0f0e1a]/80 transition-all duration-300 hover:-translate-y-[3px] ${
                  isSelected
                    ? "border-[#c9972a] shadow-[0_0_0_1px_#c9972a,0_20px_50px_-20px_rgba(201,151,42,0.5)]"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#c9972a] text-black flex items-center justify-center font-bold text-sm shadow-lg">
                    ✓
                  </div>
                )}
                <div className="relative h-[180px] overflow-hidden">
                  <img
                    src={a.image}
                    alt={a.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f0e1a] via-[#0f0e1a]/30 to-transparent" />
                  <span
                    className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] tracking-[0.2em] font-bold ${TIER_STYLE[a.tier]}`}
                    style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                  >
                    {a.tier}
                  </span>
                </div>

                <div className="p-5">
                  <h3
                    className="text-2xl font-semibold leading-snug"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                  >
                    <span className="mr-2">{a.emoji}</span>
                    {a.name}
                  </h3>
                  <div
                    className="mt-2 text-[10px] tracking-[0.2em] text-white/50 uppercase"
                    style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                  >
                    {a.country} · {a.year} · {a.era}
                  </div>
                  <p className="mt-4 italic text-white/80 text-[15px] leading-relaxed">
                    {a.situation}
                  </p>

                  <div className="mt-5">
                    <div
                      className="flex justify-between text-[10px] tracking-[0.2em] text-white/40 mb-1.5"
                      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                    >
                      <span>SCORE</span>
                      <span>{a.score} / 50</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full ${SCORE_COLOR[a.tier]}`}
                        style={{ width: `${(a.score / 50) * 100}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((m) => ({ ...m, [a.id]: !m[a.id] }));
                    }}
                    className="mt-4 text-[11px] tracking-[0.25em] text-[#c9972a] hover:text-amber-300 transition"
                    style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                  >
                    {isOpen ? "▲ LESS" : "▼ MORE"}
                  </button>
                  {isOpen && (
                    <p className="mt-3 text-sm text-white/65 leading-relaxed border-t border-white/10 pt-3">
                      {a.desc}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* STICKY BOTTOM PANEL */}
      <div
        className={`fixed bottom-0 inset-x-0 z-40 transition-transform duration-500 ${
          selected ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          className="border-t border-[#c9972a]/30 backdrop-blur-xl"
          style={{ background: "rgba(7,6,14,0.95)" }}
        >
          <div className="max-w-6xl mx-auto px-6 py-5 relative">
            <button
              onClick={() => {
                setSelectedId(null);
                setRole(null);
              }}
              className="absolute top-3 right-4 text-white/50 hover:text-white text-xl"
              aria-label="Dismiss"
            >
              ✕
            </button>
            {selected && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">{selected.emoji}</div>
                  <div>
                    <div
                      className="text-lg font-semibold"
                      style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                    >
                      {selected.name}
                    </div>
                    <div
                      className="text-[10px] tracking-[0.2em] text-white/50"
                      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                    >
                      {selected.country} · {selected.year}
                    </div>
                  </div>
                </div>

                <div
                  className="text-[11px] tracking-[0.3em] text-[#c9972a] mb-2"
                  style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                >
                  CHOOSE YOUR ROLE *
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  {ROLES.map((r) => {
                    const active = role === r.value;
                    return (
                      <button
                        key={r.value}
                        onClick={() => setRole(r.value)}
                        title={r.hint}
                        className={`px-3.5 py-1.5 rounded-full text-sm border transition ${
                          active
                            ? "bg-[#c9972a] text-black border-[#c9972a]"
                            : "bg-white/[0.04] text-white/80 border-white/15 hover:border-white/35"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleStart}
                  disabled={!canStart}
                  className={`w-full md:w-auto px-8 py-3 rounded-xl text-base font-semibold tracking-wide transition ${
                    canStart
                      ? "bg-gradient-to-r from-[#f6c560] via-[#c9972a] to-[#a83c1e] text-black hover:brightness-110 cursor-pointer shadow-lg shadow-[#c9972a]/30"
                      : "bg-white/10 text-white/40 cursor-not-allowed"
                  }`}
                >
                  ⌛ Start Simulation
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* LOADING OVERLAY */}
      {loading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md"
          style={{ background: "rgba(7,6,14,0.85)" }}
        >
          <div className="text-7xl animate-spin-slow mb-6">
            {LOADING_STAGES[stage].emoji}
          </div>
          <div
            className="text-2xl md:text-3xl text-[#c9972a]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {LOADING_STAGES[stage].title}
          </div>
          <div className="mt-2 text-white/60 italic">{LOADING_STAGES[stage].sub}</div>
        </div>
      )}

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        .animate-spin-slow { animation: spin-slow 3.5s linear infinite; }
      `}</style>
    </div>
  );
}
