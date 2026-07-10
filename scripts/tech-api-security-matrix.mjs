/**
 * Technician API security matrix — runtime verification.
 * Uses active project for unassigned (403) tests; tech1's assigned project for 200 tests.
 * Run: node scripts/tech-api-security-matrix.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.DWES_API || 'http://127.0.0.1:3001/api';
const ACTIVE_PROJECT = process.env.DWES_TEST_PROJECT || '132KV33KV_KSA_RIYADH_2026_001';

const results = [];

function record(endpoint, role, expected, actual, pass, detail) {
  results.push({ endpoint, role, expected, actual, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${role} ${endpoint} → ${actual} (expect ${expected}) ${detail || ''}`);
}

async function api(pathname, opts = {}, token) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${pathname}`, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text?.slice(0, 200); }
  return { status: res.status, body, ok: res.ok };
}

async function login(username, password) {
  const { ok, body } = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!ok) throw new Error(`login ${username}: ${JSON.stringify(body)}`);
  return body;
}

function expectStatus(endpoint, role, expectedStatuses, res) {
  const expected = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  const pass = expected.includes(res.status);
  const detail = typeof res.body === 'object'
    ? JSON.stringify(res.body).slice(0, 120)
    : String(res.body || '').slice(0, 80);
  record(endpoint, role, expected.join('|'), res.status, pass, detail);
  return pass;
}

async function testProjectEndpoints(projectCode, panelId, tokens, labels, expectations) {
  const paths = [
    `/projects/${projectCode}/frames`,
    `/projects/${projectCode}/frames/${panelId}`,
    `/projects/${projectCode}/frames/${panelId}/verify-data`,
    `/projects/${projectCode}/frames/${panelId}/compare-status`,
    `/projects/${projectCode}/frames/${panelId}/compare-mapping`,
    `/projects/${projectCode}/frames/${panelId}/completion-report`,
    `/projects/${projectCode}/cables`,
    `/projects/${projectCode}/drawings`,
    `/projects/${projectCode}/director-reports`,
    `/projects/${projectCode}/report-pdf`,
    `/projects/${projectCode}/report-xlsx`,
    `/projects/${projectCode}/frames/${panelId}/report-pdf`,
  ];

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    for (let j = 0; j < tokens.length; j++) {
      const res = await api(p, {}, tokens[j]);
      expectStatus(p, labels[j], [expectations[j][i]], res);
    }
  }

  const drawings = (await api(`/projects/${projectCode}/drawings`, {}, tokens[2])).body || [];
  const drawingId = drawings[0]?.id;
  if (drawingId) {
    for (let j = 0; j < tokens.length; j++) {
      const res = await api(`/projects/${projectCode}/drawings/${drawingId}/file`, {}, tokens[j]);
      expectStatus(`/projects/${projectCode}/drawings/${drawingId}/file`, labels[j], [expectations[j][paths.length]], res);
    }
  } else {
    record(`/projects/${projectCode}/drawings/:id/file`, 'all', 'varies', 'SKIP', true, 'No drawing on project');
  }
  return drawingId;
}

const sup = await login('supervisor1', 'super123');
const tech1 = await login('tech1', 'tech1');
const tech01 = await login('tech01', 'tech01');

const supToken = sup.access_token;
const tech1Token = tech1.access_token;
const tech01Token = tech01.access_token;

const tech1Panels = (await api('/tech/my-panels', {}, tech1Token)).body || [];
const assignedProject = tech1Panels[0]?.project_code;
const assignedFrame = tech1Panels[0]?.frame_id;
if (!assignedProject || !assignedFrame) throw new Error('tech1 has no assignment — seed data required');

const activeFrames = (await api(`/projects/${ACTIVE_PROJECT}/frames`, {}, supToken)).body || [];
const activePanel = activeFrames[0]?.id;
if (!activePanel) throw new Error(`No panel on ${ACTIVE_PROJECT}`);

const assignedFrames = (await api(`/projects/${assignedProject}/frames`, {}, supToken)).body || [];
const assignedPanel = assignedFrame || assignedFrames[0]?.id;

// Active project: tech01 unassigned → 403; tech1 not assigned → 403; supervisor → 200
const activeExpect = {
  tech01: [403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403],
  tech1OnActive: [403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403],
  supervisor: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
};

console.log(`\n=== Active project ${ACTIVE_PROJECT} (unassigned enforcement) ===`);
await testProjectEndpoints(
  ACTIVE_PROJECT,
  activePanel,
  [tech01Token, tech1Token, supToken],
  ['tech01', 'tech1-not-on-project', 'supervisor1'],
  [activeExpect.tech01, activeExpect.tech1OnActive, activeExpect.supervisor],
);

// Assigned project: tech1 → 200; tech01 → 403; supervisor → 200
const assignedExpect = {
  tech01: [403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403],
  tech1: [200, 200, 200, 200, 200, 200, 200, 200, 403, 200, 200, 200, 200],
  supervisor: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
};

console.log(`\n=== Assigned project ${assignedProject} (tech1 positive access) ===`);
await testProjectEndpoints(
  assignedProject,
  assignedPanel,
  [tech01Token, tech1Token, supToken],
  ['tech01', 'tech1-assigned', 'supervisor1'],
  [assignedExpect.tech01, assignedExpect.tech1, assignedExpect.supervisor],
);

const drawList01 = await api(`/projects/${ACTIVE_PROJECT}/drawings`, {}, tech01Token);
console.log('\n--- Drawings list metadata (tech01 unassigned on active project) ---');
console.log(`Status: ${drawList01.status} (403 = no metadata leak; empty array would be leak)`);

const summary = {
  timestamp: new Date().toISOString(),
  activeProject: ACTIVE_PROJECT,
  assignedProject,
  assignedFrame: assignedPanel,
  passCount: results.filter((r) => r.pass).length,
  failCount: results.filter((r) => !r.pass).length,
  allPass: results.every((r) => r.pass),
  securityPolicy: {
    unassignedDrawingsList: drawList01.status === 403 ? '403 Forbidden (no metadata exposure)' : `DEVIATION: status ${drawList01.status}`,
    guardsImplementedIn: 'backend/src/frames/frames.controller.ts, backend/src/projects/projects.controller.ts',
  },
  results,
};

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.smoke-shots', `tech-api-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));

console.log(`\n=== API MATRIX: ${summary.allPass ? 'ALL PASS' : 'FAILURES'} (${summary.passCount}/${results.length}) ===`);
console.log(`Report: ${path.join(OUT, 'report.json')}`);
process.exit(summary.allPass ? 0 : 1);
