// Basic Service Worker for PWA Installation Support
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Standard fetch - no custom caching needed for now
    event.respondWith(fetch(event.request));
});
