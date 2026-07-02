const CACHE_NAME = 'inventory-scanner-v5';
const STATIC_ASSETS = [
  '/ISC/manifest.json',
  '/ISC/icons/icon-192.png',
  '/ISC/icons/icon-512.png'
];

// Install: only cache static assets, never the HTML itself
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: wipe every old cache immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - HTML pages: network first, fall back to cache (ensures updates always land)
// - Google / Open Food Facts API calls: always network, never cache
// - Everything else: cache first, fall back to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept Google or API calls
  if (url.hostname.includes('google') || url.hostname.includes('openfoodfacts')) {
    return;
  }

  // HTML: network first so updates are always picked up
  if (event.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
