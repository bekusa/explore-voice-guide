/**
 * checks/photos.ts — the photo audit for one unit (prompt section H).
 *
 * Inventory → liveness → source mapping → identity (QID) → metadata → vision → dedupe → order →
 * count (search the ladder when < 3) → size (the shrink-blobs method) → write.
 *
 * Scope guard: artwork rows ('artwork|…' keys, museum catalogue hosts, museum highlights) are never
 * touched. Google-sourced photos (600 px by design) are judged by vision only and never shrunk.
 *
 * Writes need AZURE_SAS (Read+Write, no delete). Without it the check records candidates and stops.
 */
import { normalizeName } from "@/lib/cacheKey";
import { blobNameForUrl } from "@/lib/azureBlob.server";
import { classifyImage } from "../vision";
import { QA_CONFIG } from "../config";
import { db, DRY_RUN } from "../db";
import { commonsDepicting, commonsCategoryFiles, commonsFileFromUrl, commonsGeosearch, commonsInfo, filePathRendition, wdEntity, wdStrings, wget, wpMediaList, kmBetween, WD_IMAGE_PROPS, type CommonsInfo } from "../wiki";
import type { CheckResult, Finding, Unit } from "../types";

const MUSEUM_HOSTS = /moma\.org|metmuseum\.org|gem\.eg|museivaticani\.va|uffizi\.it|datocms-assets\.com|musee-orsay\.fr|epmoo\.fr|louvre\.fr|theacropolismuseum\.gr|nationalgallery\.org\.uk|rijksmuseum\.nl|micr\.io|npm\.edu\.tw|si\.edu/i;
const BAD_FILE = /(^|[^a-z])(map|karte|mapa|carte|mappa|locator|plan|diagram|scheme|schema|logo|flag|coat[_ ]of[_ ]arms|wappen|escudo|blason|engraving|lithograph|drawing|sketch|painting|render|reconstruction|model|collage|montage|postcard|panorama[_ ]18|\d{2}px)/i;
const BAD_CATEGORY = /maps|plans|diagrams|drawings|engravings|paintings|postcards|black and white|monochrome|coats of arms|flags|logos|renderings|reconstructions|scale models|historical images|photographs taken on (1[0-9]{3})/i;
const FREE_LICENCE = /^(cc0|public domain|pd|cc[- ]by(-sa)?(-[0-9.]+)?|cc by|cc by-sa)/i;

type Slide = {
  blob: string | null;          // current Azure URL (null for a new candidate)
  source: string | null;        // upstream URL
  file: string | null;          // Commons filename
  origin: "single" | "gallery" | "candidate";
  proven: boolean;
  info?: CommonsInfo;
  bytes?: number;
  vision?: string;              // classification label
  verdict: "keep" | "replace" | "remove" | "add" | "shrink" | "unresolved" | "rejected" | "candidate";
  reason?: string;
  year?: number | null;
};

export type PhotoAudit = { slides: Slide[]; findings: Finding[]; costUsd: number; calls: number; written: boolean; shortage: boolean };

const yearOf = (d: string | null | undefined) => { const m = d?.match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : null; };
const isArtworkScope = (unit: Unit) => unit.photos.single.some((p) => (p.url ?? "").match(MUSEUM_HOSTS) || (p.source_url ?? "").match(MUSEUM_HOSTS));

async function head(url: string): Promise<{ ok: boolean; bytes: number; type: string }> {
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0", "User-Agent": QA_CONFIG.userAgent } });
    const type = r.headers.get("content-type") ?? "";
    const len = r.headers.get("content-range")?.split("/")[1] ?? r.headers.get("content-length") ?? "0";
    return { ok: r.ok && type.startsWith("image/"), bytes: Number(len) || 0, type };
  } catch { return { ok: false, bytes: 0, type: "" }; }
}

