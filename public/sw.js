/*
 * DWES installability service worker.
 * Version: 20260731-banner-clean — post-debug cleanup; technician banner contract.
 */

const DWES_SW_VERSION = '20260731-banner-clean';
const STATIC_CACHE = `dwes-static-${DWES_SW_VERSION}`;

/** Vite-emitted files under /assets/ with content hash in the filename */
function isHashedBuildAsset(pathname) {
  return /^\/assets\/[\w.-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp|gif)$/i.test(pathname)
    && /[-.][A-Za-z0-9_-]{8,}\./.test(pathname);
}

/** Public files copied to /assets/ without a Vite content hash (e.g. login logos). */
function isUnhashedPublicAsset(pathname) {
  return /^\/assets\/[\w.-]+\.(?:png|jpe?g|svg|webp|gif|ico)$/i.test(pathname)
    && !isHashedBuildAsset(pathname);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('caches' in self) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('dwes-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      );
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const isNavigation =
    request.mode === 'navigate'
    || request.headers.get('accept')?.includes('text/html')
    || url.pathname === '/'
    || url.pathname.endsWith('.html');

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (isUnhashedPublicAsset(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (isHashedBuildAsset(url.pathname)) {
    // Network-first for hashed assets so redeploys are not stuck behind an old SW cache
    // while index.html already points at a new filename (or vice versa during rollout).
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)),
  );
});
