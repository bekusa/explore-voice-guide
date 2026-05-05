/**
 * Global "current interest" preference, persisted in localStorage.
 *
 * The attraction page's interest picker writes here; any guide-fetch
 * elsewhere in the app reads from here so the bias stays consistent
 * (open Narikala with "photography" → tap Begin → /player still
 * fetches the photography-biased script). One value, app-wide, single-
 * select. Editor's Pick is the default — see DEFAULT_INTEREST in
 * lib/interests.ts.
 *
 * Why a custom event: the standard "storage" event only fires on OTHER
 * tabs, never the tab that wrote the value. We dispatch our own event
 * so same-tab listeners (the picker chip-row, fetchGuideData, etc.)
 * also see the change immediately.
 */
import { useEffect, useState } from "react";
import { DEFAULT_INTEREST, normalizeInterest } from "./interests";

// v2 — bumped from v1 so users who had legacy "history" persisted from
// the pre-Editor's-Pick era are migrated back to the new default. Beka
// asked: "default კატეგორია უნდა იყოს ყოველთვის Editor's Pick
// ავტომატურად გახსნისას" — first page open should always land on
// Editor's Pick, not a stale value left over from the old picker.
const KEY = "tg.interest.v2";
const EVENT = "tg:interest-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getInterest(): string {
  if (!isBrowser()) return DEFAULT_INTEREST;
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeInterest(raw);
  } catch {
    return DEFAULT_INTEREST;
  }
}

export function setInterest(id: string): void {
  if (!isBrowser()) return;
  const next = normalizeInterest(id);
  try {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* quota / disabled — silent */
  }
}

export function onInterestChange(cb: (next: string) => void): () => void {
  if (!isBrowser()) return () => {};
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb(normalizeInterest(e.newValue));
  };
  const custom = (e: Event) => {
    const detail = (e as CustomEvent<string>).detail;
    cb(normalizeInterest(detail ?? getInterest()));
  };
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, custom);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, custom);
  };
}

/** Reactive hook — re-renders when interest changes (same tab or other). */
export function useInterest(): string {
  const [interest, setLocal] = useState<string>(() => getInterest());
  useEffect(() => onInterestChange(setLocal), []);
  return interest;
}
