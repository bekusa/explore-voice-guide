#!/usr/bin/env node
/**
 * 1. Copies Capacitor's native-bridge.js into public/ (kept for the
 *    Service-Worker precache path — sw.js serves it cache-first on
 *    the lokali.travel origin when offline).
 * 2. INLINES the same bridge into public/offline.html between the
 *    NATIVE-BRIDGE:BEGIN / NATIVE-BRIDGE:END markers.
 *
 * Why the inlining (Beka 2026-07-05, on-device root cause):
 *   Capacitor's `server.errorPath` page renders at https://localhost,
 *   but its `<script src="/native-bridge.js">` subresource request
 *   never resolved on-device — so `window.Capacitor` never appeared
 *   and offline.html showed "Saved tours aren't ready yet" even with
 *   tours saved. Inlining removes the subresource fetch entirely:
 *   the page carries its own bridge and works on ANY origin
 *   (localhost errorPath, SW-served lokali.travel copy, dev server),
 *   with or without network.
 *
 * The inlined block is committed to git. It only changes when
 * @capacitor/android is upgraded — re-run `npm run cap:sync` (this
 * script is its first step) and commit the refreshed offline.html.
 *
 * Idempotent: the marker block is fully regenerated on every run.
 * If the source bridge is missing (e.g. Lovable dev server without
 * node_modules/@capacitor/android) we warn and exit 0 so web builds
 * never break — the committed inline copy stays as-is.
 */

import { copyFile, access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SRC = join(
  ROOT,
  "node_modules",
  "@capacitor",
  "android",
  "capacitor",
  "src",
  "main",
  "assets",
  "native-bridge.js",
);
const DEST = join(ROOT, "public", "native-bridge.js");
const OFFLINE_HTML = join(ROOT, "public", "offline.html");

const MARKER_BEGIN = "<!-- NATIVE-BRIDGE:BEGIN -->";
const MARKER_END = "<!-- NATIVE-BRIDGE:END -->";

try {
  await access(SRC);
} catch {
  console.warn(
    `[copy-native-bridge] source not found at ${SRC} — skipping. ` +
      `This is fine when running outside a Capacitor build (e.g. on the Lovable dev server); ` +
      `the committed inline copy in offline.html remains in effect.`,
  );
  process.exit(0);
}

// ── 1. Copy to public/ (Service-Worker precache path) ──
await mkdir(dirname(DEST), { recursive: true });
await copyFile(SRC, DEST);
console.log(`[copy-native-bridge] copied → ${DEST}`);

// ── 2. Inline into offline.html between the markers ──
let bridgeJs = await readFile(SRC, "utf8");

// A literal "</script" inside the inlined JS would terminate the
// <script> element early and truncate the bridge (classic HTML
// script-data hazard). In valid JS it can only occur inside string
// literals, where "<\/script" is byte-for-byte equivalent — so the
// blanket replace is safe.
bridgeJs = bridgeJs.replace(/<\/script/gi, "<\\/script");

let html = await readFile(OFFLINE_HTML, "utf8");
const beginIdx = html.indexOf(MARKER_BEGIN);
const endIdx = html.indexOf(MARKER_END);
if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
  console.warn(
    `[copy-native-bridge] markers not found in ${OFFLINE_HTML} — ` +
      `inline step skipped. Expected "${MARKER_BEGIN}" … "${MARKER_END}".`,
  );
  process.exit(0);
}

const before = html.slice(0, beginIdx + MARKER_BEGIN.length);
const after = html.slice(endIdx);
const inlined =
  "\n    <script>\n" +
  "      /* Inlined by scripts/copy-native-bridge.mjs — do not edit. */\n" +
  bridgeJs +
  "\n    </script>\n    ";

await writeFile(OFFLINE_HTML, before + inlined + after, "utf8");
console.log(
  `[copy-native-bridge] inlined bridge (${(bridgeJs.length / 1024).toFixed(0)} KB) → ${OFFLINE_HTML}`,
);
