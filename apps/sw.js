/* National Trading PWA service worker.
   - Navigations + app code (.js/.css): network-first — staff/customers ALWAYS get
     the freshest logic on every load; cache is only a fallback when offline.
   - Images/icons/fonts: stale-while-revalidate (fast, rarely change).
   - /api/* and cross-origin: never cached (always live).
   Bump CACHE to force all clients onto a new version. */
const CACHE = 'ntbf-pwa-v12'; // v12: code files are network-first so phones never serve stale app.js

const CORE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/mobile-app/index.html',
  '/order/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll fails the whole install if one URL 404s; add individually and ignore misses.
      Promise.all(CORE.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin; never intercept the live API.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations AND app code (.js/.css): network-first so the latest logic
  // always wins; fall back to cache (then the offline page for navigations).
  const isCode = /\.(?:js|css)$/i.test(url.pathname);
  if (req.mode === 'navigate' || isCode) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/offline.html') : undefined))
        )
    );
    return;
  }

  // Images/icons/fonts: serve cache immediately, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
