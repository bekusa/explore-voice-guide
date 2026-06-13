import { useEffect, useRef, useState } from "react";

/**
 * Track network connectivity. Returns true when online or when the runtime
 * doesn't expose `navigator.onLine` (we assume online to avoid false negatives).
 *
 * Debouncing rationale (Beka 2026-06-11 audit fix):
 *   Without debounce, a cellular handoff or a tunnel pass-through fires
 *   alternating online/offline events at sub-second cadence, which makes
 *   the offline banner blink and triggers expensive re-renders. The
 *   browser's own debouncing is unreliable on Android WebView. We add
 *   a 500 ms trailing debounce — long enough to absorb flap, short
 *   enough that genuine offline transitions feel responsive (the
 *   audio panel's "you're offline" toast lands within half a second).
 */
const DEBOUNCE_MS = 500;

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // First read is immediate — we don't want to render with the
    // default `true` for half a second if the user opened the app
    // while already offline.
    setOnline(navigator.onLine);

    const scheduleUpdate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setOnline(navigator.onLine);
        timerRef.current = null;
      }, DEBOUNCE_MS);
    };

    window.addEventListener("online", scheduleUpdate);
    window.addEventListener("offline", scheduleUpdate);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("online", scheduleUpdate);
      window.removeEventListener("offline", scheduleUpdate);
    };
  }, []);

  return online;
}
