/**
 * Reading text size for the long prose on the attraction page ("About this
 * place", "The story", "The tour"). Beka 2026-11-28: "დაამატე ფონტის
 * გადიდების და შემცირების შესაძლებლობა."
 *
 * One remembered choice for the whole app, kept in localStorage. Four
 * steps; the second is the default and is what every reader saw before
 * the control existed (the three sections were unified to it the same day).
 *
 * Read through useSyncExternalStore with a fixed server snapshot, so the
 * first client render matches the server HTML (the page had a hydration
 * mismatch once already — see the #418 notes in routes/attraction.$id.tsx)
 * and the stored size is applied right after hydration.
 */
import { useSyncExternalStore } from "react";

/** Font sizes in px, smallest to largest. */
export const READING_SIZES = [14, 15.5, 17, 19] as const;
const DEFAULT_STEP = 1;
const KEY = "lokali.readingSize.v1";

let step: number | null = null;
const listeners = new Set<() => void>();

function clamp(n: number): number {
  return Math.min(READING_SIZES.length - 1, Math.max(0, Math.round(n)));
}

function current(): number {
  if (step !== null) return step;
  step = DEFAULT_STEP;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null && raw !== "" && Number.isFinite(Number(raw))) step = clamp(Number(raw));
  } catch {
    /* storage unavailable — keep the default */
  }
  return step;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setReadingStep(next: number): void {
  step = clamp(next);
  try {
    localStorage.setItem(KEY, String(step));
  } catch {
    /* storage unavailable — the change still applies for this session */
  }
  listeners.forEach((fn) => fn());
}

/** The chosen step (0 … READING_SIZES.length - 1). */
export function useReadingStep(): number {
  return useSyncExternalStore(subscribe, current, () => DEFAULT_STEP);
}

/** The chosen size in px, ready for `style={{ fontSize }}`. */
export function useReadingSize(): number {
  return READING_SIZES[useReadingStep()];
}
