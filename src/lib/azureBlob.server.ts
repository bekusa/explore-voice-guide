/**
 * Azure Blob Storage helpers — used by /api/photo to mirror upstream
 * photos (Wikipedia / Google Places) into our own blob container.
 * After the first lookup every subsequent request reads from blob
 * directly: no rate limits, no Wikipedia 400s on bad widths, no
 * Google Places signed-URL expiry.
 *
 * Required env vars in the Cloudflare Worker (set in Lovable Project
 * Secrets):
 *   AZURE_STORAGE_ACCOUNT     e.g. "lokaliphotos"
 *   AZURE_STORAGE_KEY         the storage account access key
 *   AZURE_STORAGE_CONTAINER   e.g. "attractions" (must already exist
 *                             with Public access level = Blob)
 *
 * Reads (HEAD / GET) hit the anonymous public URL — no auth needed.
 * Writes (PUT) use Shared Key signing via HMAC-SHA256.
 */

const API_VERSION = "2021-08-06";

function env(name: string): string | null {
  if (typeof process === "undefined") return null;
  return process.env?.[name] ?? null;
}

export function isAzureConfigured(): boolean {
  return !!(env("AZURE_STORAGE_ACCOUNT") && env("AZURE_STORAGE_KEY") && env("AZURE_STORAGE_CONTAINER"));
}

/**
 * Resolve which container to use for a given asset kind. Photos go
 * into the `AZURE_STORAGE_CONTAINER` (default `attractions`) container,
 * audio guides go into `audio` — Beka created this second container
 * specifically for TTS mp3s so disk-usage metrics + lifecycle policies
 * can be tracked separately. Override via env if the names ever
 * change.
 */
function resolveContainer(kind: "photo" | "audio"): string | null {
  if (kind === "audio") {
    return env("AZURE_STORAGE_AUDIO_CONTAINER") ?? "audio";
  }
  return env("AZURE_STORAGE_CONTAINER");
}

export function getAzureBlobPublicUrl(
  blobName: string,
  kind: "photo" | "audio" = "photo",
): string | null {
  const account = env("AZURE_STORAGE_ACCOUNT");
  const container = resolveContainer(kind);
  if (!account || !container) return null;
  return `https://${account}.blob.core.windows.net/${container}/${encodeURIComponent(blobName)}`;
}

/**
 * Cheap existence check — issues HEAD against the public URL. Returns
 * true on 2xx, false on 404 or any network error. We deliberately
 * accept network glitches as "missing" rather than retrying; the
 * caller can fall through to a fresh upstream fetch + upload.
 */
export async function blobExists(
  blobName: string,
  kind: "photo" | "audio" = "photo",
): Promise<boolean> {
  const url = getAzureBlobPublicUrl(blobName, kind);
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Upload bytes to Azure Blob using Shared Key authentication.
 * Returns the public URL on success, null on failure.
 *
 * The signing implementation follows Microsoft's spec for the 2021-08-06
 * REST API — https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key
 */
export async function uploadToAzureBlob(
  blobName: string,
  bytes: Uint8Array,
  contentType: string,
  kind: "photo" | "audio" = "photo",
): Promise<string | null> {
  const account = env("AZURE_STORAGE_ACCOUNT");
  const key = env("AZURE_STORAGE_KEY");
  const container = resolveContainer(kind);
  if (!account || !key || !container) return null;

  const url = `https://${account}.blob.core.windows.net/${container}/${encodeURIComponent(blobName)}`;
  const date = new Date().toUTCString();
  const contentLength = String(bytes.byteLength);

  // Headers we'll send AND that contribute to the canonical string-to-sign.
  // Note: `Content-Length` must NOT be included as an x-ms- header; it
  // sits in its own slot in the string-to-sign.
  const xMsHeaders: Record<string, string> = {
    "x-ms-blob-type": "BlockBlob",
    "x-ms-date": date,
    "x-ms-version": API_VERSION,
  };

  const canonicalizedHeaders = Object.keys(xMsHeaders)
    .sort()
    .map((k) => `${k}:${xMsHeaders[k]}`)
    .join("\n");

  const canonicalizedResource = `/${account}/${container}/${blobName}`;

  // String-to-sign for PUT — 13 newline-separated slots. Order matters
  // exactly; missing fields stay as empty strings.
  const stringToSign = [
    "PUT",
    "", // Content-Encoding
    "", // Content-Language
    contentLength, // Content-Length (or empty if 0)
    "", // Content-MD5
    contentType, // Content-Type
    "", // Date (we use x-ms-date instead)
    "", // If-Modified-Since
    "", // If-Match
    "", // If-None-Match
    "", // If-Unmodified-Since
    "", // Range
    canonicalizedHeaders,
    canonicalizedResource,
  ].join("\n");

  const signature = await hmacSha256Base64(base64ToBytes(key), stringToSign);

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        ...xMsHeaders,
        "Content-Type": contentType,
        "Content-Length": contentLength,
        Authorization: `SharedKey ${account}:${signature}`,
      },
      // Convert to Blob — fetch wants a BodyInit and a raw Uint8Array
      // works in Workers, but wrapping it as a Blob avoids edge cases
      // around streaming uploads on certain runtimes.
      body: new Blob([bytes], { type: contentType }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[azureBlob] PUT failed ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    return url;
  } catch (err) {
    console.warn(`[azureBlob] PUT threw`, err);
    return null;
  }
}

