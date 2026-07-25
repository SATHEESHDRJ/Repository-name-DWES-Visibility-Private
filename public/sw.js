/*
 * DWES installability service worker.
 *
 * This worker is intentionally network-only. It never opens Cache Storage and it
 * does not intercept /api requests, so authenticated responses, drawings, reports,
 * and user-specific data cannot be cached or replayed by the service worker.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Always fetch navigations from the network without using the HTTP cache. Static
  // production assets have content hashes, so their normal browser cache is safe.
  event.respondWith(fetch(request, {
    cache: request.mode === 'navigate' ? 'no-store' : 'default',
  }));
});
