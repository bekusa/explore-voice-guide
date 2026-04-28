/**
 * Selected destination — persisted in localStorage, with optional
 * one-shot geolocation auto-detect. Designed to be SSR-safe: all
 * localStorage / navigator access is guarded behind `typeof window`.
 */

import {
  DEFAULT_DESTINATION_SLUG,
  DESTINATIONS,
  getDestination,
  nearestDestination,
  type Destination,
} from "./destinations";

const KEY_SLUG = "whispers.destination.slug";
const KEY_AUTODETECT = "whispers.destination.autodetected";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function getSelectedSlug(): string {
  if (typeof window === "undefined") return DEFAULT_DESTINATION_SLUG;
  try {
    return (
      localStorage.getItem(KEY_SLUG) ?? DEFAULT_DESTINATION_SLUG
    );
  } catch {
    return DEFAULT_DESTINATION_SLUG;
  }
}

export function getSelectedDestination(): Destination {
  return (
    getDestination(getSelectedSlug()) ??
    getDestination(DEFAULT_DESTINATION_SLUG)!
  );
}

export function setSelectedSlug(slug: string) {
  if (typeof window === "undefined") return;
  if (!DESTINATIONS.find((d) => d.slug === slug)) return;
  try {
    localStorage.setItem(KEY_SLUG, slug);
    emit();
  } catch {
    // ignore (private mode etc.)
  }
}

export function onDestinationChange(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * One-shot geolocation. Resolves to the nearest destination, persists it,
 * but only the first time (so manual selections aren't overwritten).
 */
export function autoDetectDestination(): Promise<Destination | null> {
  return new Promise((resolve) => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      resolve(null);
      return;
    }
    let alreadyDetected = false;
    try {
      alreadyDetected = !!localStorage.getItem(KEY_AUTODETECT);
    } catch {
      // ignore
    }
    if (alreadyDetected) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = nearestDestination({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        try {
          localStorage.setItem(KEY_AUTODETECT, "1");
          // Only override if the user hasn't picked something else first.
          if (!localStorage.getItem(KEY_SLUG)) {
            localStorage.setItem(KEY_SLUG, nearest.slug);
            emit();
          }
        } catch {
          // ignore
        }
        resolve(nearest);
      },
      () => resolve(null),
      { timeout: 6000, maximumAge: 1000 * 60 * 60 * 24 },
    );
  });
}
