/**
 * Curated destination catalogue — slimmed.
 *
 * History: this used to power three things:
 *  1. The Home hero rotation + featured tours strip
 *  2. The standalone /destination/$slug landing pages (with their
 *     "near you" cards, collection filters, full FeaturedTour arrays)
 *  3. The selected-destination pill ("Where next? Tbilisi, Georgia")
 *     with geolocation-based auto-detect.
 *
 * In the pre-Capacitor cleanup we deleted the entire /destination/$slug
 * UI (DestinationScreen.tsx, NearYouCard.tsx, destination.$slug.tsx)
 * since the home page now sends users straight to /results?q=city —
 * the per-destination landing page was orphaned. That removed the
 * need for FeaturedTour[], Collection metadata, searchDestinations(),
 * destinationsByCollection() and a dozen unused hero image imports.
 *
 * What remains: a compact list of cities the app cares about, with
 * lat/lng for `nearestDestination`, hero URL for the 5 cities in the
 * Home hero rotation, and the lookup helpers HomeScreen +
 * destinationStore + useSelectedDestination still need.
 */

// WebP — converted from the original JPGs in the pre-Capacitor image
// optimization pass (Phase 2.4). ImageMagick @ quality 80 brought the
// 27-image bundle from 4.4 MB → 2.5 MB (-43%) with no visible quality
// loss in the hero frame at 1280×800. Capacitor's mobile WebView
// supports WebP natively on iOS 14+ / Android 4.0+, well below our
// minimum target.
import tbilisiHero from "@/assets/tbilisi-hero.webp";
import romeImg from "@/assets/destinations/rome.webp";

export type Destination = {
  slug: string;
  city: string;
  country: string;
  /**
   * Cinematic hero image — present only for cities in the Home hero
   * rotation. Other cities exist purely for nearest-city geolocation
   * lookup and don't need an image (they'd never be shown).
   */
  hero?: string;
  /** Latitude / longitude — used to find the nearest city via geolocation. */
  lat: number;
  lng: number;
};

/**
 * The 5 cities Beka picked for the Home hero rotation
 * (Tbilisi → Paris → Rome → Bangkok → London) carry full hero images.
 * The remaining cities are kept purely so `nearestDestination`
 * resolves to a sensible "Where next?" pill for users sitting in
 * Istanbul, Kyoto, Lisbon, etc. — they never render visually.
 *
 * Hero images for Paris / Bangkok / London point at curated Unsplash
 * URLs (1280px is plenty for the 100dvh × 420dvw frame at high DPI);
 * Tbilisi and Rome ship local /assets so the launch screen of the
 * default city doesn't depend on the network.
 */
export const DESTINATIONS: Destination[] = [
  // ─── Hero rotation cities (have hero images) ────────────────────
  { slug: "tbilisi", city: "Tbilisi", country: "Georgia", hero: tbilisiHero, lat: 41.7151, lng: 44.8271 },
  { slug: "rome", city: "Rome", country: "Italy", hero: romeImg, lat: 41.9028, lng: 12.4964 },
  {
    slug: "paris",
    city: "Paris",
    country: "France",
    hero: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1280&q=80",
    lat: 48.8566,
    lng: 2.3522,
  },
  {
    slug: "bangkok",
    city: "Bangkok",
    country: "Thailand",
    hero: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1280&q=80",
    lat: 13.7563,
    lng: 100.5018,
  },
  {
    slug: "london",
    city: "London",
    country: "United Kingdom",
    hero: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1280&q=80",
    lat: 51.5074,
    lng: -0.1278,
  },

  // ─── Non-hero cities (nearest-city lookup only, no hero image) ──
  // These exist so a user in, say, Lisbon doesn't get auto-detected
  // to Tbilisi just because that's the only city we know about.
  // If you add an image for one of these, just attach a `hero` field
  // and add the slug to HomeScreen's HERO_ROTATION array.
  { slug: "istanbul", city: "Istanbul", country: "Türkiye", lat: 41.0082, lng: 28.9784 },
  { slug: "kyoto", city: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681 },
  { slug: "lisbon", city: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { slug: "marrakech", city: "Marrakech", country: "Morocco", lat: 31.6295, lng: -7.9811 },
  { slug: "cusco", city: "Cusco", country: "Peru", lat: -13.5319, lng: -71.9675 },
  { slug: "prague", city: "Prague", country: "Czechia", lat: 50.0755, lng: 14.4378 },
  { slug: "cairo", city: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
  { slug: "athens", city: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275 },
  { slug: "edinburgh", city: "Edinburgh", country: "Scotland", lat: 55.9533, lng: -3.1883 },
  { slug: "varanasi", city: "Varanasi", country: "India", lat: 25.3176, lng: 82.9739 },
];

/* ─── Lookups ────────────────────────────────────────────────────── */

export function getDestination(slug: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.slug === slug);
}

/** Great-circle distance (km) — accurate enough for "nearest city". */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestDestination(coords: { lat: number; lng: number }): Destination {
  let best = DESTINATIONS[0];
  let bestD = distanceKm(coords, best);
  for (const d of DESTINATIONS) {
    const dd = distanceKm(coords, d);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

/** Default destination shown before geolocation resolves / on first launch. */
export const DEFAULT_DESTINATION_SLUG = "tbilisi";
