import { useEffect, useState } from "react";
import {
  autoDetectDestination,
  getSelectedDestination,
  onDestinationChange,
} from "@/lib/destinationStore";
import { DEFAULT_DESTINATION_SLUG, getDestination, type Destination } from "@/lib/destinations";

/**
 * Reactive selected-destination hook.
 * - SSR-safe: first render uses the default (Tbilisi), then hydrates client-side.
 * - Triggers a single best-effort geolocation attempt on mount.
 */
export function useSelectedDestination(): Destination {
  const [dest, setDest] = useState<Destination>(() => getDestination(DEFAULT_DESTINATION_SLUG)!);

  useEffect(() => {
    setDest(getSelectedDestination());
    const off = onDestinationChange(() => setDest(getSelectedDestination()));
    // Best-effort: ask once for location to seed the default destination.
    autoDetectDestination();
    return () => {
      off();
    };
  }, []);

  return dest;
}
