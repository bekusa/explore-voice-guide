/**
 * Thin haptic-feedback helper. On native (Capacitor) this calls
 * `Haptics.impact` with the requested intensity; on the web it
 * falls through to the Vibration API where available, and silently
 * no-ops where it isn't (most desktop browsers, iOS Safari).
 *
 * Why a helper rather than inline imports: every haptic site would
 * otherwise need its own try/catch + dynamic import + platform
 * branch, and the import path is fragile (the @capacitor/haptics
 * module isn't in the web build). Centralising the dance keeps
 * call sites a single line: `void haptic("light")`.
 *
 * Intensity scale (mirrors Capacitor's ImpactStyle):
 *   "light"  — subtle tap. Use for taps, focus changes, scroll
 *              snap moments. Should feel like a fingernail on
 *              plastic.
 *   "medium" — definite tap. Use for state changes (save toggled,
 *              voice changed, page navigated). The "yes, that
 *              registered" feel.
 *   "heavy"  — firm thud. Use sparingly — for primary CTAs
 *              ("Begin journey", "Save my account") and irreversible
 *              actions. Overuse desensitises.
 *
 * Calls are fire-and-forget; the promise never throws.
 */

export type HapticIntensity = "light" | "medium" | "heavy";

let nativeImpactPromise: Promise<((intensity: HapticIntensity) => void) | null> | null = null;

function loadNativeImpact() {
  if (nativeImpactPromise) return nativeImpactPromise;
  nativeImpactPromise = (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return null;
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      const map: Record<HapticIntensity, typeof ImpactStyle.Light> = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      return (intensity: HapticIntensity) => {
        void Haptics.impact({ style: map[intensity] }).catch(() => {});
      };
    } catch {
      // Capacitor not present (shouldn't happen in practice) or the
      // module failed to load — fall through to web vibration.
      return null;
    }
  })();
  return nativeImpactPromise;
}

// Web Vibration API durations (ms) per intensity. Browsers cap at
// 5000ms per pulse but we use ~10-30ms — feels like a tap, not a
// buzzer. iOS Safari ignores navigator.vibrate entirely; that's
// fine, we treat it as a no-op.
const webVibrateMs: Record<HapticIntensity, number> = {
  light: 10,
  medium: 20,
  heavy: 30,
};

/**
 * Trigger a haptic pulse. Safe to call on any platform, any time.
 * Returns a promise that resolves once the call has been dispatched
 * (but not awaited — callers don't need to `await` this).
 */
export async function haptic(intensity: HapticIntensity = "light"): Promise<void> {
  const impact = await loadNativeImpact();
  if (impact) {
    impact(intensity);
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(webVibrateMs[intensity]);
    } catch {
      /* Some browsers (Firefox in private mode) throw — ignore. */
    }
  }
}
