/**
 * Shared TLS certificate paths for DWES LAN HTTPS deployment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTTPS_GATEWAY_PORT, HTTP_REDIRECT_PORT } from './dwes-ports.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const CERT_DIR = path.join(ROOT, 'certs');
export const KEY_PATH = path.join(CERT_DIR, 'key.pem');
export const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

export function certsExist() {
  return fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH);
}

export function loadTlsOptions() {
  if (!certsExist()) return null;
  return {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
  };
}

export const DEFAULT_HTTPS_PORT = HTTPS_GATEWAY_PORT;
export const DEFAULT_REDIRECT_PORT = HTTP_REDIRECT_PORT;
