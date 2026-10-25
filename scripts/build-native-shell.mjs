#!/usr/bin/env node
/**
 * Builds the tiny local web bundle that the native iOS shell ships with.
 * Beka 2026-10-25, iOS launch.
 *
 * Why this exists:
 *   The app loads https://lokali.travel (capacitor.config.json →
 *   server.url). The ONLY local file the WebView ever shows is
 *   `offline.html` — Capacitor's `server.errorPath`, rendered when the
 *   site can't load. So the native bundle needs exactly three files:
 *
 *     offline.html      — the offline Saved-tours page (bridge inlined)
 *     native-bridge.js  — same bridge as a file (offline.html also
 *                         references /native-bridge.js)
 *     index.html        — never shown, but `cap sync` refuses to run
 *                         without one in webDir
 *
 *   `vite build` no longer writes to dist/client (the Lovable/Nitro
 *   toolchain now outputs .output/public — ~500 MB, 15k files with all
 *   /explore/ pages). Shipping that inside the iOS app would be pointless
 *   weight, so CI (codemagic.yaml) calls this script instead of
 *   `vite build`.
 *
 * Safe on a developer machine: if `dist/client` already holds a full
 * vite build (has an `assets/` folder), index.html is left alone so a
 * local Android sync keeps working exactly as before.
 *
 * Usage:  node scripts/build-native-shell.mjs [outDir]   (default dist/client)
 */

import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = resolve(ROOT, process.argv[2] ?? "dist/client");

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const offlineSrc = join(ROOT, "public", "offline.html");
const bridgeSrc = join(ROOT, "public", "native-bridge.js");

if (!(await exists(offlineSrc))) {
  console.error(`[native-shell] ${offlineSrc} is missing — cannot build the native shell.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

await copyFile(offlineSrc, join(OUT, "offline.html"));
console.log(`[native-shell] offline.html → ${OUT}`);

if (await exists(bridgeSrc)) {
  await copyFile(bridgeSrc, join(OUT, "native-bridge.js"));
  console.log(`[native-shell] native-bridge.js → ${OUT}`);
} else {
  // offline.html carries an inlined copy of the bridge, so this file is
  // a convenience, not a requirement.
  console.warn("[native-shell] public/native-bridge.js not found — offline.html uses its inlined bridge.");
}

const hasViteBuild = await exists(join(OUT, "assets"));
if (hasViteBuild && (await exists(join(OUT, "index.html")))) {
  console.log("[native-shell] full vite build detected — index.html left untouched.");
} else {
  // The shell never displays index.html (server.url wins), so the offline
  // page doubles as it: if the WebView ever did land here, the user sees
  // their saved tours instead of a blank screen.
  await copyFile(offlineSrc, join(OUT, "index.html"));
  console.log(`[native-shell] index.html → ${OUT}`);
}
