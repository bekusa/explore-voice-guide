#!/usr/bin/env node
/**
 * Download hero photos for the curated launch cities + top museums
 * from the live /api/photo endpoint. Saves them locally under
 * public/images/cities/ and public/images/museums/ so the home page
 * never has to hit the API for the most-frequently-rendered tiles.
 *
 * Why a script (vs runtime fetch):
 *   - Wikipedia/Google round-trips add 500-2000 ms per tile on
 *     cold cache; bundling them on the CDN cuts that to ~50 ms.
 *   - Local assets get long-lived Cache-Control headers from
 *     Cloudflare automatically, so subsequent visits paint
 *     instantly.
 *
 * Usage:
 *   node scripts/download-hero-photos.mjs
 *
 * Optional flags:
 *   --base=<URL>     The /api/photo origin (default: https://lokali.ge).
 *                    Use http://localhost:5173 to test against the
 *                    dev server before pushing.
 *   --skip-existing  Don't re-download files that already exist.
 *                    Handy when iterating on a single tile.
 *   --cities-only    Only download cities (skip museums).
 *   --museums-only   Only download museums (skip cities).
 *
 * Idempotent: running it again overwrites the files in place (unless
 * --skip-existing is set). Commit the resulting bundled images to git.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const baseArg = args.find((a) => a.startsWith("--base="));
const BASE = baseArg ? baseArg.slice("--base=".length) : "https://lokali.ge";
const SKIP_EXISTING = args.includes("--skip-existing");
const CITIES_ONLY = args.includes("--cities-only");
const MUSEUMS_ONLY = args.includes("--museums-only");

// ─── Targets ────────────────────────────────────────────────────────
// Kept in sync with src/lib/cityList.ts (HOME_CITIES, first 10) and
// src/lib/topMuseums.ts (curated MUSEUMS array). If those lists drift,
// re-run this script and commit the new tiles.

const CITIES = [
  "Tbilisi",
  "Rome",
  "Istanbul",
  "Bangkok",
  "Paris",
  "London",
  "Dubai",
  "Singapore",
  "New York",
  "Tokyo",
];

const MUSEUMS = [
  "Louvre",
  "British Museum",
  "Metropolitan Museum of Art",
  "Vatican Museums",
  "State Hermitage Museum",
  "Uffizi Gallery",
  "Prado Museum",
  "National Gallery",
  "Rijksmuseum",
  "Musée d'Orsay",
  "Museum of Modern Art (MoMA)",
  "Tate Modern",
  "Acropolis Museum",
  "Egyptian Museum",
  "National Museum of Anthropology",
  "National Gallery of Art",
  "Pergamon Museum",
  "Topkapı Palace Museum",
  "Galleria dell'Accademia",
  "Reina Sofía",
  "Georgian National Museum",
  "Shalva Amiranashvili Museum of Fine Arts",
  "Dimitri Shevardnadze National Gallery",
  "Open Air Museum of Ethnography",
  "Galleria Borghese",
  "Capitoline Museums",
  "National Roman Museum",
  "Istanbul Archaeology Museums",
  "Istanbul Modern",
  "Pera Museum",
];

// City context for museums (used by /api/photo to disambiguate).
// Falling back to the museum name itself when unknown — the endpoint
// is tolerant of empty city.
const MUSEUM_CITY = new Map([
  ["Louvre", "Paris"],
  ["British Museum", "London"],
  ["Metropolitan Museum of Art", "New York"],
  ["Vatican Museums", "Rome"],
  ["State Hermitage Museum", "Saint Petersburg"],
  ["Uffizi Gallery", "Florence"],
  ["Prado Museum", "Madrid"],
  ["National Gallery", "London"],
  ["Rijksmuseum", "Amsterdam"],
  ["Musée d'Orsay", "Paris"],
  ["Museum of Modern Art (MoMA)", "New York"],
  ["Tate Modern", "London"],
  ["Acropolis Museum", "Athens"],
  ["Egyptian Museum", "Cairo"],
  ["National Museum of Anthropology", "Mexico City"],
  ["National Gallery of Art", "Washington"],
  ["Pergamon Museum", "Berlin"],
  ["Topkapı Palace Museum", "Istanbul"],
  ["Galleria dell'Accademia", "Florence"],
  ["Reina Sofía", "Madrid"],
  ["Georgian National Museum", "Tbilisi"],
  ["Shalva Amiranashvili Museum of Fine Arts", "Tbilisi"],
  ["Dimitri Shevardnadze National Gallery", "Tbilisi"],
  ["Open Air Museum of Ethnography", "Tbilisi"],
  ["Galleria Borghese", "Rome"],
  ["Capitoline Museums", "Rome"],
  ["National Roman Museum", "Rome"],
  ["Istanbul Archaeology Museums", "Istanbul"],
  ["Istanbul Modern", "Istanbul"],
  ["Pera Museum", "Istanbul"],
]);

// ─── Helpers ────────────────────────────────────────────────────────

/** Mirror of `attractionSlug()` from src/lib/api.ts — kebab-case ASCII slug. */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function lookupPhotoUrl(name, city) {
  const params = new URLSearchParams({
    q: name,
    lang: "en",
  });
  if (city) params.set("city", city);
  const res = await fetch(`${BASE}/api/photo?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`/api/photo returned HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.url ?? null;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Lokali-PhotoDownloader/1.0 (lokaliapps@gmail.com)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return buf.length;
}

function fileExtFromContentType(url) {
  // Try to grab from URL first; fall back to .jpg.
  const m = url.match(/\.(jpg|jpeg|png|webp)(?:\?.*)?$/i);
  if (m) return `.${m[1].toLowerCase().replace("jpeg", "jpg")}`;
  return ".jpg";
}

async function processOne(category, name, cityHint) {
  const slug = slugify(name);
  const destDir = join(ROOT, "public", "images", category);
  await mkdir(destDir, { recursive: true });
  // Pre-decide the destination filename; we'll write the actual bytes
  // after looking up the URL (the extension may need adjusting).
  let destPath = join(destDir, `${slug}.jpg`);
  if (SKIP_EXISTING && (await fileExists(destPath))) {
    console.log(`[skip] ${category}/${slug}.jpg — already present`);
    return { skipped: true };
  }
  try {
    const url = await lookupPhotoUrl(name, cityHint);
    if (!url) {
      console.warn(`[miss] ${category}/${slug} — /api/photo returned no URL`);
      return { missed: true };
    }
    const ext = fileExtFromContentType(url);
    destPath = join(destDir, `${slug}${ext}`);
    const bytes = await downloadImage(url, destPath);
    const kb = (bytes / 1024).toFixed(0);
    console.log(`[ok]   ${category}/${slug}${ext} — ${kb} KB`);
    return { ok: true, bytes };
  } catch (err) {
    console.error(
      `[err]  ${category}/${slug} — ${err instanceof Error ? err.message : err}`,
    );
    return { err: true };
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`Lokali hero-photo downloader`);
  console.log(`  base: ${BASE}`);
  console.log(
    `  scope: ${CITIES_ONLY ? "cities only" : MUSEUMS_ONLY ? "museums only" : "cities + museums"}`,
  );
  console.log(`  skip existing: ${SKIP_EXISTING ? "yes" : "no"}`);
  console.log();

  const results = { ok: 0, missed: 0, err: 0, skipped: 0, bytes: 0 };

  if (!MUSEUMS_ONLY) {
    console.log(`— Cities (${CITIES.length}) —`);
    for (const city of CITIES) {
      const r = await processOne("cities", city, city);
      if (r.ok) {
        results.ok += 1;
        results.bytes += r.bytes;
      } else if (r.missed) results.missed += 1;
      else if (r.err) results.err += 1;
      else if (r.skipped) results.skipped += 1;
    }
    console.log();
  }

  if (!CITIES_ONLY) {
    console.log(`— Museums (${MUSEUMS.length}) —`);
    for (const museum of MUSEUMS) {
      const r = await processOne(
        "museums",
        museum,
        MUSEUM_CITY.get(museum) ?? "",
      );
      if (r.ok) {
        results.ok += 1;
        results.bytes += r.bytes;
      } else if (r.missed) results.missed += 1;
      else if (r.err) results.err += 1;
      else if (r.skipped) results.skipped += 1;
    }
    console.log();
  }

  const mb = (results.bytes / 1024 / 1024).toFixed(2);
  console.log(`Done — ok: ${results.ok}, missed: ${results.missed}, err: ${results.err}, skipped: ${results.skipped}, total: ${mb} MB`);
  if (results.missed > 0 || results.err > 0) {
    console.log(
      `\nSome tiles couldn't be downloaded. Re-run with --skip-existing to retry only the failures.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