/** 1. Inventory: the exact slide list a fresh visitor gets (single first, then gallery, deduped). */
function inventory(unit: Unit): Slide[] {
  const slides: Slide[] = [];
  const seen = new Set<string>();
  const push = (blob: string, source: string | null, origin: Slide["origin"]) => {
    const file = source ? commonsFileFromUrl(source) : null;
    const key = file ?? blob;
    if (seen.has(key)) return;
    seen.add(key);
    slides.push({ blob, source, file, origin, proven: false, verdict: "keep" });
  };
  for (const p of unit.photos.single) if (p.url && !p.not_found) for (const u of p.url.split("\n")) if (u.trim()) push(u.trim(), p.source_url, "single");
  for (const p of unit.photos.gallery) if (p.url && !p.not_found) for (const u of p.url.split("\n")) if (u.trim()) push(u.trim(), null, "gallery");
  return slides;
}

/** 3. Map gallery blobs (no source_url) back to Commons files via blobNameForUrl() over candidates. */
async function mapSources(slides: Slide[], candidateFiles: Map<string, CommonsInfo>) {
  const unmapped = slides.filter((s) => s.blob && !s.source && s.blob.includes("blob.core.windows.net"));
  if (!unmapped.length) return;
  const byBlobName = new Map<string, CommonsInfo>();
  for (const info of candidateFiles.values()) {
    for (const ct of ["image/jpeg", "image/png", "image/webp"]) byBlobName.set(await blobNameForUrl(info.url, ct), info);
    // The app also mirrored 1280px thumbs; blobNameForUrl collapses upload.* thumbs but not thumb.* host.
    const thumbHost = info.url.replace("https://upload.wikimedia.org", "https://thumb.wikimedia.org");
    byBlobName.set(await blobNameForUrl(thumbHost, "image/jpeg"), info);
  }
  for (const s of unmapped) {
    const name = s.blob!.split("/").pop()!;
    const info = byBlobName.get(name);
    if (info) { s.source = info.url; s.file = info.file; s.info = info; }
  }
}

/** 5. Metadata rejections. */
function metadataVerdict(info: CommonsInfo, isGoogle: boolean): string | null {
  if (BAD_FILE.test(info.file)) return `filename: ${info.file}`;
  if (info.categories.some((c) => BAD_CATEGORY.test(c))) return `category: ${info.categories.find((c) => BAD_CATEGORY.test(c))}`;
  if (/svg|gif/.test(info.mime)) return `mime ${info.mime}`;
  if (!isGoogle && info.width < QA_CONFIG.photos.minWidth.wikimedia) return `width ${info.width} < ${QA_CONFIG.photos.minWidth.wikimedia}`;
  const y = yearOf(info.date);
  if (y && y < QA_CONFIG.photos.minYear) return `taken ${y}`;
  if (info.licence && !FREE_LICENCE.test(info.licence)) return `licence ${info.licence}`;
  return null;
}

/** 6. Vision (vision.ts): candidate thumbnail at ≤512 px vs the P18 reference. */
async function vision(unit: Unit, slide: Slide, referenceUrl: string | null, model: string): Promise<{ label: string; costUsd: number }> {
  const grab = async (url: string) => Buffer.from(await (await wget(url)).arrayBuffer());
  const thumb = slide.file ? (await filePathRendition(slide.file, 512)) ?? slide.blob! : slide.blob!;
  const candidate = await grab(thumb);
  const reference = referenceUrl ? await grab(referenceUrl).catch(() => null) : null;
  const r = await classifyImage({ candidate, reference, place: unit.name, city: unit.city, model });
  return { label: r.label, costUsd: r.costUsd };
}

