/**
 * Start Vite with DWES_HTTPS=1 (cross-platform wrapper for npm scripts).
 * Binds to VITE_INTERNAL_PORT (5174) on localhost; public :5173 is handled by https-port-gateway.mjs.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.resolve(__dirname, '../node_modules/vite/bin/vite.js');

process.env.DWES_HTTPS = '1';
process.env.VITE_INTERNAL_PORT = process.env.VITE_INTERNAL_PORT || '5174';
process.env.VITE_INTERNAL_HOST = process.env.VITE_INTERNAL_HOST || '127.0.0.1';

const viteArgs = process.argv.slice(2);

const child = spawn(process.execPath, [viteBin, ...viteArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
