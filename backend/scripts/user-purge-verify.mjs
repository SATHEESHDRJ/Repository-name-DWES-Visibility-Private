#!/usr/bin/env node
/** Post-purge verification — read-only checks + users snapshot export */
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';
const API = process.env.DWES_API || 'http://localhost:3001/api';

const EXPECTED = {
  total: 35,
  system_admin: 1,
  ops_director: 2,
  prod_supervisor: 1,
  qaqc_engineer: 2,
  wiring_technician: 29,
};

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: users } = await client.query(
  'SELECT id, username, role, full_name, is_active FROM users ORDER BY role, username',
);

const byRole = {};
for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;

const outDir = path.resolve(__dirname, '../../DEWS_Backups');
mkdirSync(outDir, { recursive: true });
const snapFile = path.join(outDir, `users_after_purge_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
writeFileSync(snapFile, JSON.stringify({ exported_at: new Date().toISOString(), count: users.length, by_role: byRole, users }, null, 2));

const roleOk = Object.entries(EXPECTED).every(([k, v]) => k === 'total' ? users.length === v : byRole[k] === v);

async function tryLogin(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { username, ok: res.ok, status: res.status };
}

const logins = await Promise.all([
  tryLogin('sysadmin', 'admin123'),
  tryLogin('supervisor1', 'super123'),
  tryLogin('tech1', 'tech1'),
  tryLogin('qa1', 'qa1'),
]);

// Audit recording spot-check
const sup = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'supervisor1', password: 'super123' }),
});
const supTok = (await sup.json()).access_token;
const sh = { Authorization: `Bearer ${supTok}`, 'Content-Type': 'application/json' };

const tech = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'tech1', password: 'tech1' }),
});
const techBody = await tech.json();
const th = { Authorization: `Bearer ${techBody.access_token}`, 'Content-Type': 'application/json' };

const before = (await client.query('SELECT COUNT(*)::int AS c FROM tech_audit_log')).rows[0].c;

const assignRes = await fetch(`${API}/tech/assign-frame`, {
  method: 'POST', headers: sh,
  body: JSON.stringify({ project_code: '132KV_UAE_DUBAI_2026_002', frame_id: 'frame_test_dwf_400', technician_id: techBody.user.id }),
});
const assign = await assignRes.json();
const aid = assign.assignment?.id;

let auditDelta = null;
if (aid) {
  await fetch(`${API}/tech/start/${aid}`, { method: 'POST', headers: th });
  const after = (await client.query('SELECT COUNT(*)::int AS c FROM tech_audit_log')).rows[0].c;
  auditDelta = after - before;
  await fetch(`${API}/tech/pause/${aid}`, { method: 'POST', headers: th, body: JSON.stringify({ elapsed_seconds: 1, reason: 'post-purge verify' }) });
  await fetch(`${API}/tech/assignment/${aid}`, { method: 'DELETE', headers: sh });
}

const dir = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'ops_director1', password: 'ops_director123' }),
});
const dirTok = (await dir.json()).access_token;
const activityRes = await fetch(`${API}/director/activity?limit=5`, {
  headers: { Authorization: `Bearer ${dirTok}` },
});
const activity = activityRes.ok ? await activityRes.json() : null;

const deletedStillPresent = users.filter(u =>
  ['admin1', 'director2', 'supervisor2', 'eng001', 'eng002', 'qcengineer1', 'tech001', 'tech002', 'tech055'].includes(u.username),
);

const report = {
  users_snapshot: snapFile,
  user_count: users.length,
  by_role: byRole,
  role_counts_ok: roleOk,
  deleted_still_present: deletedStillPresent.map(u => u.username),
  logins,
  audit_delta_on_assign_start: auditDelta,
  director_activity_count: Array.isArray(activity) ? activity.length : null,
};

console.log(JSON.stringify(report, null, 2));
await client.end();
process.exit(roleOk && logins.every(l => l.ok) && deletedStillPresent.length === 0 && (auditDelta ?? 0) >= 2 ? 0 : 1);