/** 9. Candidate ladder (free, QID-tied). */
async function candidates(unit: Unit): Promise<Map<string, CommonsInfo>> {
  const files = new Set<string>();
  if (unit.qid) {
    const e = await wdEntity(unit.qid);
    if (e) for (const p of WD_IMAGE_PROPS) for (const f of wdStrings(e, p)) files.add(f);
    if (unit.wiki.p373) for (const f of await commonsCategoryFiles(unit.wiki.p373)) files.add(f);
    for (const f of await commonsDepicting(unit.qid)) files.add(f);
  }
  if (unit.wiki.enTitle) for (const m of await wpMediaList("en", unit.wiki.enTitle)) files.add(m.title.replace(/^File:/, ""));
  const local = Object.entries(unit.wiki.sitelinks).find(([s]) => s !== "enwiki" && s.endsWith("wiki") && s.length <= 7);
  if (local) for (const m of await wpMediaList(local[0].replace(/wiki$/, ""), local[1])) files.add(m.title.replace(/^File:/, ""));
  if (files.size < 10 && unit.wiki.p625) {
    const r = unit.sizeClass === "building" ? QA_CONFIG.photos.geoRadiusM.building : QA_CONFIG.photos.geoRadiusM.site;
    for (const f of await commonsGeosearch(unit.wiki.p625.lat, unit.wiki.p625.lng, r)) files.add(f);
  }
  const infos = await commonsInfo([...files].filter((f) => /\.(jpe?g|png|webp)$/i.test(f)));
  return new Map(infos.map((i) => [i.file, i]));
}

/** 10. Size: HEAD every blob; shrink over-threshold Wikimedia-sourced blobs with the 1280 rendition. */
async function sizeCheck(slides: Slide[], sas: string | null, findings: Finding[]) {
  for (const s of slides) {
    if (!s.blob || s.verdict === "remove" || s.verdict === "rejected") continue;
    const h = await head(s.blob);
    if (!h.ok) { s.verdict = "remove"; s.reason = `broken url (${h.type || "no response"})`; continue; }
    s.bytes = h.bytes;
    const isGoogle = (s.source ?? "").includes("googleusercontent") || (s.source ?? "").includes("googleapis");
    if (isGoogle || !s.file) { if (h.bytes > QA_CONFIG.photos.shrink.minBytes && !s.file) { s.verdict = "unresolved"; s.reason = `>${QA_CONFIG.photos.shrink.minBytes} bytes, no Wikimedia source`; } continue; }
    const tooWide = (s.info?.width ?? 0) > QA_CONFIG.photos.shrink.targetWidth;
    if (h.bytes <= QA_CONFIG.photos.shrink.minBytes && !tooWide) continue;
    const rendition = await filePathRendition(s.file, QA_CONFIG.photos.shrink.targetWidth);
    if (!rendition) { s.verdict = "unresolved"; s.reason = "no 1280 rendition"; continue; }
    if (!sas || DRY_RUN) { s.verdict = "shrink"; s.reason = `would shrink ${h.bytes} B`; continue; }
    const src = await wget(rendition);
    const bytes = Buffer.from(await src.arrayBuffer());
    if (!bytes.length || bytes.length >= h.bytes) continue;
    const before = Buffer.from(await (await fetch(s.blob)).arrayBuffer());
    const put = await fetch(`${s.blob}?${sas.replace(/^\?/, "")}`, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": src.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" }, body: bytes });
    const check = put.ok ? await head(s.blob) : { ok: false, bytes: 0, type: "" };
    if (!put.ok || !check.ok || check.bytes >= h.bytes) {
      await fetch(`${s.blob}?${sas.replace(/^\?/, "")}`, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": h.type || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" }, body: before });
      findings.push({ check: "photos", severity: "soft", detail: `shrink failed for ${s.blob}, old bytes restored`, applied: false });
      continue;
    }
    findings.push({ check: "photos", severity: "info", level: 0, detail: `shrunk ${s.file}: ${h.bytes} → ${bytes.length} B`, applied: true });
    s.verdict = s.verdict === "keep" ? "shrink" : s.verdict;
    s.source = rendition;
  }
}

