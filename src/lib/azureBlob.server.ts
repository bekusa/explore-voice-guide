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

export function getAzureBlobPublicUrl(blobName: string): string | null {
  const account = env("AZURE_STORAGE_ACCOUNT");
  const container = env("AZURE_STORAGE_CONTAINER");
  if (!account || !container) return null;
  return `https://${account}.blob.core.windows.net/${container}/${encodeURIComponent(blobName)}`;
}

/**
 * Cheap existence check — issues HEAD against the public URL. Returns
 * true on 2xx, false on 404 or any network error. We deliberately
 * accept network glitches as "missing" rather than retrying; the
 * caller can fall through to a fresh upstream fetch + upload.
 */
export async function blobExists(blobName: string): Promise<boolean> {
  const url = getAzureBlobPublicUrl(blobName);
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
): Promise<string | null> {
  const account = env("AZURE_STORAGE_ACCOUNT");
  const key = env("AZURE_STORAGE_KEY");
  const container = env("AZURE_STORAGE_CONTAINER");
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
  const hash = await sha1Hex(url);
  return `${hash}${extForContentType(contentType)}`;
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
