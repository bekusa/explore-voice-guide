/**
 * Cross-platform geolocation helper.
 *
 * On the web we hit the browser's `navigator.geolocation`; on native
 * (Capacitor) we route through `@capacitor/geolocation` so we get a
 * proper Android/iOS permission dialog instead of WebView's wonky
 * fallback. Same return shape either way so callers don't need to
 * branch.
 *
 * Permission UX rules of thumb baked in here:
 *   1. Never prompt on app start — the Play Store flags that as a
 *      cold permission gate. Callers prompt on the user gesture
 *      (e.g. tap-to-locate button on /map).
 *   2. Check the current permission state BEFORE calling
 *      getCurrentPosition; that way the friendly "Lokali needs your
 *      location" pre-prompt can intercept first-time use and explain
 *      why, before Android shows its blunt OS dialog.
 *   3. Distinguish "denied" from "denied forever". On the second
 *      tap after a hard deny we deep-link the user to the OS
 *      settings page; nagging the OS dialog after a permanent deny
 *      is a Play Store rejection pattern.
 */

export type LocationCoords = { lat: number; lng: number };
export type LocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "unknown";

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Read the current location permission without prompting. Returns
 * "unknown" when the platform can't tell us (Safari + older Android
 * sometimes refuse the query).
 */
export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  if (await isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    try {
      const status = await Geolocation.checkPermissions();
      // Capacitor returns { location, coarseLocation }. We treat
      // either fine OR coarse as "granted enough" for our needs —
      // distance-to-attraction doesn't need rooftop accuracy.
      const v = status.location;
      if (v === "granted") return "granted";
      if (v === "denied") return "denied";
      if (v === "prompt-with-rationale") return "prompt-with-rationale";
      return "prompt";
    } catch {
      return "unknown";
    }
  }
  // Web: navigator.permissions exists in Chrome/Firefox/Edge; Safari
  // returns 'unknown' or throws — fall through to the runtime
  // getCurrentPosition prompt in that case.
  if (typeof navigator !== "undefined" && navigator.permissions) {
    try {
      const result = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      return result.state as LocationPermissionState;
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

/**
 * Trigger the platform's permission prompt and fetch the user's
 * current coordinates. Throws on denial or timeout — callers should
 * wrap in try/catch and surface a clear toast (the Map page already
 * does this).
 */
export async function getCurrentLocation(opts?: {
  /** ms before we abandon and throw. Default 8000 — matches Map
   *  page's existing geolocation timeout. */
  timeoutMs?: number;
  /** Prefer rooftop-accuracy over network-based when available.
   *  Costs more battery; turn off for "is the user near attraction
   *  X" sanity checks. Default true. */
  highAccuracy?: boolean;
}): Promise<LocationCoords> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const highAccuracy = opts?.highAccuracy ?? true;

  if (await isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    // requestPermissions triggers the native Android/iOS dialog if
    // we don't already have a yes/no answer. On Android 13+ this
    // pops the granular fine-vs-coarse picker; on iOS it shows the
    // "while using the app" / "once" / "don't allow" sheet.
    const perm = await Geolocation.requestPermissions({
      permissions: ["location"],
    });
    if (perm.location !== "granted") {
      throw new Error("LOCATION_DENIED");
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: highAccuracy,
      timeout: timeoutMs,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  // Web fallback.
  return new Promise<LocationCoords>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("LOCATION_UNSUPPORTED"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("LOCATION_DENIED"));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("LOCATION_TIMEOUT"));
        } else {
          reject(new Error("LOCATION_UNAVAILABLE"));
        }
      },
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs },
    );
  });
}
