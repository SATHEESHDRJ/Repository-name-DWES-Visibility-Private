const SERVICE_WORKER_URL = '/sw.js';
const SW_RELOAD_FLAG = 'dwes-sw-reloaded';
/** How often to check for a redeployed /sw.js while the tab stays open. */
const SW_UPDATE_INTERVAL_MS = 20_000;

/**
 * Register the network-only DWES service worker after the page has loaded.
 * localhost is considered a secure context by Chromium; deployed environments
 * must use HTTPS for service workers and the PWA install prompt.
 *
 * When a new worker activates (after a frontend deploy + SW version bump),
 * the page hard-reloads once so Technician Dashboard and other tabs pick up
 * the new bundle without a manual Ctrl+Shift+R.
 */
export function registerDwesServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // Clear the one-shot guard set by a prior SW-driven reload.
  try {
    if (sessionStorage.getItem(SW_RELOAD_FLAG) === '1') {
      sessionStorage.removeItem(SW_RELOAD_FLAG);
    }
  } catch {
    /* sessionStorage may be blocked */
  }

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    try {
      if (sessionStorage.getItem(SW_RELOAD_FLAG) === '1') return;
      sessionStorage.setItem(SW_RELOAD_FLAG, '1');
    } catch {
      /* still reload once via in-memory guard */
    }
    refreshing = true;
    window.location.reload();
  });

  const watchForUpdates = (registration: ServiceWorkerRegistration) => {
    void registration.update();

    window.setInterval(() => {
      void registration.update();
    }, SW_UPDATE_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void registration.update();
      }
    });
  };

  const register = () => {
    void navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: '/',
      updateViaCache: 'none',
    }).then(watchForUpdates).catch((error: unknown) => {
      console.warn('[DWES] Service worker registration failed.', error);
    });
  };

  if (document.readyState === 'complete') {
    register();
    return;
  }

  window.addEventListener('load', register, { once: true });
}
