/**
 * Offline-first persistence for narrated audio (mp3 blobs from Azure
 * TTS) and accompanying guide scripts.
 *
 * Why this exists separately from localStorage-backed `savedStore`
 * and `guideCache`:
 *  - mp3 blobs are typically 300 KB – 3 MB each. localStorage's 5 MB
 *    total budget would be exhausted by ~2 saved tours; IndexedDB
 *    has effectively no cap. On native Capacitor we route to
 *    Filesystem so storage is bounded only by free device space and
 *    survives app reinstall (under Documents).
 *  - Audio caching is the difference between "Lokali works offline"
 *    and "Lokali pretends to work offline". The user lands in a
 *    plane / subway / mountains and taps Begin journey — without
 *    pre-cached mp3 we'd silently fail. Persisting audio at save
 *    time is the unlock.
 *
 * Two paths, same API:
 *  - Native (Capacitor) → @capacitor/filesystem
 *      mp3:     Documents/lokali/audio/<id>.mp3 (base64-encoded)
 *      script:  Documents/lokali/scripts/<id>.txt
 *  - Web → IndexedDB (single store `files`, keys `audio/<id>` and
 *      `script/<id>`)
 *
 * Both APIs are fully async — callers must `await` or wrap in
 * promise chains. We don't try to be clever with sync fallbacks;
 * IDB and Filesystem are both async by nature and pretending
 * otherwise just produces stale reads.
 */

// ─── Platform detection ─────────────────────────────────────────────

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Subfolder under Capacitor's Directory.Data. We use Data (not
// Documents) because Apple's iOS Documents directory is user-
// visible in the Files app and ours isn't end-user content; Data
// is invisible and survives reinstall on Android too (under the
// app's private storage).
const NATIVE_DIR = "lokali";

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Normalise an ID into a filesystem/idb-safe string. We strip
 * everything but alphanumerics and dashes; the underlying slug
 * convention (kebab-case lowercase) already avoids most exotic
 * characters, but adding a defensive filter here is cheap and
 * blocks Path Traversal attempts (e.g. "../etc/passwd").
 */
function safeId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 200);
}

/**
 * Stable ID for an audio blob, keyed by (attraction slug, language,
 * voice). Different voices for the same attraction produce different
 * blobs — we store them separately so the user can switch voices
 * without losing the previous render.
 */
export function audioId(slug: string, language: string, voice: string): string {
  return safeId(`${slug}-${language}-${voice}`);
}

/**
 * Stable ID for a script. Independent of voice (the text is the
 * same regardless of who reads it).
 */
export function scriptId(slug: string, language: string): string {
  return safeId(`${slug}-${language}`);
}

/** Convert a Blob → raw base64 (no `data:...;base64,` prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:audio/mpeg;base64," prefix — Capacitor
      // Filesystem expects raw base64.
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Reconstruct a Blob from raw base64 (no data: prefix). */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// ─── Native (Capacitor Filesystem) ──────────────────────────────────

async function nativeWriteBlob(path: string, blob: Blob): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const base64 = await blobToBase64(blob);
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  });
}

async function nativeReadBlob(path: string, mimeType: string): Promise<Blob | null> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({ path, directory: Directory.Data });
    return base64ToBlob(result.data as string, mimeType);
  } catch {
    // File-doesn't-exist or read failure — both surface as null so
    // callers fall through to the network-fetch path.
    return null;
  }
}

async function nativeWriteString(path: string, text: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

async function nativeReadString(path: string): Promise<string | null> {
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return result.data as string;
  } catch {
    return null;
  }
}

async function nativeDelete(path: string): Promise<void> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    // Already gone is fine.
  }
}

async function nativeRmDir(path: string): Promise<void> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true });
  } catch {
    /* idempotent */
  }
}

async function nativeListDir(path: string): Promise<string[]> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readdir({ path, directory: Directory.Data });
    // readdir returns { files: [{ name, type, size, ... }] } in recent
    // Capacitor versions; older return string[]. Handle both shapes.
    const files = result.files as Array<string | { name: string }>;
    return files.map((f) => (typeof f === "string" ? f : f.name));
  } catch {
    return [];
  }
}

// ─── Web (IndexedDB) ────────────────────────────────────────────────

const IDB_NAME = "lokali-offline";
const IDB_VERSION = 1;
const STORE = "files";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      // Single object store keyed by string ("audio/<id>" or
      // "script/<id>"). Values are Blob or string — IDB happily
      // stores either as long as we use the structured-clone path
      // (which `put(value, key)` does automatically).
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
  });
}

