/**
 * Cross-platform k6 wrapper for >=70 concurrent technician-like sessions.
 * Usage: node scripts/k6-tech70.mjs [BASE_URL]
 * Local only — never point at production.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://localhost:3001';
const script = path.join(root, 'infra', 'load', 'k6', 'tech-70vus.js');

if (/ingenious-network\.com|dwes\.ingenious/i.test(base) && !process.env.DWES_ALLOW_PROD_LOAD) {
  console.error('[k6-tech70] Refusing production-like URL. Use localhost / staging only.');
  process.exit(2);
}

const r = spawnSync(
  'k6',
  ['run', '-e', `DWES_BASE_URL=${base}`, script],
  {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
    env: { ...process.env, K6_INSECURE_SKIP_TLS_VERIFY: 'true' },
  },
);

if (r.error?.code === 'ENOENT') {
  console.error('[k6-tech70] k6 not installed — see docs/LOAD-TEST.md');
  process.exit(1);
}
process.exit(r.status ?? 1);