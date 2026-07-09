/**
 * E2E Docker Compose stack — up, wait, test, down.
 * Usage: node scripts/e2e-stack.mjs [up|down|test|wait]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockerDir = path.join(root, 'infra', 'docker');
const envE2e = path.join(dockerDir, '.env.e2e');
const envExample = path.join(dockerDir, '.env.e2e.example');
const composeBase = path.join(dockerDir, 'docker-compose.yml');
const composeE2e = path.join(dockerDir, 'docker-compose.e2e.yml');
const baseUrl = process.env.DWES_E2E_BASE_URL || 'http://localhost:18080';

function dockerCompose(args) {
  const r = spawnSync(
    'docker',
    ['compose', '-f', composeBase, '-f', composeE2e, '--env-file', envE2e, ...args],
    { cwd: dockerDir, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function ensureEnv() {
  if (!fs.existsSync(envE2e)) {
    fs.copyFileSync(envExample, envE2e);
    console.log('[e2e] Created infra/docker/.env.e2e from example');
  }
}

async function waitHealthy() {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    try {
      const hz = await fetch(`${baseUrl}/healthz`);
      const api = await fetch(`${baseUrl}/api/health`);
      if (hz.ok && api.ok) {
        const body = await api.json();
        if (body.status === 'ok') {
          console.log('[e2e] Stack healthy');
          return;
        }
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.error('[e2e] Timeout waiting for health');
  process.exit(1);
}

const cmd = process.argv[2] || 'test';

ensureEnv();

if (cmd === 'up') {
  dockerCompose(['up', '-d', '--build']);
  await waitHealthy();
} else if (cmd === 'down') {
  dockerCompose(['down', '-v']);
} else if (cmd === 'wait') {
  await waitHealthy();
} else if (cmd === 'test') {
  dockerCompose(['up', '-d', '--build']);
  await waitHealthy();
  const e2e = spawnSync(
    'npm',
    ['exec', '--prefix', 'e2e', 'playwright', 'test'],
    {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, DWES_E2E_BASE_URL: baseUrl },
    },
  );
  dockerCompose(['down']);
  process.exit(e2e.status ?? 1);
} else {
  console.error('Usage: node scripts/e2e-stack.mjs [up|down|wait|test]');
  process.exit(1);
}
