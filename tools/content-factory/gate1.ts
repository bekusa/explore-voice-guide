/**
 * Gate 1 — contract checks. Pure code, free, runs on every item.
 *
 * `hard` failures trigger a re-roll (same prompt). `soft` findings are
 * recorded and sampled for review but do not block publishing.
 * Every rule below is a rule the app's own prompt states — this gate
 * only measures whether the model followed it.
 */
import { INTERESTS } from "@/lib/interests";
import { CONFIG } from "./config";
import type { AttractionItem, GuidePayload } from "./generate";

export type GateResult = {
  hard: string[];
  soft: string[];
  metrics: Record<string, unknown>;
};

const GUIDE_BANNED = [
  "must-see", "iconic", "hidden gem", "world-famous", "breathtaking", "nestled", "boasts",
  "vibrant", "bustling", "stunning", "majestic", "step back in time", "rich history",
];
const LIST_BANNED = [
  "must-see", "iconic", "hidden gem", "breathtaking", "nestled", "boasts", "vibrant", "bustling",
  "charming", "picturesque", "quaint", "jewel of", "step back in time", "rich history",
];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const re = (list: string[]) => new RegExp(`\\b(${list.map((w) => w.replace(/[-]/g, "[- ]")).join("|")})\\b`, "gi");

function findAll(text: string, rx: RegExp): string[] {
  return Array.from(text.matchAll(rx), (m) => m[0]);
}

