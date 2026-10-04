import { useSyncExternalStore } from "react";
import { getNarrationState, subscribeNarration, type NarrationState } from "@/lib/narrationPlayer";

/**
 * Read the global narration state. Beka 2026-10-04.
 *
 * `useSyncExternalStore` rather than useState+useEffect on purpose:
 * the audio element lives outside React and fires events at any time,
 * including during a navigation when a component is mid-mount. This
 * is exactly the hook React provides for an external mutable source,
 * and it gets the subscribe/teardown ordering right without us
 * hand-rolling it in three components.
 *
 * The server snapshot is the same frozen empty state — there is no
 * audio during SSR, and returning a fresh object there would make
 * React complain about a changing snapshot.
 */
const SERVER_SNAPSHOT: NarrationState = {
  request: null,
  url: null,
  generating: false,
  playing: false,
  paused: false,
  current: 0,
  total: 0,
};

export function useNarration(): NarrationState {
  return useSyncExternalStore(subscribeNarration, getNarrationState, () => SERVER_SNAPSHOT);
}

/** Convenience: is there a narration worth showing a panel for? */
export function useIsNarrating(): boolean {
  return useNarration().request !== null;
}
