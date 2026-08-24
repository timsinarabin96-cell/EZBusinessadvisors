/* eslint-disable */
// Concord Deal Platform — Service Worker
// Offline-first caching:
//   * Precache the app shell + icons at install.
//   * Runtime cache for navigations (network-first with cache fallback).
//   * Never cache cross-origin API calls (Supabase / AI / email) — keep them
//     fresh; offline those simply fail back to the cached shell.
// PWA install requires a fetch handler + a controlled start_url, so keep this
// minimal and safe: no stale content served without a network attempt.

const VERSION = 'concord-v1';
const CORE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigations (pages): always try the network, fall back to
// the cached shell so previously-visited pages work offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip API routes — never cache live data.
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests: network-first, cache fallback to the shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return resp;
      }).catch(() => caches.match(req).then((c) => c || caches.match('/')))
    );
    return;
  }

  // Static assets (JS/CSS/images): cache-first with background update.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Web Push: show a notification when the server pushes one, and open the
// target link when the user clicks it.
self.addEventListener('push', (event) => {
  let data = { title: 'Concord', body: '', link: '/dashboard/notifications' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) { /* keep defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Concord', {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-192.png',
      data: { link: data.link || '/dashboard/notifications' },
      tag: data.tag || 'concord-push',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) { client.focus(); client.navigate(link); return; }
      }
      return self.clients.openWindow(link);
    })
  );
});
