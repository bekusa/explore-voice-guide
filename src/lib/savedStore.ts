/**
 * Local offline store for saved attractions + their narrated guide scripts.
 *
 * Why localStorage: works fully offline, no backend round-trip, persists
 * across sessions, and survives airplane mode — exactly what the Saved tab
 * needs. Capped at ~50 items to stay well under the 5MB localStorage budget.
 */

import type { Attraction } from "./api";

export type SavedItem = {
  id: string; // attractionSlug(name)
  name: string;
  language: string;
  savedAt: number;
  attraction: Attraction;
  script?: string; // narrated guide text, cached for offline playback
  imageDataUrl?: string; // optional inlined hero image (base64)
};

const KEY = "tg.saved.v1";
const MAX_ITEMS = 50;
const EVENT = "tg:saved-changed";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getSaved(): SavedItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaved(items: SavedItem[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch (err) {
    // QuotaExceeded — drop oldest and retry once
    if (items.length > 1) {
      try {
        localStorage.setItem(KEY, JSON.stringify(items.slice(0, items.length - 1)));
        window.dispatchEvent(new CustomEvent(EVENT));
      } catch {
        console.warn("Saved store full", err);
      }
    }
  }
}

export function isSaved(id: string): boolean {
  return getSaved().some((s) => s.id === id);
}

export function saveItem(item: SavedItem) {
  const list = getSaved().filter((s) => s.id !== item.id);
  list.unshift(item);
  writeSaved(list);
}

export function updateItem(id: string, patch: Partial<SavedItem>) {
  const list = getSaved();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  writeSaved(list);
}

export function removeItem(id: string) {
  writeSaved(getSaved().filter((s) => s.id !== id));
}

export function clearAll() {
  writeSaved([]);
}

/** Subscribe to changes (cross-tab via storage event, same-tab via custom). */
export function onSavedChange(cb: () => void): () => void {
  if (!isBrowser()) return () => {};
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const custom = () => cb();
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, custom);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, custom);
  };
}
