// Minimal installability service worker (ADR-0028).
//
// Its entire job is to (1) satisfy Chrome's install requirement — HTTPS + valid
// manifest + a registered SW with a fetch handler — and (2) make offline a
// meaningful branded page instead of the browser's error screen.
//
// It is deliberately NETWORK-ONLY for navigations and has NO cache-write path for
// them. Under ADR-0022 the browser never calls /api/*; authenticated data is
// rendered into the navigation/RSC payload server-side, so caching a navigation
// would write one user's private record to disk where the next user of a shared
// device could be served it. The only thing precached is the static, unauthed
// /offline page. The full caching matrix (Cache First shell, SWR images) is a
// separate, deferred layer — do not add runtime caching of navigations here
// without the sign-out purge analysis ADR-0028 calls out.

const CACHE_VERSION = "pulse-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // Precache only the offline fallback so it is available with no network.
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop caches from prior versions, then take control of open clients.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only navigations are handled — everything else (assets, images, RSC data
  // fetches) falls through to the network untouched. Navigations go to the
  // network every time and are never cached; on network failure we serve the
  // precached offline page rather than a browser error.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { ignoreSearch: true }),
      ),
    );
  }
});
