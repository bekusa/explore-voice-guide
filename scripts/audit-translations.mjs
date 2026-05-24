#!/usr/bin/env node
/**
 * audit-translations.mjs
 *
 * One-shot review pass for Lokali's UI translation locale files.
 *
 *   src/lib/ui-locales/<lang>.ts   →   reviewed by Gemini   →   rewritten in place
 *
 * Why a separate model? The original locale strings were translated
 * by Claude during the initial i18n bring-up. Routing them past a
 * second model (Gemini Flash here, swap-in any provider you like)
 * surfaces literal renderings, awkward register, missed cultural
 * nuance, broken {placeholders}, and the occasional outright
 * mistranslation — exactly what a professional app translator would
 * catch on a second pass.
 *
 * ──────────────────────────────────────────────────────────────────
 * SETUP (one-time, ~5 minutes)
 *
 *   1. Get a free Gemini API key:
 *        https://aistudio.google.com/app/apikey
 *      Free tier is generous — ~1500 requests/day, plenty for the
 *      34 locale files we ship.
 *
 *   2. Export the key in your shell so the script can read it:
 *        macOS / Linux:
 *           export GEMINI_API_KEY="paste-key-here"
 *        Windows PowerShell:
 *           $env:GEMINI_API_KEY = "paste-key-here"
 *
 *   3. From the repo root, run a dry-run on one locale first:
 *        node scripts/audit-translations.mjs --locale=de --dry-run
 *      The script prints proposed changes without writing anything.
 *      Inspect, then re-run without --dry-run to apply.
 *
 *   4. Once you're happy, audit all 34 locales:
 *        node scripts/audit-translations.mjs
 *
 * ──────────────────────────────────────────────────────────────────
 * FLAGS
 *
 *   --locale=<code>   audit one locale only (e.g. de, ka, zh-cn).
 *                     Omit to audit every file in ui-locales/.
 *   --dry-run         print the diff without writing the file.
 *   --model=<id>      Gemini model id; defaults to gemini-2.5-flash.
 *                     Use gemini-2.5-pro for higher-quality review
 *                     (slower, smaller free-tier quota).
 *   --apikey=<key>    pass the key inline instead of via env var.
 *
 * ──────────────────────────────────────────────────────────────────
 * GUARANTEES
 *
 *   * The KEY SET in each locale file is preserved exactly. If the
 *     model adds, drops, or renames a key, the script aborts and
 *     leaves the original file untouched.
 *   * {placeholders} like {city}, {name} are preserved (the prompt
 *     instructs the model not to translate them, and we sanity-check
 *     placeholder counts per key before writing).
 *   * The TypeScript wrapper (`export const X: Partial<...> = {`)
 *     stays exactly as it was — only the string values inside the
 *     object literal change.
 *   * On any model failure or validation error, the original file
 *     is left in place. Re-run the script on the failed locale
 *     after fixing the underlying issue.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const LOCALES_DIR = join(REPO_ROOT, "src", "lib", "ui-locales");
const I18N_PATH = join(REPO_ROOT, "src", "lib", "i18n.ts");

const args = parseArgs(process.argv.slice(2));
const API_KEY = args.apikey ?? process.env.GEMINI_API_KEY;
const MODEL = args.model ?? "gemini-2.5-flash";
const DRY_RUN = !!args["dry-run"];
const ONLY_LOCALE = args.locale ?? null;

if (!API_KEY) {
  console.error(
    "❌ Missing GEMINI_API_KEY. Set the env var or pass --apikey=… (see file header).",
  );
  process.exit(1);
}

// ─── Language-code → human-readable language name ──────────────────
//
// Used in the system prompt so Gemini knows the target language by
// name rather than ISO code. Pulled from the same canonical list the
// app's language picker uses. Add new entries when you ship new locales.
const LANGUAGE_NAMES = {
  ar: "Arabic",
  bn: "Bengali",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  es: "Spanish",
  fa: "Persian (Farsi)",
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
  nb: "Norwegian Bokmål",
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

// ─── System prompt — voice of the reviewer ─────────────────────────
//
// Written in the register of an in-house app translator / localisation
// QA reviewer. Emphasises: app context (audio guide for travellers),
// mobile UI register (concise, scannable, never academic), placeholder
// preservation, cultural fit, and the hard JSON-shape contract that
// keeps the downstream replacement safe.
function buildSystemPrompt(languageName) {
  return `You are a senior app localisation reviewer for Lokali — an AI-narrated audio guide for travellers (think: a warm, knowledgeable friend who walks a stranger through a city's streets and museums). Your job is to review UI strings already translated into ${languageName} and return a higher-quality version.

VOICE:
• Warm, curious, never lecturing. Mobile app register — short, scannable, immediate.
• Avoid academic tone, marketing fluff, exclamation points, or boilerplate corporate phrasing.
• Match the natural register a native ${languageName} speaker would use in a polished consumer app (Spotify, Airbnb, Apple Maps in that language).
• Title-case / sentence-case / etc. should follow the conventions of the target language, NOT mimic the English source.
• Idioms: prefer the native idiom over a literal translation. "Where next?" in Georgian reads more naturally as "სად მივიდეთ?" than "სად შემდეგ?".

DOMAIN:
• The app is about cities, landmarks, museums, walking tours, audio narration, saved tours, language picker, voice picker, and account/settings.
• Common UI verbs: save, download, share, play, pause, sign in, sign out, continue, retry. Use whatever the platform-native equivalent is in ${languageName}.

NON-NEGOTIABLE RULES:
1. KEY SET unchanged. Return a JSON object whose keys are EXACTLY the same as the input. Do not add, remove, or rename a single key.
2. {placeholders} preserved. Tokens like {city}, {name}, {count} must appear in the output value the same number of times. Do not translate the token name.
3. No markdown, no comments, no preamble. Return ONLY a valid JSON object.
4. If a translation is already good, return it unchanged. Do not paraphrase for the sake of paraphrasing.
5. Keep length reasonable for mobile UI — translations longer than the English source by more than 1.5× should be tightened if possible.

OUTPUT FORMAT:
Plain JSON object. First character "{", last character "}". No code fences. No additional fields.`;
}

// ─── Per-locale request builder ────────────────────────────────────
//
// Sends English source + the existing target translations side-by-
// side so Gemini can compare and only adjust where the existing
// translation falls short.
function buildUserPrompt(englishMap, targetMap, languageName) {
  return `Review the ${languageName} translations below. The "EN" map is the English source; the "${languageName.toUpperCase()}" map is the existing translation to review.

Return a JSON object with the SAME keys as ${languageName.toUpperCase()} and the corrected ${languageName} value for each. Unchanged keys keep their existing value verbatim.

EN:
${JSON.stringify(englishMap, null, 2)}

${languageName.toUpperCase()}:
${JSON.stringify(targetMap, null, 2)}

Return the corrected ${languageName.toUpperCase()} object only.`;
}

// ─── Locale file parser ────────────────────────────────────────────
//
// The locale files are TypeScript modules with one named const
// (e.g. `export const DE: Partial<Record<UiKey, string>> = { ... };`).
// We extract the JS-literal object via brace-matching from the first
// `= {` after the export, then `Function`-eval it to a real object.
// Beats pulling in a TS parser dep for what is effectively a flat KV
// map every time. The wrapping export/import lines (top-of-file
// imports, JSDoc) are preserved verbatim so re-serialising never
// drifts the file shape.
function parseLocaleFile(src) {
  // Find the `= {` that opens the locale object. We search for the
  // FIRST occurrence to be tolerant of comments above (the headers
  // are JSDoc + an import line, neither contains `= {`).
  const openMarker = "= {";
  const openIdx = src.indexOf(openMarker);
  if (openIdx === -1) throw new Error("Could not find locale object opener `= {`");
  const objStart = openIdx + openMarker.length - 1; // points at the `{`
  // Brace-match forward to find the closing `}` of the object literal.
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escapeNext = false;
  let objEnd = -1;
  for (let i = objStart; i < src.length; i++) {
    const ch = src[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escapeNext = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringQuote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        objEnd = i;
        break;
      }
    }
  }
  if (objEnd === -1) throw new Error("Unbalanced braces in locale object");
  const objLiteral = src.slice(objStart, objEnd + 1);
  // The literal can contain comments and trailing commas — both are
  // valid TS/JS but not valid JSON. Use Function() to evaluate as JS.
  // (Safe here: the file is part of our own repo, no external input.)
  const value = new Function(`return (${objLiteral});`)();
  return {
    prefix: src.slice(0, objStart), // everything up to and including `=`
    suffix: src.slice(objEnd + 1), // closing `};` etc.
    value,
  };
}

// ─── i18n.ts source extractor ──────────────────────────────────────
//
// Pulls the English UI_STRINGS map out of src/lib/i18n.ts. Same brace-
// match trick as above, scoped to the `UI_STRINGS = {` declaration so
// we don't accidentally grab a different object in that file.
function parseEnglishSource(src) {
  const marker = "UI_STRINGS = {";
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error("UI_STRINGS not found in i18n.ts");
  const objStart = idx + marker.length - 1; // `{`
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escapeNext = false;
  let objEnd = -1;
  for (let i = objStart; i < src.length; i++) {
    const ch = src[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escapeNext = true;
        continue;
      }
      if (ch === stringQuote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringQuote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        objEnd = i;
        break;
      }
    }
  }
  if (objEnd === -1) throw new Error("Unbalanced braces around UI_STRINGS");
  const literal = src.slice(objStart, objEnd + 1);
  return new Function(`return (${literal});`)();
}

// ─── Gemini call ───────────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.3,
      // Force JSON output so we don't have to strip code fences /
      // preamble. Gemini honours response_mime_type when set.
      responseMimeType: "application/json",
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini response had no text part");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Gemini did not return valid JSON. First 200 chars: ${text.slice(0, 200)}`,
    );
  }
}

// ─── Placeholder count check ───────────────────────────────────────
function countPlaceholders(str) {
  const matches = String(str).match(/\{[^{}]+\}/g);
  return matches ? matches.length : 0;
}

// ─── Per-locale processor ──────────────────────────────────────────
async function auditLocale(localeFile, englishMap) {
  const code = basename(localeFile, ".ts");
  const languageName = LANGUAGE_NAMES[code];
  if (!languageName) {
    console.warn(`⚠️  ${code}: no language name mapping — skipping`);
    return { code, skipped: true };
  }
  const filePath = join(LOCALES_DIR, localeFile);
  const src = readFileSync(filePath, "utf8");
  const { prefix, suffix, value: targetMap } = parseLocaleFile(src);

  // Send only the keys present in the target locale — never expand
  // coverage in this script. Adding new keys is a separate
  // human-reviewed step.
  const englishSubset = {};
  for (const key of Object.keys(targetMap)) {
    if (key in englishMap) englishSubset[key] = englishMap[key];
  }

  const systemPrompt = buildSystemPrompt(languageName);
  const userPrompt = buildUserPrompt(englishSubset, targetMap, languageName);

  console.log(`→ ${code} (${languageName})  ${Object.keys(targetMap).length} entries`);
  let reviewed;
  try {
    reviewed = await callGemini(systemPrompt, userPrompt);
  } catch (err) {
    console.error(`   ❌ Gemini call failed: ${err.message}`);
    return { code, failed: true };
  }

  // Validation 1: key set must match exactly.
  const reviewedKeys = new Set(Object.keys(reviewed));
  const targetKeys = new Set(Object.keys(targetMap));
  const missing = [...targetKeys].filter((k) => !reviewedKeys.has(k));
  const added = [...reviewedKeys].filter((k) => !targetKeys.has(k));
  if (missing.length > 0 || added.length > 0) {
    console.error(
      `   ❌ Key set drift — missing ${missing.length}, added ${added.length}. File untouched.`,
    );
    if (missing.length) console.error(`      missing: ${missing.slice(0, 5).join(", ")}…`);
    if (added.length) console.error(`      added:   ${added.slice(0, 5).join(", ")}…`);
    return { code, failed: true };
  }

  // Validation 2: placeholder counts must match per key. If the
  // model dropped or duplicated {city} on any string, abort.
  const placeholderDrift = [];
  for (const k of Object.keys(reviewed)) {
    const before = countPlaceholders(targetMap[k]);
    const after = countPlaceholders(reviewed[k]);
    if (before !== after) {
      placeholderDrift.push(`${k}: ${before}→${after}`);
    }
  }
  if (placeholderDrift.length > 0) {
    console.error(
      `   ❌ Placeholder count drift on ${placeholderDrift.length} keys. File untouched.`,
    );
    console.error(`      ${placeholderDrift.slice(0, 5).join("; ")}…`);
    return { code, failed: true };
  }

  // Validation 3: types must be strings.
  const nonString = Object.entries(reviewed).filter(([, v]) => typeof v !== "string");
  if (nonString.length > 0) {
    console.error(`   ❌ ${nonString.length} non-string values returned. File untouched.`);
    return { code, failed: true };
  }

  // Diff against existing.
  let changed = 0;
  for (const k of Object.keys(reviewed)) {
    if (reviewed[k] !== targetMap[k]) changed++;
  }

  if (changed === 0) {
    console.log(`   ✓ no changes`);
    return { code, changed: 0 };
  }

  if (DRY_RUN) {
    console.log(`   would change ${changed} keys (dry-run)`);
    // Print up to 10 sample diffs for visibility.
    let n = 0;
    for (const k of Object.keys(reviewed)) {
      if (reviewed[k] === targetMap[k]) continue;
      console.log(`     · ${k}`);
      console.log(`         - ${targetMap[k]}`);
      console.log(`         + ${reviewed[k]}`);
      if (++n >= 10) {
        console.log(`     … (${changed - n} more)`);
        break;
      }
    }
    return { code, changed, dryRun: true };
  }

  // Re-serialise the object as TS-literal source. Preserve the exact
  // prefix/suffix from the original file so import lines, JSDoc, the
  // `export const … : Partial<…> = ` declaration, and the trailing
  // `;` all stay identical to what was committed.
  const literal = stringifyAsTsObject(reviewed);
  const next = prefix + literal + suffix;
  writeFileSync(filePath, next, "utf8");
  console.log(`   ✓ wrote ${changed} updated keys`);
  return { code, changed };
}

// Serialise an object as a TS-friendly object literal — quoted keys,
// double-quoted string values with proper escaping, one entry per
// line for readable git diffs. Same shape Prettier would produce so
// the file remains lint-clean.
function stringifyAsTsObject(obj) {
  const lines = ["{"];
  for (const [k, v] of Object.entries(obj)) {
    const safeKey = JSON.stringify(k);
    const safeVal = JSON.stringify(v);
    lines.push(`  ${safeKey}: ${safeVal},`);
  }
  lines.push("}");
  return lines.join("\n");
}

// ─── arg parser (no deps) ──────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const tok of argv) {
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq === -1) {
      out[tok.slice(2)] = true;
    } else {
      out[tok.slice(2, eq)] = tok.slice(eq + 1);
    }
  }
  return out;
}

// ─── main ──────────────────────────────────────────────────────────
(async () => {
  console.log(`Lokali translation audit  ·  model: ${MODEL}  ·  dry-run: ${DRY_RUN}`);

  // Load English source once — every locale review compares against it.
  const englishMap = parseEnglishSource(readFileSync(I18N_PATH, "utf8"));
  console.log(`English source: ${Object.keys(englishMap).length} keys`);

  const allLocales = readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .sort();

  const locales = ONLY_LOCALE
    ? allLocales.filter((f) => f === `${ONLY_LOCALE}.ts`)
    : allLocales;

  if (locales.length === 0) {
    console.error(`No locale files matched.`);
    process.exit(1);
  }

  console.log(`Auditing ${locales.length} locale(s)...\n`);

  const results = [];
  for (const f of locales) {
    const r = await auditLocale(f, englishMap);
    results.push(r);
    // Gentle pacing — Gemini's free tier rate-limits at ~15 req/min
    // for Pro and 60/min for Flash. 1-second spacing keeps us well
    // under either, and avoids a burst of 34 simultaneous calls if
    // we ever switch to Promise.all.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const changed = results.filter((r) => r.changed && !r.dryRun).length;
  const failed = results.filter((r) => r.failed).length;
  console.log("\n────────────");
  console.log(`Done. ${changed} locale(s) updated, ${failed} failed.`);
  if (DRY_RUN) console.log("(dry-run — no files written)");
})().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
