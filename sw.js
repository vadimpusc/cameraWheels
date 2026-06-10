const CACHE_NAME = 'camera-wheels-v10';
const ALLOWED_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.png',
  './app.js',
  './sw.js',
  './jspdf.umd.min.js',
  './html2canvas.min.js'
];
const ALLOWED_URLS = new Set(
  ALLOWED_ASSETS.map((asset) => new URL(asset, self.registration.scope).href)
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ALLOWED_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate';
  if (!isNavigation && !ALLOWED_URLS.has(url.href)) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (isNavigation) return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
