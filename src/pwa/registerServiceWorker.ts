const SERVICE_WORKER_URL = '/sw.js';

/**
 * Register the network-only DWES service worker after the page has loaded.
 * localhost is considered a secure context by Chromium; deployed environments
 * must use HTTPS for service workers and the PWA install prompt.
 */
export function registerDwesServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const register = () => {
    void navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: '/',
      updateViaCache: 'none',
    }).catch((error: unknown) => {
      console.warn('[DWES] Service worker registration failed.', error);
    });
  };

  if (document.readyState === 'complete') {
    register();
    return;
  }

  window.addEventListener('load', register, { once: true });
}
