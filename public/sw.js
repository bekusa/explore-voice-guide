/**
 * Lokali Service Worker — offline app-shell caching.
 *
 * Problem this solves:
 *   Lokali's Capacitor WebView loads `https://lokali.ge` on every cold
 *   start. When the user is offline, the WebView never reaches
 *   lokali.ge → Capacitor's `errorPath: offline.html` kicks in → that
 *   static page has no access to the user's saved tours (stored
 *   locally via @capacitor/filesystem + @capacitor/preferences).
 *   Result: a user who saved a Tbilisi tour for the flight can't
 *   open it on the plane.
 *
 * What this SW does:
 *   Once the user has loaded lokali.ge online ONE time, this SW
 *   caches the app shell (HTML + Vite-bundled JS/CSS) and serves it
 *   from cache when network is down. The cached HTML boots the
 *   normal React app, which then renders `/saved` from local
 *   storage — fully offline.
 *
 * Caching strategy:
 *   1. Navigation requests (HTML)   → NetworkFirst, cache the response
 *   2. Vite assets (/assets/*.js|css|woff|png) → CacheFirst, refresh on miss
 *   3. /api/* server routes         → NetworkOnly, never cache
 *   4. Everything else (favicons, manifest, static images) → StaleWhileRevalidate
 *
 * Cache invalidation:
 *   - Bump `CACHE_VERSION` on every release. Old caches are pruned
 *     on `activate`.
 *   - When NetworkFirst succeeds it always re-caches, so the latest
 *     HTML is on disk for the next offline launch.
 */

const CACHE_VERSION = "lokali-shell-v2";
const RUNTIME_CACHE = "lokali-runtime-v2";

// Minimum set of routes we want to be reachable offline even if the
// user has never visited them. Anything else gets cached lazily.
const PRECACHE_URLS = [
  "/",
  "/saved",
  "/settings",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        // Tolerant precache: some routes might 404 in dev, individual
        // failures shouldn't abort the whole install.
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests. Wikimedia / Google Places /
  // Anthropic etc. should pass through untouched — they have their
  // own caching, and we'd just bloat our cache by mirroring them.
  if (url.origin !== self.location.origin) return;

  // Never cache API routes — these are dynamic (auth-gated, request-
  // specific). The app already handles API failures via
  // `useOnlineStatus` + the offlineStore fallbacks.
  if (url.pathname.startsWith("/api/")) return;

  // 1) Navigation requests → NetworkFirst with HTML fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          // Network down — return the requested page from cache, or
          // fall back to the home shell which contains the same JS
          // bundle and can client-side-route to /saved itself.
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  // 2) Vite-bundled assets → CacheFirst with background refresh.
  if (
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => cached); // graceful — let the browser show its own error
      }),
    );
    return;
  }

  // 3) Everything else (uncommon) → StaleWhileRevalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
