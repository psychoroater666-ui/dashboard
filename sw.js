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
  const isCall = d.kind === 'call' || /^call\|/.test(String(d.tag || ''));

  // A call is not a message, and should not behave like one.
  //
  // What a browser can do: stay on screen until it is dealt with, vibrate
  // insistently rather than once, and offer Answer and Decline without
  // opening anything first.
  //
  // What it cannot do, on any browser: play a ringtone of our choosing. The
  // sound belongs to the phone's notification channel and is not ours to set.
  // The real ringtone starts once the dashboard is open and answering.
  const opts = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    // The badge is the small mark in the status bar. It has to be a white
    // silhouette on transparency -- handing Android the full-colour icon is
    // what turned it into a pale blob.
    badge: '/icons/badge-96.png',
    // The incident's own time, so an alert that arrives late doesn't say "now".
    timestamp: d.ts || Date.now(),
    // One line per branch: ten complaints from one branch replace each other
    // instead of filling the shade with ten rows.
    tag: d.tag || 'sentinel',
    renotify: true,
    // Overdue cases stay on the lock screen until somebody deals with them.
    // A ringing call stays there too, for the obvious reason.
    requireInteraction: isCall || !!d.critical,
    vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500]
           : d.critical ? [200, 80, 200, 80, 200] : [150],
    data: { url: d.url || '/', kind: d.kind || '', callId: d.callId || '', me: d.me || '' }
  };
  if (isCall) {
    // Not supported on iOS, which shows the notification without them. The
    // tap still opens the call, so nothing is lost there -- there is just no
    // way to decline without opening it.
    opts.actions = [
      { action: 'answer',  title: 'Answer' },
      { action: 'decline', title: 'Decline' }
    ];
  }
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data || {};
  const target = d.url || '/';

  // Declined from the lock screen: tell the caller now, rather than leaving
  // them listening to a ring nobody is going to answer. This runs with the
  // dashboard shut, so the request carries the Cloudflare Access cookie of
  // the person whose phone it is -- which is exactly who is declining.
  if (event.action === 'decline' && d.callId && d.me) {
    event.waitUntil(fetch('/api/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'vc_signal', callId: d.callId, from: d.me, type: 'reject' })
    }).catch(() => {}));
    return;
  }
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