/**
 * Generate a stable, content-addressed blob name for a given upstream
 * URL. Hash collisions are astronomically improbable for SHA-1 over
 * URL strings; the extension keeps `Content-Type: auto` happy on edge
 * caches that inspect filenames.
 */
export async function blobNameForUrl(url: string, contentType: string): Promise<string> {
  // Normalise before hashing so different URL variants pointing at
  // the SAME underlying photo collapse to the SAME blob:
  //  - Wikipedia thumb URLs: strip the `/thumb/` segment + size
  //    suffix → both `…/thumb/3/35/Louvre.jpg/800px-Louvre.jpg` and
  //    `…/thumb/3/35/Louvre.jpg/1280px-Louvre.jpg` collapse to
  //    `…/commons/3/35/Louvre.jpg`.
  //  - Google Places signed URLs: strip the trailing `=…` size param
  //    so re-signs of the same photo_reference dedupe.
  // Falls through to the raw URL when nothing matches so non-Wikipedia
  // / non-Google sources keep their existing behaviour.
  const normalised = normaliseUrlForHash(url);
  const hash = await sha1Hex(normalised);
  return `${hash}${extForContentType(contentType)}`;
}

function normaliseUrlForHash(url: string): string {
  // Wikimedia Commons thumb collapse.
  const wikiThumb = url.match(
    /^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/thumb\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)\/\d+px-[^/?#]+$/i,
  );
  if (wikiThumb) {
    const [, prefix, h1, h2, filename] = wikiThumb;
    return `${prefix}/${h1}/${h2}/${filename}`;
  }
  // Google Places lh3 photo: strip the trailing size selector
  // (`=s1600-w600`, `=w800`, etc.) so different requested sizes
  // collapse to the same blob.
  if (url.includes("googleusercontent.com/")) {
    return url.replace(/=[a-z0-9-]+$/i, "");
  }
  return url;
}

function extForContentType(ct: string): string {
  const lc = ct.toLowerCase();
  if (lc.includes("png")) return ".png";
  if (lc.includes("webp")) return ".webp";
  if (lc.includes("gif")) return ".gif";
  if (lc.includes("svg")) return ".svg";
  // JPEG / unknown — default to .jpg
  return ".jpg";
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetch an upstream photo URL and mirror it into our Azure Blob
 * container. Returns the blob URL on success, the upstream URL on
 * any failure. Used by /api/photo AND /api/photo-gallery so each
 * caller gets identical "mirror once, serve forever" behaviour.
 *
 * Idempotent: if a blob with the same content-addressed name already
 * exists, the HEAD check short-circuits and we skip the upload.
 */
export async function mirrorPhotoToBlob(url: string): Promise<string | null> {
  if (!url || url.startsWith("https://") === false) return null;
  if (url.includes(".blob.core.windows.net/")) return url; // already a blob
  let contentType = "image/jpeg";
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      const ct = head.headers.get("Content-Type");
      if (ct) contentType = ct.split(";")[0].trim();
    }
  } catch {
    /* probe-only — fall back to default image/jpeg below */
  }
  const blobName = await blobNameForUrl(url, contentType);
  if (await blobExists(blobName, "photo")) {
    const cached = getAzureBlobPublicUrl(blobName, "photo");
    if (cached) return cached;
  }
  let bytes: Uint8Array;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Lokali-PhotoMirror/1.0 (https://lokali.ge; lokaliapps@gmail.com)",
        Accept: "image/*",
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 6 * 1024 * 1024) return null;
    bytes = new Uint8Array(buf);
    const respCt = res.headers.get("Content-Type");
    if (respCt) contentType = respCt.split(";")[0].trim();
  } catch {
    return null;
  }
  return uploadToAzureBlob(blobName, bytes, contentType, "photo");
}

async function hmacSha256Base64(keyBytes: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
  return bytesToBase64(new Uint8Array(sig));
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
