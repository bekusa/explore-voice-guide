#!/usr/bin/env node
/**
 * Pre-translates the curated MUSEUMS list (name, blurb, city, country)
 * to every locale Lokali ships, then bakes the result into
 * `src/lib/museumTranslations.generated.ts`. Beka's spec (2026-06-06):
 * museum data must be STATIC, never re-translated by the runtime
 * useTranslated() hook on the client.
 *
 * 2026-06-11 UPDATE — engine swapped to Gemini Flash 2.0 to match the
 * runtime translation pipeline (src/lib/geminiTranslate.server.ts).
 * Why: Google v2 Basic mis-handled context-sensitive proper nouns
 * (e.g. "Georgia" the US state vs. the country, "Florence" the city
 * vs. the proper name "Florence"). Gemini understands the surrounding
 * museum context and produces the right localised form. Same key
 * Beka already added to Lovable Project Secrets — GEMINI_API_KEY.
 *
 * Usage:
 *   1. Make sure GEMINI_API_KEY is set in your shell:
 *        $env:GEMINI_API_KEY = "AIzaSy..."   # PowerShell
 *        export GEMINI_API_KEY=AIzaSy...     # bash / zsh
 *      (Same key the production Worker uses; lift from Lovable
 *      Project Secrets or rotate a fresh one in Google AI Studio.)
 *   2. node scripts/translate-museums.mjs
 *   3. git add src/lib/museumTranslations.generated.ts && commit + push.
 *
 * Re-run whenever the MUSEUMS list changes (new entry, blurb edit).
 * The script is idempotent — it rewrites the whole file each time.
 *
 * Why a build script rather than per-locale .ts files: 15 museums ×
 * 4 fields × 34 languages = 2,040 strings. Editing those by hand in
 * 34 separate files is brittle (typos, missed updates). Centralising
 * via Gemini guarantees coverage and stays cheap (Gemini Flash 2.0
 * is ~$2 per million chars vs. $20 for Google v2 — one batch run is
 * basically free).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Targets ────────────────────────────────────────────────────────
const LOCALES = [
  "ar", "bn", "cs", "da", "de", "el", "es", "fa", "fi", "fr",
  "he", "hi", "hu", "id", "it", "ja", "ka", "ko", "ms", "nb",
  "nl", "pl", "pt-br", "pt-pt", "ro", "ru", "sv", "th", "tr",
  "uk", "ur", "vi", "zh-cn", "zh-tw",
];

// BCP-47 → human language name. Gemini needs the full name in the
// system instruction so it picks the right dialect / script (e.g.
// "Brazilian Portuguese" vs. "European Portuguese", "Simplified
// Chinese" vs. "Traditional Chinese"). Mirrors the LANG_NAMES table
// in src/routes/api.translate.ts so the two paths stay consistent.
const LANG_NAMES = {
  ar: "Arabic",
  bn: "Bengali",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  es: "Spanish",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ka: "Georgian",
  ko: "Korean",
  ms: "Malay",
  nb: "Norwegian",
  nl: "Dutch",
  pl: "Polish",
  "pt-br": "Brazilian Portuguese",
  "pt-pt": "European Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
  "zh-cn": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
};

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("[translate-museums] GEMINI_API_KEY env var is required");
  console.error("  PowerShell:  $env:GEMINI_API_KEY = \"AIzaSy...\"");
  console.error("  bash / zsh:  export GEMINI_API_KEY=AIzaSy...");
  process.exit(1);
}

// ─── Read MUSEUMS via regex (avoid TS runtime) ──────────────────────
const topMuseumsPath = join(ROOT, "src", "lib", "topMuseums.ts");
const topMuseumsSrc = await readFile(topMuseumsPath, "utf8");

// Walk through each `{ id: "...", name: "...", city: "...", country: "...", blurb: "...", ... }` block.
const entries = [];
const blockRe = /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*city:\s*"([^"]+)",\s*country:\s*"([^"]+)",\s*blurb:[\s\n]*"([^"]+)"/g;
let m;
while ((m = blockRe.exec(topMuseumsSrc)) !== null) {
  entries.push({ id: m[1], name: m[2], city: m[3], country: m[4], blurb: m[5] });
}
if (entries.length === 0) {
  console.error("[translate-museums] couldn't parse MUSEUMS from topMuseums.ts");
  process.exit(1);
}
console.log(`[translate-museums] parsed ${entries.length} museums`);

// ─── Gemini Flash 2.0 batch call ────────────────────────────────────
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

async function geminiTranslateBatch(texts, targetLangName) {
  if (texts.length === 0) return [];

  // Same system instruction as src/lib/geminiTranslate.server.ts so
  // the runtime + bake produce identical results. Adds a museum-
  // specific note: "Georgia" almost always means the country in this
  // dataset (Tbilisi is one of the most translated city names in the
  // app); the v2 path got this wrong because it never saw context.
  const systemInstruction =
    `You are a translation engine. Translate every input string into ${targetLangName}.\n\n` +
    `Strict rules:\n` +
    `  - Output ONLY a JSON array of translated strings, same length and same order as the input.\n` +
    `  - Do not add comments, prefaces, or explanations.\n` +
    `  - Preserve proper nouns (museum names, artist names, brand names) in their original form unless ${targetLangName} has a well-established conventional spelling.\n` +
    `  - For country and city names, use the canonical ${targetLangName} form. "Georgia" in this context is the South Caucasus country, NOT the US state. "Florence" is the Italian city. "Vatican City" is the city-state.\n` +
    `  - Museum names: render the museum in its canonical local form when one exists. "The Louvre" → Russian "Лувр", Georgian "ლუვრი", Japanese "ルーブル美術館". Otherwise keep the original.\n` +
    `  - Never return the source text untranslated unless it is already in ${targetLangName} or has no conventional translation.\n`;

  const userPayload = JSON.stringify({ inputs: texts });

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPayload }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}\nGot: ${text.slice(0, 200)}`);
  }
  // Accept both bare arrays and `{ translations: [...] }` shapes.
  let arr;
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && Array.isArray(parsed.translations)) arr = parsed.translations;
  else throw new Error(`Unexpected response shape: ${JSON.stringify(parsed).slice(0, 200)}`);
  return arr.map((v) => (typeof v === "string" ? v : ""));
}

// Build one flat array of strings per locale: [name1, blurb1, city1, country1, name2, ...]
const flat = [];
for (const e of entries) {
  flat.push(e.name, e.blurb, e.city, e.country);
}

const out = {};
for (const lang of LOCALES) {
  const langName = LANG_NAMES[lang] ?? lang;
  process.stdout.write(`[translate-museums] ${lang.padEnd(5)} (${langName})… `);
  try {
    // Gemini handles 60 short strings comfortably in one round-trip.
    // No chunking needed at this scale; keep it simple.
    const translated = await geminiTranslateBatch(flat, langName);
    if (translated.length !== flat.length) {
      console.error(
        `\n  mismatch — expected ${flat.length} got ${translated.length}`,
      );
      out[lang] = null;
      continue;
    }
    const perId = {};
    for (let i = 0; i < entries.length; i++) {
      const base = i * 4;
      perId[entries[i].id] = {
        name: translated[base],
        blurb: translated[base + 1],
        city: translated[base + 2],
        country: translated[base + 3],
      };
    }
    out[lang] = perId;
    console.log(`✓ ${entries.length} entries`);
  } catch (err) {
    console.error(`\n  failed: ${err.message}`);
    out[lang] = null;
  }
}

// ─── Emit TypeScript ────────────────────────────────────────────────
const outPath = join(ROOT, "src", "lib", "museumTranslations.generated.ts");
await mkdir(dirname(outPath), { recursive: true });

const header = `/**
 * GENERATED by scripts/translate-museums.mjs — DO NOT EDIT BY HAND.
 *
 * Pre-translated museum data baked at build time so the runtime
 * never has to call /api/translate for these strings. Re-run the
 * script after editing topMuseums.ts:
 *   node scripts/translate-museums.mjs
 *
 * The English baseline lives in topMuseums.ts; this file holds the
 * locale overlays. Consumer: getMuseumStrings(museum, lang) in
 * src/lib/museumTranslations.ts (hand-written wrapper).
 *
 * Engine: Gemini Flash 2.0 (see scripts/translate-museums.mjs for
 * the system prompt that ensures Georgia/Florence/Vatican City are
 * disambiguated correctly).
 */

export type MuseumTranslation = {
  name: string;
  blurb: string;
  city: string;
  country: string;
};

export const MUSEUM_TRANSLATIONS: Record<string, Record<string, MuseumTranslation>> = `;

const body = JSON.stringify(out, null, 2);

await writeFile(outPath, header + body + ";\n", "utf8");
console.log(`\n[translate-museums] wrote ${outPath}`);
console.log(`[translate-museums] coverage:`);
for (const lang of LOCALES) {
  const status = out[lang] ? "✓" : "✗ FAILED";
  console.log(`  ${lang.padEnd(6)} ${status}`);
}

const failed = LOCALES.filter((l) => !out[l]);
if (failed.length > 0) {
  console.error(`\n[translate-museums] ${failed.length} locale(s) failed: ${failed.join(", ")}`);
  console.error(`  Re-run the script — Gemini sometimes rate-limits on first hit.`);
  process.exit(1);
}
