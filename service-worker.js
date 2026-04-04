const CACHE_NAME = "guitarist-friend-cache-v1";
const urlsToCache = [
  "/index.html",
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Install SW and cache files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate SW and clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
});

// Fetch requests
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Serve from cache, else fetch from network
      return response || fetch(event.request);
    })
  );
});