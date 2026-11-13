/**
 * Wikimedia access for the QA agent: Wikidata entities, SPARQL, Wikipedia REST, Commons.
 *
 * Measured from a cloud IP on 2026-11-01:
 *  - Wikidata Special:EntityData, Wikipedia REST (page/summary, page/media-list), Special:FilePath
 *    and query.wikidata.org/sparql answered 200.
 *  - The Commons Action API (api.php) answered 429 with retry-after 31 s; Commons category HTML
 *    pages answered 200 at ~1 request / 3 s.
 * Everything here paces itself, honours Retry-After and uses one User-Agent. If Beka provides a
 * Wikimedia API token (WIKIMEDIA_TOKEN), it is sent as a Bearer and the limits rise.
 */
import { QA_CONFIG } from "./config";

const UA = QA_CONFIG.userAgent;
const TOKEN = process.env.WIKIMEDIA_TOKEN;

const lastCall: Record<string, number> = {};
const MIN_GAP_MS: Record<string, number> = {
  "commons.wikimedia.org": 3000,
  "query.wikidata.org": 1500,
  "nominatim.openstreetmap.org": 1100,
  "overpass-api.de": 2000,
  default: 400,
};

async function pace(host: string) {
  const gap = MIN_GAP_MS[host] ?? MIN_GAP_MS.default;
  const wait = (lastCall[host] ?? 0) + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall[host] = Date.now();
}

export class RateLimited extends Error {}

/** GET with pacing, UA, optional token, Retry-After backoff (max 4 tries). */
export async function wget(url: string, init: RequestInit = {}, tries = 4): Promise<Response> {
  const host = new URL(url).hostname;
  for (let attempt = 0; attempt < tries; attempt++) {
    await pace(host);
    const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json", ...(init.headers as Record<string, string> | undefined) };
    if (TOKEN && host.endsWith("wikimedia.org") || (TOKEN && host.endsWith("wikipedia.org"))) headers.Authorization = `Bearer ${TOKEN}`;
    const res = await fetch(url, { ...init, headers });
    if (res.status === 429 || res.status === 503) {
      const ra = Number(res.headers.get("retry-after") || 0);
      await new Promise((r) => setTimeout(r, Math.min((ra > 0 ? ra : 5 * (attempt + 1)) * 1000, 60_000)));
      continue;
    }
    return res;
  }
  throw new RateLimited(`rate limited: ${url}`);
}

export async function wjson<T = any>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await wget(url, init);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// ── Wikidata ────────────────────────────────────────────────────────────────────

export type WdEntity = {
  qid: string;
  labels: Record<string, string>;
  aliases: Record<string, string[]>;
  description: string | null;
  sitelinks: Record<string, string>; // "enwiki" → title
  claims: Record<string, any[]>;
};

export async function wdEntity(qid: string): Promise<WdEntity | null> {
  const d = await wjson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const e = d?.entities?.[qid] ?? (d?.entities ? Object.values(d.entities)[0] : null);
  if (!e) return null;
  const labels: Record<string, string> = {};
  for (const [l, v] of Object.entries<any>(e.labels ?? {})) labels[l] = v.value;
  const aliases: Record<string, string[]> = {};
  for (const [l, arr] of Object.entries<any>(e.aliases ?? {})) aliases[l] = arr.map((a: any) => a.value);
  const sitelinks: Record<string, string> = {};
  for (const [site, v] of Object.entries<any>(e.sitelinks ?? {})) sitelinks[site] = v.title;
  return { qid: e.id ?? qid, labels, aliases, description: e.descriptions?.en?.value ?? null, sitelinks, claims: e.claims ?? {} };
}

export const claimValues = (e: WdEntity, prop: string): any[] =>
  (e.claims[prop] ?? []).map((c: any) => c.mainsnak?.datavalue?.value).filter((v: any) => v !== undefined);

export function wdCoord(e: WdEntity): { lat: number; lng: number } | null {
  const v = claimValues(e, "P625")[0];
  return v && Number.isFinite(v.latitude) ? { lat: v.latitude, lng: v.longitude } : null;
}
export const wdItemIds = (e: WdEntity, prop: string): string[] => claimValues(e, prop).map((v: any) => v.id).filter(Boolean);
export const wdStrings = (e: WdEntity, prop: string): string[] => claimValues(e, prop).filter((v: any) => typeof v === "string");

/** Curated image properties, in preference order (see prompt H.9 step 2). P948 is a banner crop. */
export const WD_IMAGE_PROPS = ["P18", "P5775", "P3451", "P8592", "P4291", "P5252", "P8517", "P948"] as const;
export const WD_IMAGE_PROPS_NEVER = ["P94", "P242", "P3311", "P1801", "P2716"] as const;

