const CACHE_NAME = 'camera-wheels-v6';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon.png',
  './app.js',
  './sw.js',
  './jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
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
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request).then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }
      
      const responseToCache = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, responseToCache);
      });
      
      return response;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
