/**
 * UI/UX recovery regression smoke — API role probes + UI route 200s.
 * Writes docs/evidence/uiux-recovery/regression-smoke-live.json
 *
 * Usage: node scripts/uiux-recovery-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/evidence/uiux-recovery/regression-smoke-live.json');
const API = process.env.DWES_API_URL || 'http://127.0.0.1:3101';
const UI = process.env.DWES_UI_URL || 'http://127.0.0.1:5275';

const LOGINS = [
  { user: 'supervisor1', pass: 'super123', route: '/api/projects' },
  { user: 'tech2', pass: 'tech2', route: '/api/tech/my-panels' },
  { user: 'ops_director1', pass: 'ops_director123', route: '/api/director/stats' },
  { user: 'sysadmin', pass: 'admin123', route: '/api/admin/diagnostics' },
];

const UI_PATHS = ['/', '/supervisor', '/technician', '/director', '/admin/settings'];

const results = [];

for (const { user, pass, route } of LOGINS) {
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    results.push({ check: `${user} ${route}`, status: loginRes.status, error: 'login failed' });
    continue;
  }
  const auth = await loginRes.json();
  const token = auth.access_token || auth.token;
  const apiRes = await fetch(`${API}${route}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  results.push({ check: `${user} ${route}`, status: apiRes.status });
}

for (const p of UI_PATHS) {
  const uiRes = await fetch(`${UI}${p}`);
  results.push({ check: `UI ${p}`, status: uiRes.status });
}

fs.writeFileSync(
  OUT,
  JSON.stringify({ capturedAt: new Date().toISOString(), api: API, ui: UI, results }, null, 2),
);
const failed = results.filter((r) => r.status !== 200);
console.log(JSON.stringify(results, null, 2));
if (failed.length) {
  console.error('FAIL', failed.length);
  process.exit(1);
}
console.log('OK uiux-recovery-smoke →', OUT);
