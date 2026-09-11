/*  Crumble Sentinel — service worker
    Deliberately minimal. It never caches the dashboard, its data or anything
    from the backend, so every upload of index.html is live immediately and no
    one can ever see stale numbers. Its only job is to show a friendly offline
    page when a phone has no connection.                                      */
const CACHE = 'sentinel-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      .catch(() => {})                      // never block installation over this
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only page loads are handled. API calls, scripts, fonts and images all go
  // straight to the network exactly as they would without this file.
  if (req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(() => caches.match(OFFLINE_URL).then(r => r || Response.error()))
  );
});
