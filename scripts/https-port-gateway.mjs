/**
 * TCP gateway on the public HTTPS port (5173).
 * - Plain HTTP → 301 redirect to https://<host>:5173
 * - TLS (ClientHello) → transparent proxy to Vite on VITE_INTERNAL_PORT (5174)
 *
 * Allows http://localhost:5173 to work while Vite serves HTTPS on an internal port.
 */
import net from 'node:net';
import { DEFAULT_HTTPS_PORT } from './certs-config.mjs';

const PUBLIC_PORT = DEFAULT_HTTPS_PORT;
const VITE_PORT = Number(process.env.VITE_INTERNAL_PORT) || 5174;
const VITE_HOST = process.env.VITE_INTERNAL_HOST || '127.0.0.1';

function isTlsClientHello(buf) {
  return buf.length >= 3 && buf[0] === 0x16 && buf[1] === 0x03;
}

function handleHttpRedirect(socket, firstChunk) {
  const req = firstChunk.toString('utf8', 0, Math.min(firstChunk.length, 4096));
  const hostMatch = req.match(/^Host:\s*([^\r\n]+)/im);
  const hostHeader = hostMatch?.[1]?.trim() ?? `localhost:${PUBLIC_PORT}`;
  const host = hostHeader.split(':')[0];
  const urlMatch = req.match(/^(?:GET|HEAD|POST|PUT|DELETE|PATCH|OPTIONS)\s+(\S+)/m);
  const path = urlMatch?.[1] ?? '/';
  const target = `https://${host}:${PUBLIC_PORT}${path}`;
  const body = `Redirecting to ${target}\n`;
  const response =
    `HTTP/1.1 301 Moved Permanently\r\n` +
    `Location: ${target}\r\n` +
    `Content-Type: text/plain\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    `Connection: close\r\n\r\n${body}`;
  socket.write(response);
  socket.end();
}

function proxyToVite(clientSocket, firstChunk) {
  const backend = net.connect({ host: VITE_HOST, port: VITE_PORT }, () => {
    if (firstChunk?.length) backend.write(firstChunk);
    clientSocket.pipe(backend);
    backend.pipe(clientSocket);
  });
  backend.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => backend.destroy());
}

const server = net.createServer((socket) => {
  socket.once('data', (buffer) => {
    if (isTlsClientHello(buffer)) {
      proxyToVite(socket, buffer);
    } else {
      handleHttpRedirect(socket, buffer);
    }
  });
  socket.on('error', () => {});
});

let listening = false;

server.listen({ port: PUBLIC_PORT, host: '::', ipv6Only: false }, () => {
  listening = true;
  console.log(`[gateway] :${PUBLIC_PORT} — HTTP redirects to HTTPS, TLS → ${VITE_HOST}:${VITE_PORT}`);
  console.log(`[gateway] http://localhost:${PUBLIC_PORT} → https://localhost:${PUBLIC_PORT}`);
});

server.on('error', (err) => {
  // Only startup (pre-listen) failures are fatal. Once we're listening, a
  // transient runtime error must not exit(1) — under `concurrently
  // --kill-others-on-fail` that would tear down the whole dev stack.
  if (!listening) {
    if (err.code === 'EADDRINUSE') {
      console.error(`[gateway] Port ${PUBLIC_PORT} is in use. Stop other servers on that port first.`);
    } else {
      console.error('[gateway] fatal startup error:', err.message);
    }
    process.exit(1);
  }
  console.error('[gateway] runtime error (ignored):', err.message);
});
