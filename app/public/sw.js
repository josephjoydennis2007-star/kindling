/**
 * Kindling service worker.
 *
 * Strategy:
 *   - On install: pre-cache the app shell.
 *   - On fetch:
 *       - Navigation requests (HTML) use NETWORK-FIRST so a fresh deploy is
 *         picked up on the next refresh, not after a second one. Cached
 *         shell is the fallback only when offline.
 *       - Same-origin hashed assets (CSS / JS bundles, fonts, images) use
 *         stale-while-revalidate — they have unique hashes in their names
 *         so collisions don't happen.
 *       - Everything else (POST, third-party APIs like Firebase / OpenAI /
 *         GitHub) is passed straight through to the network.
 *
 * Bump CACHE_NAME when shipping breaking changes — the activate handler
 * deletes any cache that does not match the current name.
 */

const CACHE_NAME = 'kindling-shell-v41';
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

  // version.json is the update beacon — ALWAYS go to network, never cache, so
  // the app can reliably detect a new deploy and prompt to reload.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => new Response('{}', { headers: { 'content-type': 'application/json' } })));
    return;
  }

  // Network-first for HTML navigations: the app shell must always reflect
  // the latest deploy. We only fall back to cache if the network truly fails.
  const isNavigation = req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate for everything else (hashed assets).
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
