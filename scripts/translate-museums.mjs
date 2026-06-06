#!/usr/bin/env node
/**
 * Pre-translates the curated MUSEUMS list (name, blurb, city, country)
 * to every locale Lokali ships, then bakes the result into
 * `src/lib/museumTranslations.generated.ts`. Beka's spec (2026-06-06):
 * museum data must be STATIC, never re-translated by the runtime
 * useTranslated() hook on the client.
 *
 * Usage:
 *   1. Make sure GOOGLE_TRANSLATE_KEY is set in your shell:
 *        $env:GOOGLE_TRANSLATE_KEY="sk-..."  # PowerShell
 *      (Same key the production Worker uses; lift from Lovable
 *      Project Secrets or rotate a fresh one in Google Cloud Console.)
 *   2. node scripts/translate-museums.mjs
 *   3. git add src/lib/museumTranslations.generated.ts && commit + push.
 *
 * Re-run whenever the MUSEUMS list changes (new entry, blurb edit).
 * The script is idempotent — it rewrites the whole file each time.
 *
 * Why a build script rather than per-locale .ts files: 15 museums ×
 * 4 fields × 35 languages = 2,100 strings. Editing those by hand in
 * 35 separate files is brittle (typos, missed updates). Centralising
 * via Google Translate guarantees coverage and stays cheap (one
 * batch run = ~30K source chars × 35 langs = ~$21 total).
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

const KEY = process.env.GOOGLE_TRANSLATE_KEY;
if (!KEY) {
  console.error("[translate-museums] GOOGLE_TRANSLATE_KEY env var is required");
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

// ─── Google Translate v2 batch call ─────────────────────────────────
function toGoogleLang(target) {
  const t = target.trim().toLowerCase();
  if (t === "zh-cn" || t === "zh") return "zh-CN";
  if (t === "zh-tw") return "zh-TW";
  if (t.startsWith("pt-") || t === "pt") return "pt";
  if (t === "nb" || t === "no") return "no";
  return t.split("-")[0];
}

async function translateBatch(texts, targetLang) {
  if (texts.length === 0) return [];
  const body = {
    q: texts,
    target: toGoogleLang(targetLang),
    source: "en",
    format: "text",
  };
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 300)}`);
  }
  const data = await res.json();
  const translations = data?.data?.translations ?? [];
  return translations.map((t) => t.translatedText ?? "");
}

// Build one flat array of strings per locale: [name1, blurb1, city1, country1, name2, ...]
const flat = [];
for (const e of entries) {
  flat.push(e.name, e.blurb, e.city, e.country);
}

const out = {};
for (const lang of LOCALES) {
  process.stdout.write(`[translate-museums] ${lang}… `);
  try {
    // Google v2 caps payload size; chunk into 80-string sub-batches.
    const SUB = 80;
    const translated = [];
    for (let i = 0; i < flat.length; i += SUB) {
      const chunk = flat.slice(i, i + SUB);
      const sub = await translateBatch(chunk, lang);
      translated.push(...sub);
    }
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
 * locale overlays. Consumer: see useStaticMuseum(museum, lang) in
 * src/lib/museumTranslations.ts (hand-written wrapper).
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
