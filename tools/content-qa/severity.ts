/**
 * severity.ts — change levels (prompt CHANGE SEVERITY) and what they imply.
 *   0 cosmetic · 1 style · 2 factual (any fact/chip, >30% paragraphs) · 3 critical (place/city, regenerate, policy, misleading tip)
 */
import { QA_CONFIG } from "./config";
import type { Finding, Level } from "./types";

const TEXT_CHECKS = new Set(["identity", "facts", "style", "look_for", "tips", "consistency"]);

export function textLevel(findings: Finding[]): Level {
  return findings.filter((f) => f.applied && TEXT_CHECKS.has(f.check)).reduce<Level>((m, f) => (f.level != null && f.level > m ? (f.level as Level) : m), 0);
}
export function seoLevel(findings: Finding[]): Level {
  return findings.filter((f) => f.applied).reduce<Level>((m, f) => (f.level != null && f.level > m ? (f.level as Level) : m), 0);
}
export const shouldDeleteTranslations = (level: Level) => level >= QA_CONFIG.translations.deleteAtLevel;
export const shouldDeleteTranslatedListRows = (level: Level) => level >= QA_CONFIG.translations.translatedListsDeleteAtLevel;

export function changedParts(findings: Finding[]): string[] {
  const parts = new Set<string>();
  for (const f of findings.filter((x) => x.applied)) {
    if (f.check === "photos") parts.add(f.level === 0 ? "photo_size" : f.level === 2 ? "photo_hero" : "photo_other");
    else if (f.check === "identity") parts.add(f.level === 3 ? "identity" : "city");
    else if (f.check === "facts" || f.check === "style") parts.add("script");
    else parts.add(f.check);
  }
  return [...parts];
}

export function seoAction(parts: string[], verdict: string): "regenerate_page" | "update_photo" | "update_geo" | "redirect" | "unpublish" {
  if (verdict === "QUARANTINE") return "unpublish";
  if (parts.includes("identity") || parts.includes("city")) return "redirect";
  if (parts.some((p) => ["script", "title", "key_facts", "look_for", "tips", "about", "aliases"].includes(p))) return "regenerate_page";
  if (parts.includes("coords")) return "update_geo";
  return "update_photo";
}
