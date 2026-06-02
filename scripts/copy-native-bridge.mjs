#!/usr/bin/env node
/**
 * Copies Capacitor's native-bridge.js into public/ so the bundled
 * `offline.html` (loaded by Capacitor's `server.errorPath` when the
 * device is offline) can load the bridge via
 * `<script src="/native-bridge.js">` and surface `window.Capacitor`
 * to its inline JS.
 *
 * Why this is needed:
 *   Capacitor injects the bridge into pages it serves through the
 *   WebViewLocalServer, but `errorPath` fallback pages don't get
 *   that injection — they're loaded as plain assets. Without the
 *   bridge, offline.html can't read saved tours from
 *   @capacitor/preferences or play audio from @capacitor/filesystem.
 *
 * Idempotent. Runs at the top of every `cap:sync` / `cap:android`
 * script so the public copy stays in lockstep with the installed
 * @capacitor/android version.
 */

import { copyFile, access, mkdir } from "node:fs/promises";
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

try {
  await access(SRC);
} catch {
  console.warn(
    `[copy-native-bridge] source not found at ${SRC} — skipping. ` +
      `This is fine when running outside a Capacitor build (e.g. on the Lovable dev server).`,
  );
  process.exit(0);
}

await mkdir(dirname(DEST), { recursive: true });
await copyFile(SRC, DEST);
console.log(`[copy-native-bridge] copied → ${DEST}`);
