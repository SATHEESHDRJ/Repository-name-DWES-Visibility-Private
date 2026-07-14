# DWES PWA installation

DWES exposes a standard web app manifest and a root-scoped service worker so Chromium
can offer the **Install app** action on the login page. Installation requires HTTPS in
deployed environments; Chromium also treats `localhost` as a secure context for local
testing.

The service worker is intentionally network-only:

- `/api/*` requests are never intercepted, cached, or replayed.
- Navigations always use the network with `cache: "no-store"`, avoiding a stale app shell.
- Static production assets use their normal browser cache and Vite content hashes.
- There is no offline fallback and no Cache Storage dependency. DWES still requires the
  backend and network connectivity to sign in and operate.

After changing the worker, manifest, or icons, run:

```powershell
npm run test:pwa
npm run build
```

In Chromium DevTools, **Application → Manifest** should show DWES as standalone and
**Application → Service workers** should show `/sw.js` activated for scope `/`. A newly
eligible browser profile may need one reload after the first registration before the
native install prompt is offered.
