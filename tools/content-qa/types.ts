import type { GuidePayload, AttractionItem } from "../content-factory/generate";

export type { GuidePayload, AttractionItem };

export type GuideRow = {
  id: string;
  name_normalized: string;
  city_normalized: string;
  language: string;
  interest: string;
  payload: GuidePayload;
  hit_count: number;
  updated_at: string;
  payload_md5?: string;
};

export type PhotoRow = { cache_key: string; url: string | null; source_url: string | null; not_found: boolean | null; updated_at: string };
export type PlaceDetailsRow = {
  cache_key: string; name: string; city: string; place_id: string | null; formatted_address: string | null;
  website: string | null; business_status: string | null; opening_periods: unknown; weekday_text: unknown;
  lat: number | null; lng: number | null; not_found: boolean | null; updated_at: string;
};
export type CoordsRow = { name_key: string; lat: number; lng: number; source: string | null; confidence: string | null; ambiguous: boolean | null };
export type ClassificationRow = { query_normalized: string; kind: string; name: string; city: string | null; country: string | null; slug: string | null };
export type ListItemRef = { listId: string; query: string; language: string; index: number; item: AttractionItem & { name_en?: string } };

export type Unit = {
  unitKey: string;
  qid: string | null;
  name: string;            // canonical English name (guide title / factory name)
  city: string;            // city used in the guide key and classification
  country: string | null;
  source: "factory" | "app";
  priority: number | null;
  hits: number;
  /** Every EN editors row carrying this unit's payload (all buckets + aliases). */
  enRows: GuideRow[];
  /** Translated rows (language ≠ en, interest editors) under the same keys. */
  translatedRows: GuideRow[];
  /** EN rows with other interests under the same keys (listed, never deleted). */
  otherInterestRows: GuideRow[];
  enPayload: GuidePayload;
  enPayloadMd5: string;
  /** Distinct (name_normalized, city_normalized) keys of the unit. */
  keys: Array<{ name: string; city: string }>;
  /** Names used in keys and aliases (normalized), for photo/classification lookups. */
  names: string[];
  listItems: ListItemRef[];
  enrichment: ListItemRef | null;
  coords: CoordsRow | null;
  photos: { single: PhotoRow[]; gallery: PhotoRow[] };
  placeDetails: PlaceDetailsRow[];
  classifications: ClassificationRow[];
  wiki: { enTitle: string | null; sitelinks: Record<string, string>; p625: { lat: number; lng: number } | null; p18: string | null; p373: string | null; description: string | null; instanceOf: string[] };
  sizeClass: "building" | "site" | "district" | "nature";
  aliases: AliasRecord[];
};

export type AliasRecord = {
  alias: string;
  aliasNormalized: string;
  language: string | null;
  source: string;
  accepted: boolean;
  ambiguous: boolean;
  reason: string | null;
};

export type Level = 0 | 1 | 2 | 3;

export type Finding = {
  check: "identity" | "facts" | "style" | "look_for" | "tips" | "hours" | "coords" | "photos" | "aliases" | "consistency";
  severity: "hard" | "soft" | "info";
  level?: Level;
  detail: string;
  before?: string;
  after?: string;
  evidenceUrl?: string;
  quote?: string;
  model?: string;
  applied?: boolean;
};

export type CheckResult = {
  findings: Finding[];
  /** Changes the check wants applied. The pipeline applies them after all checks pass gate1. */
  patch?: Partial<GuidePayload>;
  verdictHint?: "REGENERATE" | "REVIEW" | "QUARANTINE";
  costUsd: number;
  calls: number;
};
