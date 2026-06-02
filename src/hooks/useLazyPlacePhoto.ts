import { useEffect, useState } from "react";
import { fetchPlacePhoto, fetchPlaceGallery } from "@/lib/api";

/**
 * Lazily fetch a place photo via /api/photo (Wikipedia → Google
 * Places fallback chain) and return the resolved URL.
 *
 * Replaces a copy-pasted useEffect block that lived inline in five
 * components (results.tsx ResultCard, saved.tsx SavedRow, museums.tsx
 * MuseumPhoto, HomeScreen MuseumThumb, attraction.$id.tsx hero +
 * HighlightCard). They all followed the same pattern: declare a
 * cancellation flag, kick off the fetch, set state on resolve, clean
 * up on unmount. Centralising it here:
 *
 *  - keeps the cancellation semantics correct in one place,
 *  - lets us add request-coalescing / retry / WebView quirks later
 *    without hunting through five files,
 *  - shrinks each consumer to one line + a render check.
 *
 * Usage:
 *   const photo = useLazyPlacePhoto(attraction.name, {
 *     cityHint: city,
 *     skip: !!attraction.image_url,
 *   });
 *
 * Returns:
 *   `null` while loading or if the lookup fails — the caller renders
 *   its own fallback glyph in that case.
 */
export function useLazyPlacePhoto(
  name: string | null | undefined,
  options?: {
    /** Language hint passed through to /api/photo (default "en" —
     * the photo lookup is keyed on the English name across the app
     * so translated UI doesn't fragment the cache). */
    lang?: string;
    /** City context — e.g. searching "Statue of Liberty" inside the
     * "New York" results bucket. Stops Tbilisi's Freedom Square from
     * landing on a NY query. */
    cityHint?: string | null;
    /** Tells /api/photo whether this is an artwork (Met API + skip
     * Google Places' tourist photos) or a regular place. */
    scope?: "artwork";
    /** When scope="artwork", the museum that houses it. Lets the
     * server scope the Wikipedia search to the institution. */
    museumName?: string;
    /** Bail out of the fetch — the caller already has an image
     * (n8n returned `image_url`, the saved row has `imageDataUrl`,
     * etc.). Saves an HTTP call per card. */
    skip?: boolean;
  },
): string | null {
  const lang = options?.lang ?? "en";
  const cityHint = options?.cityHint ?? null;
  const scope = options?.scope;
  const museumName = options?.museumName;
  const skip = options?.skip ?? false;

  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (skip || !name) return;
    // Skip /api/photo when offline — the fetch would throw
    // "TypeError: Failed to fetch" and clutter the console without
    // producing a usable URL (the placeholder gradient handles it).
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let cancelled = false;
    fetchPlacePhoto(name, lang, cityHint, scope, museumName)
      .then((url) => {
        if (cancelled) return;
        if (url) setPhoto(url);
      })
      .catch(() => {
        // Lookup failures fall back to the caller's placeholder glyph.
      });
    return () => {
      cancelled = true;
    };
  }, [name, lang, cityHint, scope, museumName, skip]);

  return photo;
}

/**
 * Lazy variant of {@link useLazyPlacePhoto} that returns the *multi*-
 * photo gallery for the attraction or museum — used by the hero
 * carousel on /attraction/$id and (eventually) any other surface
 * that wants a slideshow instead of a single hero shot.
 *
 * Server-side this goes through /api/photo-gallery which pulls
 * images from Wikipedia's media-list endpoint, filters out flags /
 * logos / plans / signatures, and returns up to 8 URLs at the
 * highest available resolution.
 *
 * Returns:
 *   `[]` while loading or on miss. Caller should treat an empty
 *   array as "fall back to single-photo lookup" and degrade
 *   gracefully — Wikipedia simply doesn't cover every place.
 *
 * Usage:
 *   const photos = useLazyPlaceGallery(museum.name, {
 *     cityHint: museum.city,
 *   });
 *   const slides = photos.length > 1 ? photos : [singleHeroPhoto];
 */
export function useLazyPlaceGallery(
  name: string | null | undefined,
  options?: {
    lang?: string;
    cityHint?: string | null;
    /** Bail without fetching. Same semantics as useLazyPlacePhoto's
     *  `skip` — when the caller already knows the answer. */
    skip?: boolean;
  },
): string[] {
  const lang = options?.lang ?? "en";
  const cityHint = options?.cityHint ?? null;
  const skip = options?.skip ?? false;

  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (skip || !name) return;
    // Offline guard — same rationale as useLazyPlacePhoto above.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let cancelled = false;
    fetchPlaceGallery(name, lang, cityHint)
      .then((result) => {
        if (cancelled) return;
        if (result.length > 0) setUrls(result);
      })
      .catch(() => {
        /* fall through; caller handles empty array */
      });
    return () => {
      cancelled = true;
    };
  }, [name, lang, cityHint, skip]);

  return urls;
}