export function foldName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function gate1Guide(g: GuidePayload, expectedName: string): GateResult {
  const C = CONFIG.guide;
  const hard: string[] = [];
  const soft: string[] = [];
  const script = g.script ?? "";
  const paragraphs = script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const paraWords = paragraphs.map(words);
  const sentences = script.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const longSentences = sentences.filter((s) => words(s) > C.maxSentenceWords).length;
  const total = words(script);
  const allText = [g.title, script, ...(g.key_facts ?? []), ...(g.tips ?? []), ...(g.look_for ?? [])].join("\n");

  // Shape
  for (const k of ["title", "script", "key_facts", "tips", "look_for"] as const) {
    if (g[k] === undefined || g[k] === null) hard.push(`missing:${k}`);
  }
  if (/^\s*(#{1,6}\s|[-•*]\s)|`/m.test(script)) hard.push("markdown_in_script");
  if (/\*[^*\n]+\*|_[^_\n]+_/.test(script)) soft.push("markdown_emphasis");
  if (/\[(pause|music|sigh)[^\]]*\]|\((sigh|pause)\)/i.test(script)) hard.push("stage_direction");
  if (/https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]/i.test(allText)) hard.push("url_or_email");

  // Title = the place we asked for (catches a swapped attraction)
  const t = foldName(g.title ?? "");
  const e = foldName(expectedName);
  if (t && e && !t.includes(e) && !e.includes(t)) soft.push(`title_mismatch:${g.title}`);

  // Length contract
  if (total < C.minWords) hard.push(`words_under:${total}`);
  else if (total < C.targetWords) soft.push(`words_below_target:${total}`);
  if (total > C.maxWords) soft.push(`words_over:${total}`);
  if (paragraphs.length < C.minParagraphs || paragraphs.length > C.maxParagraphs) soft.push(`paragraphs:${paragraphs.length}`);
  const offParas = paraWords.filter((w) => w < C.paragraphWords[0] || w > C.paragraphWords[1]).length;
  if (offParas > 2) soft.push(`paragraph_length_off:${offParas}`);
  if (sentences.length && longSentences / sentences.length > C.longSentenceShare) soft.push(`long_sentences:${longSentences}/${sentences.length}`);

  // Chips
  const chipArrays = { key_facts: g.key_facts ?? [], tips: g.tips ?? [], look_for: g.look_for ?? [] };
  for (const [k, arr] of Object.entries(chipArrays)) {
    if (!Array.isArray(arr) || arr.length < C.chipCount[0] || arr.length > C.chipCount[1]) hard.push(`chip_count:${k}:${Array.isArray(arr) ? arr.length : "x"}`);
    const [lo, hi] = C.chipWords[k];
    const off = (arr as string[]).filter((c) => words(c) < lo || words(c) > hi).length;
    if (off) soft.push(`chip_words:${k}:${off}`);
  }
  const chipSeen = new Map<string, string>();
  for (const [k, arr] of Object.entries(chipArrays)) {
    for (const c of arr as string[]) {
      const f = foldName(c);
      if (chipSeen.has(f) && chipSeen.get(f) !== k) soft.push("chip_overlap");
      chipSeen.set(f, k);
    }
  }

  // Style + TTS rules from the prompt
  const banned = findAll(allText, re(GUIDE_BANNED));
  if (banned.length) soft.push(`banned:${[...new Set(banned.map((b) => b.toLowerCase()))].join(",")}`);
  const spokenYears = findAll(script, /\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty) (oh|o|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi);
  if (spokenYears.length) soft.push(`spoken_years:${spokenYears.length}`);
  const digitCenturies = findAll(script, /\b\d{1,2}(st|nd|rd|th)[- ]century\b/gi);
  if (digitCenturies.length) soft.push(`digit_century:${digitCenturies.length}`);
  const abbrev = findAll(script, /\b(St\.|km\b|sq m\b|BC\.)/g);
  if (abbrev.length) soft.push(`abbrev:${[...new Set(abbrev)].join(",")}`);
  const parens = (script.match(/\(/g) ?? []).length;
  if (parens) soft.push(`parentheses:${parens}`);
  // Prices / opening hours are banned by the prompt ("never include them")
  const money = findAll(allText, /[€$£¥]\s?\d|\b\d+\s?(euros?|dollars?|lira|pounds)\b|\bfree (entry|admission)\b|\b(small|entrance|admission) fee\b|\bopen(s)? (daily|from|at|until)\b|\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi);
  if (money.length) soft.push(`price_or_hours:${[...new Set(money.map((m) => m.toLowerCase()))].join(",")}`);
  // English only (the baseline must be English; translation happens downstream)
  // Spacing modifier letters (U+02B0-02FF: the glottal stop in Kʼicheʼ, the okina in Hawaiʻi) belong to
  // romanised names, not to another language.
  const nonLatin = (script.match(/[^\u0000-\u024f\u02b0-\u02ff\u1e00-\u1eff\u2000-\u206f\s]/g) ?? []).length;
  if (nonLatin > 20) hard.push(`non_english_chars:${nonLatin}`);

  return {
    hard,
    soft,
    metrics: {
      words: total,
      paragraphs: paragraphs.length,
      paragraph_words: [Math.min(...paraWords), Math.max(...paraWords)],
      sentences: sentences.length,
      long_sentences: longSentences,
      chips: Object.fromEntries(Object.entries(chipArrays).map(([k, v]) => [k, (v as string[]).length])),
      duration_s: g.estimated_duration_seconds,
    },
  };
}

const INTEREST_IDS = new Set(INTERESTS.map((i) => i.id));

export function gate1Attractions(list: AttractionItem[]): GateResult {
  const C = CONFIG.attractions;
  const hard: string[] = [];
  const soft: string[] = [];
  if (list.length < C.minItems) hard.push(`items_under:${list.length}`);
  if (list.length > C.maxItems) soft.push(`items_over:${list.length}`);

  const seen = new Set<string>();
  let run = 1;
  let prevType = "";
  const ratings: number[] = [];
  list.forEach((a, i) => {
    const tag = `#${i + 1}`;
    const name = String(a.name ?? "");
    if (!name.trim()) hard.push(`${tag}:no_name`);
    const f = foldName(name);
    if (seen.has(f)) hard.push(`${tag}:duplicate:${name}`);
    seen.add(f);
    if (/\(/.test(name)) soft.push(`${tag}:parenthetical_name`);
    if (/\b(hilton|radisson|hyatt|marriott|holiday inn|mcdonald|starbucks|hard rock|gino)\b/i.test(name)) soft.push(`${tag}:brand_prefix:${name}`);
    const type = String(a.type ?? "");
    if (!type || words(type) > C.maxTypeWords) soft.push(`${tag}:type:${type}`);
    run = type && type === prevType ? run + 1 : 1;
    if (run > C.maxSameTypeRun) soft.push(`${tag}:same_type_run:${type}`);
    prevType = type;
    const ow = words(String(a.outside_desc ?? ""));
    const iw = words(String(a.insider_desc ?? ""));
    if (!ow || !iw) hard.push(`${tag}:missing_desc`);
    if (ow && (ow < C.outsideWords[0] - 5 || ow > C.outsideWords[1] + 10)) soft.push(`${tag}:outside_words:${ow}`);
    if (iw && (iw < C.insiderWords[0] - 5 || iw > C.insiderWords[1] + 10)) soft.push(`${tag}:insider_words:${iw}`);
    const r = Number(a.rating);
    if (!Number.isFinite(r) || r < C.ratingRange[0] || r > C.ratingRange[1]) soft.push(`${tag}:rating:${a.rating}`);
    else ratings.push(r);
    if (!/^\d+(\.\d+)?-\d+(\.\d+)? (min|hours)$/.test(String(a.duration ?? ""))) soft.push(`${tag}:duration:${a.duration}`);
    if (!INTEREST_IDS.has(String(a.category ?? ""))) soft.push(`${tag}:category:${a.category}`);
    // The prompt's definition gate excludes paid-leisure venues. Destination theme parks,
    // water parks and thermal spas are allowed since 2026-10-31 (Beka), so they are not flagged here.
    if (/\b(casino|mall|shopping|cinema|bowling|escape room|trampoline|nightclub|family fun|fun cent(er|re)|entertainment cent(er|re))\b/i.test(`${type} ${name}`)) soft.push(`${tag}:excluded_venue_type:${type}`);
    const banned = findAll(`${a.outside_desc ?? ""} ${a.insider_desc ?? ""}`, re(LIST_BANNED));
    if (banned.length) soft.push(`${tag}:banned:${banned.join(",")}`);
  });
  if (ratings.length >= 5 && Math.max(...ratings) - Math.min(...ratings) < C.minRatingSpread) soft.push("rating_spread_narrow");
  const withCoords = list.filter((a) => typeof a.lat === "number" && typeof a.lng === "number").length;
  return { hard, soft, metrics: { items: list.length, with_coords: withCoords } };
}
