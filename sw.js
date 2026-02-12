/* 
  sw.js - Production Service Worker with Offline Support
*/

const CACHE_NAME = 'izin-v1.2';
const ASSETS = [
    '/index.html',
    '/style.css',
    '/app.js',
    '/corporate-logo.png',
    '/favicon.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install event - cache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS).catch(err => {
                console.warn('Some assets failed to cache:', err);
                // Continue even if some assets fail
            });
        })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control immediately
});

// Fetch event - cache-first strategy for static assets, network-first for API
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-first for API calls
    if (url.hostname === 'script.google.com') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ status: 'error', message: 'Çevrimdışı - İnternet bağlantınızı kontrol edin' }),
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                })
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                // Cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(() => {
                // Offline fallback for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                return new Response('Çevrimdışı', { status: 503 });
            });
        })
    );
});
