/**
 * Single source of truth for DWES dev ports.
 * Keep gateway, Vite internal HTTPS, plain HTTP dev, and in-app fingerprint hints aligned.
 *
 * Override via env:
 *   VITE_PORT / DWES_HTTPS_PORT  → public HTTPS gateway (default 5173)
 *   VITE_HTTP_PORT               → plain HTTP dev (default 5175)
 *   VITE_INTERNAL_PORT           → Vite HTTPS bind behind gateway (default 5174)
 */
export const HTTP_DEV_PORT = Number(process.env.VITE_HTTP_PORT) || 5175;
export const HTTPS_GATEWAY_PORT =
  Number(process.env.VITE_PORT || process.env.DWES_HTTPS_PORT) || 5173;
export const VITE_INTERNAL_HTTPS_PORT = Number(process.env.VITE_INTERNAL_PORT) || 5174;
export const HTTP_REDIRECT_PORT = Number(process.env.HTTP_REDIRECT_PORT) || 8080;

/** Full WebAuthn origin for the LAN hostname (matches backend RP_ORIGIN primary). */
export function webauthnOrigin(hostname) {
  return `https://${hostname}:${HTTPS_GATEWAY_PORT}`;
}