async function idbPut(key: string, value: Blob | string): Promise<void> {
  const db = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openIDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(): Promise<void> {
  const db = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbKeys(): Promise<string[]> {
  const db = await openIDB();
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Persist an audio blob (typically an Azure TTS mp3 response) so a
 * future playback can read it without hitting the network. Idempotent
 * — re-saving the same id overwrites cleanly.
 */
export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  const safe = safeId(id);
  if (await isNative()) {
    await nativeWriteBlob(`${NATIVE_DIR}/audio/${safe}.mp3`, blob);
  } else {
    await idbPut(`audio/${safe}`, blob);
  }
}

/**
 * Read a previously-saved audio blob and return a temporary blob URL
 * pointing at it. The URL is valid for the lifetime of the document
 * — callers should `URL.revokeObjectURL` it when done to free memory.
 * Returns null if no saved audio exists for this id.
 */
export async function getAudioBlobUrl(
  id: string,
  mimeType = "audio/mpeg",
): Promise<string | null> {
  const safe = safeId(id);
  let blob: Blob | null = null;
  if (await isNative()) {
    blob = await nativeReadBlob(`${NATIVE_DIR}/audio/${safe}.mp3`, mimeType);
  } else {
    blob = await idbGet<Blob>(`audio/${safe}`);
  }
  return blob ? URL.createObjectURL(blob) : null;
}

/** Persist a script (plain-text narration) keyed by id. */
export async function saveScript(id: string, text: string): Promise<void> {
  const safe = safeId(id);
  if (await isNative()) {
    await nativeWriteString(`${NATIVE_DIR}/scripts/${safe}.txt`, text);
  } else {
    await idbPut(`script/${safe}`, text);
  }
}

/** Read a previously-saved script. Null when no such id exists. */
export async function getScript(id: string): Promise<string | null> {
  const safe = safeId(id);
  if (await isNative()) {
    return nativeReadString(`${NATIVE_DIR}/scripts/${safe}.txt`);
  } else {
    return idbGet<string>(`script/${safe}`);
  }
}

/**
 * Remove audio + script for an id. Tolerant of missing files — safe
 * to call when the user hasn't downloaded anything yet for this id.
 */
export async function deleteOfflineItem(audioId: string, scriptId: string): Promise<void> {
  const a = safeId(audioId);
  const s = safeId(scriptId);
  if (await isNative()) {
    await Promise.all([
      nativeDelete(`${NATIVE_DIR}/audio/${a}.mp3`),
      nativeDelete(`${NATIVE_DIR}/scripts/${s}.txt`),
    ]);
  } else {
    await Promise.all([idbDelete(`audio/${a}`), idbDelete(`script/${s}`)]);
  }
}

/** Wipe everything offline-stored. Used by "Clear offline library". */
export async function clearOfflineStore(): Promise<void> {
  if (await isNative()) {
    await nativeRmDir(`${NATIVE_DIR}/audio`);
    await nativeRmDir(`${NATIVE_DIR}/scripts`);
  } else {
    await idbClear();
  }
}

/**
 * Fetch an Azure TTS mp3 for the given script + voice and persist it
 * locally, plus mirror the script text. Used by "Download for offline"
 * flows where the user wants the tour to work without internet later.
 *
 * Returns true on success, false on any failure — callers can toast
 * a friendly "couldn't download" without needing to interpret an
 * error type. We deliberately swallow errors here because downloads
 * are best-effort: the in-app /api/tts path is the primary read,
 * and we don't want to block the UI on a flaky cell connection.
 */
export async function fetchAndCacheTour(args: {
  slug: string;
  script: string;
  language: string;
  voice: string;
}): Promise<boolean> {
  const { slug, script, language, voice } = args;
  if (!script || !voice) return false;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, language, voice }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (blob.size < 500 || !blob.type.toLowerCase().includes("audio")) return false;
    await saveAudioBlob(audioId(slug, language, voice), blob);
    await saveScript(scriptId(slug, language), script);
    return true;
  } catch {
    return false;
  }
}

/**
 * Approximate total bytes used. Best-effort: on native we sum stat
 * sizes of every cached file; on web we serialise IDB values and
 * measure. Exact accounting isn't critical — this drives the
 * "Storage used: 12 MB" line in Settings.
 */
export async function offlineStoreSize(): Promise<number> {
  if (await isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const sum = async (sub: string) => {
        let total = 0;
        const dirs = await nativeListDir(`${NATIVE_DIR}/${sub}`);
        for (const f of dirs) {
          try {
            const st = await Filesystem.stat({
              path: `${NATIVE_DIR}/${sub}/${f}`,
              directory: Directory.Data,
            });
            total += (st as { size?: number }).size ?? 0;
          } catch {
            /* skip */
          }
        }
        return total;
      };
      return (await sum("audio")) + (await sum("scripts"));
    } catch {
      return 0;
    }
  }
  // Web: estimate via navigator.storage if available; fall back to
  // summing IDB values (slow but accurate).
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      return est.usage ?? 0;
    } catch {
      /* fall through */
    }
  }
  try {
    const keys = await idbKeys();
    let total = 0;
    for (const k of keys) {
      const v = await idbGet<Blob | string>(k);
      if (v instanceof Blob) total += v.size;
      else if (typeof v === "string") total += new Blob([v]).size;
    }
    return total;
  } catch {
    return 0;
  }
}
