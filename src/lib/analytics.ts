/**
 * Lokali analytics — thin wrapper around the PostHog browser SDK.
 *
 * PostHog is loaded via the inline loader snippet in `src/routes/__root.tsx`
 * (RootShell <head>), NOT as an npm dependency. That keeps the build/lockfile
 * untouched and means the whole integration ships as plain client JS — which
 * is exactly what we want inside the Capacitor WebView (it just loads
 * lokali.travel, so a web snippet covers both the site AND the Android app
 * with no store re-upload).
 *
 * The snippet installs a queuing stub on `window.posthog` immediately, then
 * swaps in the real library once `array.js` downloads. Because of the stub,
 * every call below is safe to make right away — anything fired before the
 * library finishes loading is queued and replayed.
 *
 * All helpers are browser-only and never throw: on the SSR pass (no `window`)
 * and in the unlikely case the snippet failed to run, they simply no-op so a
 * broken analytics load can never take the app down with it.
 */

type PostHogClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
};

function ph(): PostHogClient | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { posthog?: PostHogClient }).posthog;
}

/**
 * Fire a manual `$pageview`. We disable PostHog's automatic pageview in the
 * snippet (`capture_pageview: false`) and call this from the TanStack Router
 * `onResolved` event instead — the SPA changes routes without full page
 * loads, so the automatic pageview (which fires once, on script load) would
 * badly under-count real navigation.
 */
export function capturePageview(): void {
  ph()?.capture("$pageview");
}

/**
 * Fire a custom product event (e.g. "attraction_opened", "audio_played").
 * Handy later for building funnels; unused surfaces can adopt it gradually.
 */
export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  ph()?.capture(event, properties);
}

/**
 * Tie subsequent events to a signed-in user. We identify by the Supabase
 * user UUID only (pseudonymous) — no email or other PII is sent to PostHog.
 */
export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
  ph()?.identify(distinctId, properties);
}

/**
 * Clear the identity on sign-out so the next person on the same device isn't
 * merged into the previous user's profile.
 */
export function resetAnalytics(): void {
  ph()?.reset();
}
