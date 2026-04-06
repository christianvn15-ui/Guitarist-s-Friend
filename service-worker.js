const CACHE_NAME = "guitarist-friend-v3";

// Files to cache
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Firebase/Google domains to exclude from caching
const NETWORK_ONLY_URLS = [
  "firestore.googleapis.com",
  "firebase.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "www.googleapis.com",
  "google.com",
  "gstatic.com"
];

// --- INSTALL ---
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");

  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.error("[SW] Cache failed:", err);
    })
  );
});

// --- ACTIVATE ---
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// Helper: Check if URL should bypass cache
function isNetworkOnly(url) {
  return NETWORK_ONLY_URLS.some(domain => url.includes(domain));
}

// --- FETCH ---
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = request.url;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // NETWORK ONLY for Firebase/API calls
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // NAVIGATION requests (pages) - Network First with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match("/index.html");
        })
    );
    return;
  }

  // STATIC ASSETS - Cache First with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached version immediately
        // But fetch update in background
        fetch(request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response);
          });
        }).catch(() => {});
        return cached;
      }

      // Not in cache - fetch and cache
      return fetch(request).then((response) => {
        // Don't cache opaque responses (cross-origin)
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      });
    })
  );
});

// --- BACKGROUND SYNC (optional - for offline note saving) ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notes') {
    console.log('[SW] Background sync triggered');
    // Could trigger sync to Firebase here when back online
  }
});