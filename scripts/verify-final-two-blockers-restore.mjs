/**
 * Read-only restore-stack verification for final-two-blockers evidence.
 * DB workflows = JWT login + WiringSchemeDB-backed API routes (no DDL/DML).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAMP = 'final-two-blockers-2026-09-21_112345';
const OUT_DIR = path.join(ROOT, 'docs/evidence', STAMP, 'verify');
const API = process.env.DWES_API_URL || 'http://127.0.0.1:3101';
const UI = process.env.DWES_UI_URL || 'http://127.0.0.1:5275';

async function login(username, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.json();
  const token = body.access_token || body.token;
  return { ok: Boolean(token), token, status: res.status };
}

async function authedGet(token, route) {
  const res = await fetch(`${API}${route}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let sample = null;
  if (res.ok) {
    try {
      const j = await res.json();
      if (Array.isArray(j)) sample = { type: 'array', length: j.length };
      else if (j && typeof j === 'object') sample = { type: 'object', keys: Object.keys(j).slice(0, 8) };
    } catch {
      sample = { type: 'non-json' };
    }
  }
  return { status: res.status, sample };
}

const checks = [];

const health = await fetch(`${API}/api/health`);
checks.push({ name: 'health', status: health.status, body: health.ok ? await health.json() : null });

const sup = await login('supervisor1', 'super123');
checks.push({ name: 'login_supervisor', ...sup, ok: sup.ok });

if (sup.ok) {
  for (const route of [
    '/api/projects',
    '/api/supervisor/crimping-portfolio?cut=4',
    '/api/supervisor/pending-approvals',
  ]) {
    const r = await authedGet(sup.token, route);
    checks.push({ name: `supervisor${route.split('?')[0]}`, ...r });
  }
}

const tech = await login('tech3', 'tech3');
checks.push({ name: 'login_tech3', ...tech, ok: tech.ok });
if (tech.ok) {
  const r = await authedGet(tech.token, '/api/tech/my-panels');
  checks.push({ name: 'tech_my_panels', ...r });
}

for (const p of ['/', '/login', '/supervisor', '/technician']) {
  const ui = await fetch(`${UI}${p}`);
  checks.push({ name: `ui${p}`, status: ui.status });
}

function checksForEvidence(list) {
  return list.map((c) => {
    if (!c?.token) return c;
    const { token, ...rest } = c;
    return { ...rest, token: '[redacted]' };
  });
}

const failed = checks.filter(c => {
  if (c.name === 'health') return c.status !== 200;
  if (c.name.startsWith('login_')) return !c.ok;
  if (c.name.startsWith('ui')) return c.status !== 200;
  return c.status < 200 || c.status >= 400;
});

const summary = {
  timestamp: new Date().toISOString(),
  api: API,
  ui: UI,
  checks: checksForEvidence(checks),
  failed: failed.map(f => f.name),
  pass: failed.length === 0,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outJson = path.join(OUT_DIR, 'restore-db-workflows-nest11.json');
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(OUT_DIR, 'DB_WORKFLOWS_NEST11.txt'),
  [
    `timestamp: ${summary.timestamp}`,
    `pass: ${summary.pass}`,
    `failed: ${failed.length ? failed.join(', ') : 'none'}`,
    `detail: ${path.relative(ROOT, outJson)}`,
  ].join('\n'),
);

console.log(summary.pass ? 'VERIFY_RESTORE_PASS' : 'VERIFY_RESTORE_FAIL', failed.map(f => f.name).join(',') || '');
process.exit(summary.pass ? 0 : 1);
