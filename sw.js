/*  Crumble Sentinel — service worker
    Deliberately minimal. It never caches the dashboard, its data or anything
    from the backend, so every upload of index.html is live immediately and no
    one can ever see stale numbers. Its only job is to show a friendly offline
    page when a phone has no connection, and to show incident alerts.         */
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

/* ── Phone alerts ──────────────────────────────────────────────────────
   The dashboard registers this worker for push; the Cloudflare Worker
   delivers the message. Everything here runs with the app closed.      */
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Crumble Sentinel', body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Crumble Sentinel';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || 'sentinel',
    renotify: true,
    requireInteraction: !!d.requireInteraction,
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      // Already open somewhere: bring it forward and tell it where to go,
      // rather than opening a second copy of the dashboard.
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        try { c.postMessage({ type: 'sentinel-open', url: target }); } catch (e) {}
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
