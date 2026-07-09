/**
 * Cross-platform k6 smoke wrapper (Windows + Linux).
 * Usage: node scripts/k6-smoke.mjs [BASE_URL]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://localhost:18080';
const script = path.join(root, 'infra', 'load', 'k6', 'smoke-120vus.js');

const r = spawnSync(
  'k6',
  ['run', '-e', `DWES_BASE_URL=${base}`, script],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, K6_INSECURE_SKIP_TLS_VERIFY: 'true' },
  },
);

if (r.error?.code === 'ENOENT') {
  console.error('[k6-smoke] k6 not installed — see docs/LOAD-TEST.md');
  process.exit(1);
}
process.exit(r.status ?? 1);