export async function runPhotos(unit: Unit, opts: { sas: string | null; write: boolean }): Promise<CheckResult & { audit: PhotoAudit }> {
  const findings: Finding[] = [];
  let costUsd = 0, calls = 0;
  if (isArtworkScope(unit)) {
    findings.push({ check: "photos", severity: "info", detail: "artwork photos (museum catalogue) — out of scope, not touched" });
    return { findings, costUsd, calls, audit: { slides: [], findings, costUsd, calls, written: false, shortage: false } };
  }
  const slides = inventory(unit);
  const cands = await candidates(unit);
  await mapSources(slides, cands);
  const p18Url = unit.wiki.p18 ? await filePathRendition(unit.wiki.p18, 512) : null;

  // 4+5: identity by QID (file appears in the QID-tied candidate set) and metadata.
  for (const s of slides) {
    const isGoogle = (s.source ?? "").includes("googleusercontent") || (s.source ?? "").includes("googleapis");
    if (s.file && cands.has(s.file)) { s.proven = true; s.info = cands.get(s.file); }
    else if (s.file && !s.info) { const [info] = await commonsInfo([s.file]); if (info) s.info = info; }
    if (s.info) { const why = metadataVerdict(s.info, isGoogle); if (why) { s.verdict = "remove"; s.reason = why; } s.year = yearOf(s.info.date); }
  }
  // 6: vision on everything still standing (Haiku; Sonnet on reject/unsure).
  for (const s of slides.filter((x) => x.verdict === "keep")) {
    let v = await vision(unit, s, p18Url, QA_CONFIG.photos.visionModel); costUsd += v.costUsd; calls++;
    if (v.label !== "modern_photo_of_subject") { v = await vision(unit, s, p18Url, QA_CONFIG.photos.visionSecondOpinion); costUsd += v.costUsd; calls++; }
    s.vision = v.label;
    if (v.label !== "modern_photo_of_subject") { s.verdict = "remove"; s.reason = `vision: ${v.label}`; }
    else if (!s.proven && p18Url) s.proven = true; // vision match against P18 counts as proof (H.9)
  }
  // 9: fill up to the target from the ladder, best first (QID-tied, wide, recent, quality cats).
  let kept = slides.filter((s) => s.verdict === "keep");
  if (kept.length < QA_CONFIG.photos.targetCount.min) {
    const have = new Set(kept.map((s) => s.file));
    const ranked = [...cands.values()]
      .filter((i) => !have.has(i.file) && !metadataVerdict(i, false))
      .sort((a, b) => Number(/Quality images|Featured pictures|Valued images/.test(b.categories.join())) - Number(/Quality images|Featured pictures|Valued images/.test(a.categories.join())) || (yearOf(b.date) ?? 0) - (yearOf(a.date) ?? 0) || b.width - a.width);
    for (const info of ranked) {
      if (kept.length >= QA_CONFIG.photos.targetCount.max) break;
      const s: Slide = { blob: null, source: info.url, file: info.file, origin: "candidate", proven: true, info, verdict: "candidate", year: yearOf(info.date) };
      let v = await vision(unit, s, p18Url, QA_CONFIG.photos.visionModel); costUsd += v.costUsd; calls++;
      if (v.label !== "modern_photo_of_subject") { v = await vision(unit, s, p18Url, QA_CONFIG.photos.visionSecondOpinion); costUsd += v.costUsd; calls++; }
      s.vision = v.label;
      if (v.label === "modern_photo_of_subject") { s.verdict = "add"; slides.push(s); kept = slides.filter((x) => x.verdict === "keep" || x.verdict === "add"); }
      else { s.verdict = "rejected"; s.reason = `vision: ${v.label}`; slides.push(s); }
    }
  }
  const shortage = kept.length < QA_CONFIG.photos.targetCount.min;
  if (shortage) findings.push({ check: "photos", severity: "soft", detail: `photo_shortage: ${kept.length} good photo(s) after Wikimedia ladder${QA_CONFIG.photos.externalSources.length ? ` — external sources (${QA_CONFIG.photos.externalSources.join(",")}) not yet implemented` : ""}` });

  // 10: size.
  await sizeCheck(slides, opts.sas, findings);

  // Write: upload new candidates, rebuild single + gallery rows for every key, photo alias keys.
  let written = false;
  if (opts.write && opts.sas && !DRY_RUN) {
    const final = slides.filter((s) => ["keep", "add", "shrink"].includes(s.verdict));
    // Order: exterior/overall first — approximated by P18 first, then proven Commons, then Google.
    final.sort((a, b) => Number(b.file === unit.wiki.p18) - Number(a.file === unit.wiki.p18) || Number(b.proven) - Number(a.proven));
    for (const s of final.filter((x) => !x.blob)) {
      const rendition = (await filePathRendition(s.file!, QA_CONFIG.photos.shrink.targetWidth)) ?? s.source!;
      const src = await wget(rendition);
      const ct = src.headers.get("content-type") ?? "image/jpeg";
      const name = await blobNameForUrl(rendition, ct);
      const blob = `https://${QA_CONFIG.azure.account}.blob.core.windows.net/${QA_CONFIG.azure.container}/${name}`;
      const put = await fetch(`${blob}?${opts.sas.replace(/^\?/, "")}`, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": ct, "Cache-Control": "public, max-age=31536000, immutable" }, body: Buffer.from(await src.arrayBuffer()) });
      if (!put.ok) { s.verdict = "unresolved"; s.reason = `azure ${put.status}`; continue; }
      s.blob = blob; s.source = rendition;
    }
    const urls = final.filter((s) => s.blob).map((s) => s.blob!);
    if (urls.length) {
      const now = new Date().toISOString();
      const cities = new Set<string>(["", normalizeName(unit.city), ...unit.photos.single.map((p) => p.cache_key.split("|")[1])]);
      const names = new Set<string>([...unit.names, ...unit.aliases.filter((a) => a.accepted && !a.ambiguous && /^[a-z0-9 ,.'-]+$/.test(a.aliasNormalized)).map((a) => a.aliasNormalized)]);
      const rows: unknown[] = [];
      for (const n of names) for (const c of cities) {
        rows.push({ cache_key: `|${c}||${n}`, url: urls[0], source_url: final.find((s) => s.blob === urls[0])?.source ?? null, not_found: false, updated_at: now });
        rows.push({ cache_key: `gallery|${c}||${n}`, url: urls.join("\n"), source_url: null, not_found: false, updated_at: now });
      }
      await db.upsert("cached_photos", rows, "cache_key");
      written = true;
    }
    for (const s of slides) await db.insert("qa_photos", [{ unit_key: unit.unitKey, blob_url: s.blob, source_url: s.source, file_page: s.file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(s.file)}` : null, author: s.info?.author ?? null, licence: s.info?.licence ?? null, width: s.info?.width ?? null, height: s.info?.height ?? null, bytes_before: s.bytes ?? null, year: s.year ?? null, proven: s.proven, verdict: s.verdict, reason: s.reason ?? s.vision ?? null, slide_index: final.indexOf(s) >= 0 ? final.indexOf(s) : null }]);
  } else if (opts.write && !opts.sas) {
    findings.push({ check: "photos", severity: "hard", detail: "AZURE_SAS missing — photo writes skipped, candidates recorded", applied: false });
  }

  const heroChanged = slides[0]?.verdict !== "keep";
  for (const s of slides.filter((x) => x.verdict !== "keep")) findings.push({ check: "photos", severity: s.verdict === "remove" ? "hard" : "info", level: s.verdict === "shrink" ? 0 : heroChanged && slides.indexOf(s) === 0 ? 2 : 1, detail: `${s.verdict}: ${s.file ?? s.blob} — ${s.reason ?? s.vision ?? ""}`, evidenceUrl: s.file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(s.file)}` : undefined, applied: written });
  return { findings, costUsd, calls, audit: { slides, findings, costUsd, calls, written, shortage } };
}
