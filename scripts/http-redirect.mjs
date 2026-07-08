/**
 * Redirect plain HTTP to HTTPS for DWES LAN deployment.
 * Default port 8080 (avoids IIS on port 80). Override with HTTP_REDIRECT_PORT.
 *
 * Usage: node scripts/http-redirect.mjs
 */
import http from 'node:http';
import { DEFAULT_HTTPS_PORT, DEFAULT_REDIRECT_PORT } from './certs-config.mjs';

const REDIRECT_PORT = DEFAULT_REDIRECT_PORT;
const HTTPS_PORT = DEFAULT_HTTPS_PORT;

const server = http.createServer((req, res) => {
  const hostHeader = req.headers.host ?? `localhost:${REDIRECT_PORT}`;
  const host = hostHeader.split(':')[0];
  const target = `https://${host}:${HTTPS_PORT}${req.url ?? '/'}`;
  res.writeHead(301, { Location: target, 'Content-Type': 'text/plain' });
  res.end(`Redirecting to ${target}\n`);
});

let listening = false;

server.listen({ port: REDIRECT_PORT, host: '::', ipv6Only: false }, () => {
  listening = true;
  console.log(`[redirect] HTTP :${REDIRECT_PORT} → HTTPS :${HTTPS_PORT}`);
  console.log(`[redirect] Example: http://10.x.x.x:${REDIRECT_PORT}/ → https://10.x.x.x:${HTTPS_PORT}/`);
  if (REDIRECT_PORT === 80) {
    console.log('[redirect] Bound to port 80 — ensure IIS or other services are stopped');
  } else {
    console.log('[redirect] Port 80 unused (IIS-safe). Set HTTP_REDIRECT_PORT=80 to use standard HTTP port');
  }
});

server.on('error', (err) => {
  // Only startup (pre-listen) failures are fatal. Once we're listening, a
  // transient runtime error must not exit(1) — under `concurrently
  // --kill-others-on-fail` that would tear down the whole dev stack.
  if (!listening) {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[redirect] Port ${REDIRECT_PORT} already in use — assuming redirect is already running`);
      process.exit(0);
    }
    console.error('[redirect] fatal startup error:', err.message);
    process.exit(1);
  }
  console.error('[redirect] runtime error (ignored):', err.message);
});
