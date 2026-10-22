/**
 * Gate 2 — grounding against reference data. Code only, no model calls.
 *
 * Guides: every year in the script should appear in the evidence
 * (Wikipedia text or Wikidata dates). Years that don't are not proof of
 * an error — they are what Gate 3 looks at first.
 *
 * City lists: every item must be a real place near the queried city.
 * Items that fail are DROPPED from the list (the plan's "repair" for
 * lists); a list left with fewer than the minimum is re-rolled.
 */
import { CONFIG } from "./config";
import type { Evidence } from "./evidence";
import { wikiSummary } from "./evidence";
import type { AttractionItem, GuidePayload } from "./generate";
import type { GateResult } from "./gate1";

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Wikidata year string ("-0500", "0537-12-27") → signed number. */
export function wdYear(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(-?)(\d{1,6})/);
  return m ? (m[1] ? -1 : 1) * Number(m[2]) : null;
}

/** Gone = the latest demolition/dissolution is after the latest inception
 *  (Hagia Sophia has P576 for the earlier basilicas, but a later P571). */
export function isGone(wikidata: Record<string, unknown> | undefined): boolean {
  const dis = ((wikidata?.dissolved_or_demolished as unknown[]) ?? []).map(wdYear).filter((x): x is number => x !== null);
  if (!dis.length) return false;
  const inc = ((wikidata?.inception as unknown[]) ?? []).map(wdYear).filter((x): x is number => x !== null);
  return !inc.length || Math.max(...dis) > Math.max(...inc);
}

export function yearsIn(text: string): string[] {
  const years = new Set<string>();
  for (const m of text.matchAll(/\b(1\d{3}|20[0-4]\d)\b(?!\s?(metres|meters|km|kilometres|feet|people|visitors|steps|square))/g)) years.add(m[1]);
  return [...years];
}

export function gate2Guide(g: GuidePayload, ev: Evidence | null): GateResult & { unverifiedYears: string[] } {
  const soft: string[] = [];
  const hard: string[] = [];
  if (!ev || !ev.text) {
    soft.push("no_evidence");
    return { hard, soft, metrics: { evidence_chars: 0 }, unverifiedYears: [] };
  }
  const evidenceText = `${ev.text}\n${JSON.stringify(ev.wikidata)}`;
  const all = [g.script, ...(g.key_facts ?? []), ...(g.tips ?? []), ...(g.look_for ?? [])].join("\n");
  const years = yearsIn(all);
  const unverifiedYears = years.filter((y) => !evidenceText.includes(y));
  if (unverifiedYears.length) soft.push(`years_not_in_evidence:${unverifiedYears.join(",")}`);
  // Wikidata says the place no longer exists, but the guide talks as if the visitor stands in it.
  if (isGone(ev.wikidata)) soft.push("place_no_longer_exists");
  return { hard, soft, metrics: { evidence_chars: ev.text.length, years: years.length, unverified_years: unverifiedYears.length }, unverifiedYears };
}

export async function gate2Attractions(
  list: AttractionItem[],
  city: { lat: number; lng: number } | null,
): Promise<GateResult & { kept: AttractionItem[]; dropped: { name: string; reason: string }[] }> {
  const G = CONFIG.geo;
  const soft: string[] = [];
  const hard: string[] = [];
  const dropped: { name: string; reason: string }[] = [];
  const scored: { item: AttractionItem; dist: number | null }[] = [];

  for (const item of list) {
    const name = String(item.name ?? "");
    const sum = await wikiSummary(name);
    if (!sum.exists) soft.push(`no_enwiki_article:${name}`);
    if (sum.type === "disambiguation") soft.push(`disambiguation_title:${name}`);
    let pos: { lat: number; lng: number } | null =
      typeof item.lat === "number" && typeof item.lng === "number" ? { lat: item.lat, lng: item.lng } : null;
    // A Wikipedia article's own coordinates are a second, independent source.
    const wpos = typeof sum.lat === "number" && typeof sum.lng === "number" ? { lat: sum.lat, lng: sum.lng } : null;
    if (pos && wpos && km(pos, wpos) > 25) soft.push(`coords_disagree:${name}:${Math.round(km(pos, wpos))}km`);
    pos = pos ?? wpos;
    const dist = city && pos ? km(city, pos) : null;
    if (dist !== null && dist > G.maxKmPackaged) {
      dropped.push({ name, reason: `wrong_place:${Math.round(dist)}km` });
      continue;
    }
    if (!sum.exists && !pos) {
      // No article, no coordinates from our table or Nominatim: can't show it exists.
      dropped.push({ name, reason: "unverifiable" });
      continue;
    }
    scored.push({ item, dist });
  }
  // Two items 150 m apart are usually one place and its part (The Motherland Calls ⊂ Mamayev Kurgan).
  for (let i = 0; i < scored.length; i++) for (let j = i + 1; j < scored.length; j++) {
    const a = scored[i].item, b = scored[j].item;
    if (typeof a.lat === "number" && typeof b.lat === "number" && typeof a.lng === "number" && typeof b.lng === "number" && km({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) < 0.15)
      soft.push(`possible_subfeature:${a.name}~${b.name}`);
  }
  // At most N "packaged" day-trip items between maxKm and maxKmPackaged.
  const far = scored.filter((s) => s.dist !== null && s.dist > G.maxKmFromCity).sort((a, b) => (b.dist ?? 0) - (a.dist ?? 0));
  const tooMany = far.slice(0, Math.max(0, far.length - G.maxPackagedItems));
  for (const s of tooMany) dropped.push({ name: String(s.item.name), reason: `too_many_far:${Math.round(s.dist ?? 0)}km` });
  const kept = scored.filter((s) => !tooMany.includes(s)).map((s) => s.item);
  if (dropped.length) soft.push(`dropped:${dropped.map((d) => `${d.name}(${d.reason})`).join(";")}`);
  if (kept.length < CONFIG.attractions.minItems) hard.push(`too_few_after_grounding:${kept.length}`);
  return { hard, soft, metrics: { kept: kept.length, dropped: dropped.length }, kept, dropped };
}
