// Inventory Scanner — Service Worker
// Caches the app shell so it loads offline.
// Stock updates still require a connection to reach Google Sheets.

const CACHE_NAME = 'inventory-scanner-v3';
const ASSETS = [
  '/ISC/',
  '/ISC/index.html',
  '/ISC/manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Always go to network for Google Sheets/Apps Script calls
  if (event.request.url.includes('script.google.com') ||
      event.request.url.includes('openfoodfacts.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
