/*
 * Keeps the site's own files so it opens again without a connection and starts faster: files under /assets/ have a hash in their name
 * (they never change) and are served from the cache; the page itself is always asked from the network first and only falls back to the
 * last copy when offline. Nothing else (Firebase, Google, sign-in pages) is touched.
 */
// Bump CACHE_VERSION whenever this file's behaviour changes; old caches are deleted on activate. (Asset names carry a content hash, so a new build never reads an old file.)
const CACHE_VERSION = 'v2';
const CACHE = `wd-shell-${CACHE_VERSION}`;
// Only keep a response whose content type fits what was asked for, so an HTML fallback page is never stored under a script or style URL.
const fitsRequest = (url, res) => {
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (/\.m?js$/.test(url.pathname)) return /javascript|ecmascript/.test(type);
  if (/\.css$/.test(url.pathname)) return type.includes('text/css');
  return !type.includes('text/html');
};

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && fitsRequest(url, res)) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) cache.put('/index.html', res.clone());
        return res;
      } catch {
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
  }
});
