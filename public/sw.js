/**
 * Lokali Service Worker — offline app-shell caching.
 *
 * Problem this solves:
 *   Lokali's Capacitor WebView loads `https://lokali.travel` on every cold
 *   start. When the user is offline, the WebView never reaches
 *   lokali.travel → Capacitor's `errorPath: offline.html` kicks in → that
 *   static page has no access to the user's saved tours (stored
 *   locally via @capacitor/filesystem + @capacitor/preferences).
 *   Result: a user who saved a Tbilisi tour for the flight can't
 *   open it on the plane.
 *
 * What this SW does:
 *   Once the user has loaded lokali.travel online ONE time, this SW
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

const CACHE_VERSION = "lokali-shell-v8";
const RUNTIME_CACHE = "lokali-runtime-v8";

// Minimum set of routes we want to be reachable offline even if the
// user has never visited them. Anything else gets cached lazily.
const PRECACHE_URLS = [
  "/",
  "/saved",
  "/settings",
  "/offline.html",
  // Beka 2026-07-05 — the Capacitor bridge MUST be precached. When the
  // SW serves the cached offline.html on the lokali.travel origin
  // (warm offline start), that page's <script src="/native-bridge.js">
  // is answerable only from this cache — the network is down and
  // Capacitor's native injection doesn't run for SW-served documents.
  // Without this entry the bridge never loads → window.Capacitor never
  // appears → "Saved tours aren't ready yet". NOTE: after upgrading
  // @capacitor/android, bump CACHE_VERSION so the fresh bridge is
  // re-precached (native-bridge.js only changes on Capacitor updates).
  "/native-bridge.js",
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

  // Never cache non-GET requests. The Cache API only supports GET;
  // calling cache.put with a POST/PUT/DELETE request throws
  // "Request method 'X' is unsupported" — which Beka caught in the
  // Android logcat for an auth-flow POST that was hitting the
  // StaleWhileRevalidate branch below. Letting non-GETs pass through
  // is the right behaviour anyway (they're never the app shell).
  if (request.method !== "GET") return;

  // Never cache API routes — these are dynamic (auth-gated, request-
  // specific). The app already handles API failures via
  // `useOnlineStatus` + the offlineStore fallbacks.
  if (url.pathname.startsWith("/api/")) return;

  // Bypass the SW for Capacitor-local plugin assets — those resolve
  // from the WebView's bundled files, never from lokali.travel.
  //
  // Beka 2026-07-05 — /native-bridge.js REMOVED from this bypass.
  // History: the 2026-06-13 change skipped the SW for it because the
  // old CacheFirst branch returned undefined offline (the file was
  // never precached, so cache-miss + network-fail = dead script).
  // But skipping only helped the errorPath (local-origin) case, where
  // the SW isn't involved anyway. In the OTHER offline case — SW
  // serving the cached offline.html on the lokali.travel origin — the
  // bypass sent the bridge request straight to the dead network and
  // offline.html showed "Saved tours aren't ready yet" forever.
  // Root fix: /native-bridge.js is now in PRECACHE_URLS, and the
  // asset branch below serves it cache-first. Online it's fetched
  // fresh into the precache on every SW install; offline it's always
  // servable. The errorPath (localhost) case is untouched — this SW
  // never sees those requests (different origin).
  if (
    url.pathname.startsWith("/capacitor/") ||
    url.pathname.endsWith("/cordova.js") ||
    url.pathname.endsWith("/cordova_plugins.js")
  ) {
    return;
  }

  // 1) Navigation requests → NetworkFirst with HTML fallback.
  //
  // Beka 2026-06-11 audit fixes:
  //   - GUARD cache.put behind response.ok so a Cloudflare 5xx
  //     error page doesn't get cached and served forever on
  //     subsequent offline boots until CACHE_VERSION bumps.
  //   - TERMINAL FALLBACK to /offline.html when neither the
  //     specific URL nor the home shell are cached. Previously
  //     a true first-offline launch returned `undefined` from
  //     respondWith and the WebView surfaced its own ugly
  //     net::ERR page instead of routing to Lokali's offline
  //     shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          // Beka 2026-06-13 — when offline, ALWAYS serve offline.html
          // instead of stale cached React HTML. Reason: deploy
          // changes the hashed CSS / JS chunk filenames, so the
          // cached HTML from an older session references assets that
          // are no longer in cache → React boots with zero styling
          // (white page, plain underlined links). The standalone
          // offline.html has its own inline CSS and reads saved
          // tours from Capacitor Preferences directly — no asset
          // dependency, no broken styling. Final fallback to the
          // home shell is kept only for the unusual case where
          // offline.html isn't in cache yet (true cold first launch
          // before precache completed).
          caches
            .match("/offline.html")
            .then(
              (offline) =>
                offline ||
                caches
                  .match(request)
                  .then((cached) => cached || caches.match("/")),
            ),
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
            // Guard against caching 4xx/5xx asset responses — Beka
            // 2026-06-11 audit. A 404 on a renamed Vite chunk would
            // otherwise lock-in the failure for everyone offline.
            if (response && response.ok) {
              const clone = response.clone();
              caches
                .open(RUNTIME_CACHE)
                .then((cache) => cache.put(request, clone));
            }
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
          if (response && response.ok) {
            const clone = response.clone();
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
