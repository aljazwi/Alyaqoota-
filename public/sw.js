// public/sw.js
const CACHE_NAME = 'fuel-station-cache-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/styles/main.css',
        '/scripts/main.js',
        OFFLINE_URL,
        '/icons/icon-192x192.png'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // استراتيجية CacheFirst للطلبات الأساسية
  if (event.request.mode === 'navigate' ||
      event.request.url.includes('/api/') ||
      event.request.url.includes('/static/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).catch(() => {
          return caches.match(OFFLINE_URL);
        });
      })
    );
  } else {
    // استراتيجية StaleWhileRevalidate للعناصر الأخرى
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});
