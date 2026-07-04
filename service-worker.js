/* Inventory Scanner — Service Worker isc-v5 */
const CACHE   = 'isc-v7';
const STATIC  = [
  '/ISC/manifest.json',
  '/ISC/icons/icon-192.png',
  '/ISC/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Google, Open Food Facts, or GIS calls
  if (url.hostname.includes('google') ||
      url.hostname.includes('openfoodfacts') ||
      url.hostname.includes('googleapis')) return;

  // HTML, JS, CSS: network-first so updates always land immediately
  if (e.request.destination === 'document' ||
      e.request.destination === 'script'   ||
      e.request.destination === 'style'    ||
      url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets (icons, manifest): cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
