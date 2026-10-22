/**
 * Evidence pack for grounding + fact-checking: the English Wikipedia
 * article text plus a few Wikidata facts, fetched once per place and
 * cached in content_evidence.
 *
 * Source choice (tested 2026-10-21 from the cloud container): the Action
 * API and /page/html return 429 from cloud IPs, while /page/mobile-html,
 * /page/summary and Special:EntityData answer. Be polite: one request at a
 * time per worker, identified User-Agent.
 */
import { db, DRY_RUN } from "./db";

const UA = "Lokali-content-factory/1.0 (contact@lokali.travel)";
const DROP_SECTIONS = /^(references|notes|external links|further reading|see also|bibliography|sources|citations|footnotes|gallery)$/i;

export type Evidence = {
  qid: string;
  wiki_title: string;
  text: string;
  wikidata: Record<string, unknown>;
  source: string;
};

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function htmlToText(html: string): string {
  let h = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<sup[^>]*class="[^"]*(reference|mw-ref|noprint)[^"]*"[\s\S]*?<\/sup>/gi, "")
    .replace(/<span[^>]*class="[^"]*mw-ref[^"]*"[\s\S]*?<\/span>/gi, "");
  // Cut at the first trailing apparatus heading (References, External links …)
  const parts = h.split(/(<h[23][^>]*>[\s\S]*?<\/h[23]>)/i);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^<h[23]/i.test(p)) {
      const title = decode(p.replace(/<[^>]+>/g, "")).trim();
      if (DROP_SECTIONS.test(title)) break;
      kept.push(`\n\n## ${title}\n`);
    } else kept.push(p);
  }
  h = kept.join("");
  return decode(
    h
      .replace(/<\/(p|li|tr|div|section|table|h\d)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<td[^>]*>|<th[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\[\d+\]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Wikimedia rate-limits cloud IPs intermittently (429). Back off and retry;
 *  a 404 is an answer, not an error. */
async function politeFetch(url: string, accept = "application/json"): Promise<Response> {
  let last: Response | null = null;
  for (const wait of [0, 2000, 6000, 15000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = await fetch(url, { headers: { "User-Agent": UA, Accept: accept } });
    if (last.ok || last.status === 404) return last;
    if (last.status !== 429 && last.status < 500) return last;
  }
  return last!;
}

export class EvidenceUnavailable extends Error {}

async function getJson(url: string): Promise<any> {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Selected Wikidata facts, labels resolved. Best effort. */
async function wikidataFacts(qid: string): Promise<Record<string, unknown>> {
  const data = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const e = data.entities?.[qid];
  if (!e) return {};
  const claim = (p: string) => (e.claims?.[p] ?? []).map((c: any) => c.mainsnak?.datavalue?.value).filter(Boolean);
  const time = (v: any) => (typeof v?.time === "string" ? v.time.replace(/^\+/, "").replace(/-00-00T.*$|T.*$/, "") : null);
  const ids = (p: string) => claim(p).map((v: any) => v.id).filter(Boolean) as string[];
  const facts: Record<string, unknown> = {
    label: e.labels?.en?.value,
    description: e.descriptions?.en?.value,
    aliases: (e.aliases?.en ?? []).map((a: any) => a.value),
    inception: claim("P571").map(time),
    dissolved_or_demolished: claim("P576").map(time),
    coordinates: claim("P625").map((v: any) => ({ lat: v.latitude, lng: v.longitude })),
    official_website: claim("P856"),
  };
  const refIds: Record<string, string[]> = {
    instance_of: ids("P31"),
    country: ids("P17"),
    located_in: ids("P131"),
    architect: ids("P84"),
    architectural_style: ids("P149"),
    heritage_designation: ids("P1435"),
    named_after: ids("P138"),
    commissioned_by: ids("P88"),
  };
  const all = [...new Set(Object.values(refIds).flat())].slice(0, 50);
  if (all.length) {
    const labels = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${all.join("|")}&props=labels&languages=en&format=json&origin=*`,
    ).catch(() => null);
    const name = (id: string) => labels?.entities?.[id]?.labels?.en?.value ?? id;
    for (const [k, v] of Object.entries(refIds)) facts[k] = v.map(name);
  }
  return facts;
}

export async function getEvidence(qid: string, wikiTitle: string): Promise<Evidence | null> {
  if (!DRY_RUN) {
    const cached = await db.select<Evidence>("content_evidence", `select=*&qid=eq.${encodeURIComponent(qid)}`).catch(() => []);
    if (cached[0]?.text) return cached[0];
  }
  const title = encodeURIComponent(wikiTitle.replace(/ /g, "_"));
  let text = "";
  let missing = false;
  try {
    const res = await politeFetch(`https://en.wikipedia.org/api/rest_v1/page/mobile-html/${title}`, "text/html");
    if (res.ok) text = htmlToText(await res.text());
    else if (res.status === 404) missing = true;
  } catch {
    /* fall through to summary */
  }
  if (!text && !missing) {
    const res = await politeFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
    if (res.ok) text = ((await res.json()) as { extract?: string }).extract ?? "";
    else if (res.status === 404) missing = true;
    // Rate-limited on both: don't let the job go out unchecked — the caller re-queues it.
    else throw new EvidenceUnavailable(`wikipedia ${res.status} for ${wikiTitle}`);
  }
  let wikidata: Record<string, unknown> = {};
  try {
    wikidata = await wikidataFacts(qid);
  } catch {
    /* optional */
  }
  if (!text && Object.keys(wikidata).length === 0) return null;
  const ev: Evidence = { qid, wiki_title: wikiTitle, text: text.slice(0, 120_000), wikidata, source: "enwiki-mobile-html+wikidata" };
  await db.upsert("content_evidence", [{ ...ev, fetched_at: new Date().toISOString() }], "qid").catch(() => null);
  return ev;
}

/** Summary lookup for list items: exists? coordinates? */
export async function wikiSummary(title: string): Promise<{ exists: boolean; type?: string; lat?: number; lng?: number; title?: string } > {
  try {
    const res = await politeFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`);
    if (res.status === 404) return { exists: false };
    if (!res.ok) return { exists: true };
    const s = await res.json();
    return { exists: true, type: s.type, lat: s.coordinates?.lat, lng: s.coordinates?.lon, title: s.title };
  } catch {
    return { exists: true };
  }
}