export async function sparql<T = any>(query: string): Promise<T[]> {
  const res = await wget("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (!res.ok) return [];
  const d: any = await res.json();
  return (d.results?.bindings ?? []).map((b: any) => Object.fromEntries(Object.entries<any>(b).map(([k, v]) => [k, v.value])));
}

// ── Wikipedia REST ──────────────────────────────────────────────────────────────

export type WpSummary = { title: string; wikibase_item?: string; type?: string; coordinates?: { lat: number; lon: number }; originalimage?: { source: string; width: number; height: number }; extract?: string };

export async function wpSummary(lang: string, title: string): Promise<WpSummary | null> {
  return wjson<WpSummary>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
}

export type MediaItem = { title: string; type: string; leadImage?: boolean; showInGallery?: boolean; srcset?: Array<{ src: string; scale: string }>; caption?: { text: string } };

export async function wpMediaList(lang: string, title: string): Promise<MediaItem[]> {
  const d = await wjson(`https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  return (d?.items ?? []).filter((i: MediaItem) => i.type === "image");
}

/** English redirects to an article: what people actually type. Action API; may be rate limited. */
export async function wpRedirectsTo(lang: string, title: string): Promise<string[]> {
  const d = await wjson(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=redirects&rdlimit=100&format=json&formatversion=2&titles=${encodeURIComponent(title)}`);
  return d?.query?.pages?.[0]?.redirects?.map((r: any) => r.title) ?? [];
}

// ── Commons ─────────────────────────────────────────────────────────────────────

export type CommonsInfo = {
  file: string; url: string; width: number; height: number; mime: string; size: number;
  author: string | null; licence: string | null; licenceUrl: string | null; date: string | null; categories: string[]; description: string | null;
};

/** imageinfo + extmetadata for up to 50 files. Action API (rate limited from cloud IPs). */
export async function commonsInfo(files: string[]): Promise<CommonsInfo[]> {
  const out: CommonsInfo[] = [];
  for (let i = 0; i < files.length; i += 50) {
    const titles = files.slice(i, i + 50).map((f) => (f.startsWith("File:") ? f : `File:${f}`)).join("|");
    const d = await wjson(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo|categories&iiprop=url|size|mime|extmetadata&cllimit=50&format=json&formatversion=2&titles=${encodeURIComponent(titles)}`);
    for (const p of d?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const em = ii.extmetadata ?? {};
      const strip = (s?: string) => (s ? s.replace(/<[^>]+>/g, "").trim() : null);
      out.push({
        file: p.title.replace(/^File:/, ""), url: ii.url, width: ii.width, height: ii.height, mime: ii.mime, size: ii.size,
        author: strip(em.Artist?.value), licence: em.LicenseShortName?.value ?? null, licenceUrl: em.LicenseUrl?.value ?? null,
        date: em.DateTimeOriginal?.value ?? em.DateTime?.value ?? null,
        categories: (p.categories ?? []).map((c: any) => c.title.replace(/^Category:/, "")),
        description: strip(em.ImageDescription?.value),
      });
    }
  }
  return out;
}

/** Files in a Commons category (direct members). */
export async function commonsCategoryFiles(category: string, limit = 200): Promise<string[]> {
  const d = await wjson(`https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtype=file&cmlimit=${limit}&format=json&formatversion=2&cmtitle=${encodeURIComponent(`Category:${category}`)}`);
  return d?.query?.categorymembers?.map((m: any) => m.title.replace(/^File:/, "")) ?? [];
}

/** Files whose structured data says "depicts (P180) <QID>". */
export async function commonsDepicting(qid: string, limit = 100): Promise<string[]> {
  const d = await wjson(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=${limit}&format=json&formatversion=2&srsearch=${encodeURIComponent(`haswbstatement:P180=${qid}`)}`);
  return d?.query?.search?.map((s: any) => s.title.replace(/^File:/, "")) ?? [];
}

/** Geotagged files near a point. */
export async function commonsGeosearch(lat: number, lng: number, radiusM: number, limit = 100): Promise<string[]> {
  const d = await wjson(`https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gsnamespace=6&gsradius=${Math.min(radiusM, 10000)}&gslimit=${limit}&format=json&formatversion=2&gscoord=${lat}|${lng}`);
  return d?.query?.geosearch?.map((g: any) => g.title.replace(/^File:/, "")) ?? [];
}

/** The project's size method: Special:FilePath?width=N → the rendition URL (never upscales, never 400). */
export async function filePathRendition(file: string, width: number, project = "commons.wikimedia.org"): Promise<string | null> {
  const res = await wget(`https://${project}/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`, { method: "HEAD", redirect: "follow" });
  if (!res.ok || !res.url.startsWith("https://")) return null;
  return res.url.split("?")[0];
}

/** Base Commons filename from any upload./thumb. URL. */
export function commonsFileFromUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/[a-z-]+\/(?:thumb\/)?\w\/\w\w\/([^/?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).replace(/^\d+px-/, ""); } catch { return m[1]; }
}

// ── OSM ─────────────────────────────────────────────────────────────────────────

export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Element(s) tagged wikidata=<QID>. Free, slow; one request at a time. */
export async function osmByWikidata(qid: string): Promise<OsmElement[]> {
  const q = `[out:json][timeout:25];(node["wikidata"="${qid}"];way["wikidata"="${qid}"];relation["wikidata"="${qid}"];);out center tags;`;
  const res = await wget("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}` });
  if (!res.ok) return [];
  const d: any = await res.json();
  return d.elements ?? [];
}

export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
