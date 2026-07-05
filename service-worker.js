/**
 * service-worker.js -- isc-v9
 *
 * Strategy:
 *   - JS / CSS / HTML: NETWORK ONLY with no-cache header (bypasses both SW
 *     cache and browser HTTP cache). Falls back to cache ONLY if offline.
 *     These files must always be fresh -- stale JS breaks the app.
 *
 *   - Icons / manifest: CACHE FIRST. These are truly static and safe to
 *     serve from cache indefinitely.
 *
 *   - Google / API calls: never intercepted -- pass straight through.
 *
 * This eliminates the version-bump treadmill. Deploying new files to GitHub
 * is enough -- no CACHE_NAME change needed unless the static assets change.
 */

const CACHE    = 'isc-v9-static';
const STATIC   = [
  '/ISC/icons/icon-192.png',
  '/ISC/icons/icon-512.png',
  '/ISC/manifest.json',
];

// App files that must never be served stale
const APP_EXTENSIONS = ['.js', '.css', '.html'];
function isAppFile(url) {
  const path = new URL(url).pathname;
  return APP_EXTENSIONS.some(ext => path.endsWith(ext)) || path.endsWith('/');
}

// Third-party hosts -- never intercept these
function isExternal(url) {
  const host = new URL(url).hostname;
  return host.includes('google') ||
         host.includes('googleapis') ||
         host.includes('openfoodfacts') ||
         host.includes('upcitemdb') ||
         host.includes('accounts');
}

/* ── Install: only pre-cache the static assets ───────────────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

/* ── Activate: clear any old caches and take over immediately ─────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: different strategy per resource type ─────────────────────── */
self.addEventListener('fetch', e => {
  const { request } = e;

  // Skip non-GET and external/API calls entirely
  if (request.method !== 'GET' || isExternal(request.url)) return;

  const url = new URL(request.url);

  if (isAppFile(request.url)) {
    // JS / CSS / HTML -- network first with no-cache to bypass HTTP cache.
    // Only falls back to SW cache if the user is genuinely offline.
    e.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(res => {
          // Opportunistically update the cache for offline fallback
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          // Offline -- serve whatever we have cached, or a fallback message
          return caches.match(request).then(cached => cached || new Response(
            '<h2 style="font-family:sans-serif;padding:20px;">You are offline. Please reconnect to use Inventory Scanner.</h2>',
            { headers: { 'Content-Type': 'text/html' } }
          ));
        })
    );
    return;
  }

  // Icons / manifest -- cache first, network fallback
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

/* ── Message handler: force update on demand ─────────────────────────── */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
