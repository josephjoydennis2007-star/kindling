/**
 * Kindling service worker.
 *
 * Strategy:
 *   - On install: pre-cache the app shell (index + manifest + icon).
 *   - On fetch:
 *       - Same-origin GET requests use stale-while-revalidate so the app
 *         stays fully usable offline after one successful load.
 *       - Everything else (POST, third-party APIs like OpenAI / Firebase /
 *         GitHub) is passed straight through to the network.
 *
 * Bump CACHE_NAME when shipping breaking changes.
 */

const CACHE_NAME = 'kindling-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // pass-through

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
