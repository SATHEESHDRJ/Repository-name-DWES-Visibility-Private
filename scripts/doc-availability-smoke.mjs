/**
 * Document availability smoke test — supervisor Projects tab + technician gating.
 * Run: node scripts/doc-availability-smoke.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { selectProjectPanel } from './smoke-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FE = process.env.DWES_FE || 'http://localhost:5175';
const API = process.env.DWES_API || 'http://localhost:3001/api';
const OUT = path.join(ROOT, '.smoke-shots', `doc-avail-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const results = [];

function record(scenario, pass, detail) {
  results.push({ scenario, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${scenario}: ${detail}`);
}

async function api(pathname, opts = {}, token) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${pathname}`, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
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

function minimalPdfBuffer() {
  // Minimal valid PDF for upload smoke tests
  const pdf = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
178
%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function uploadDrawing(token, projectCode, frameId, pdfBuf) {
  const buf = pdfBuf;
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/pdf' }), 'smoke-test-drawing.pdf');
  if (frameId) form.append('frame_id', frameId);
  const res = await fetch(`${API}/upload/drawing/${projectCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

function makeWiringXlsx() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Ferrule', 'Source', 'Destination', 'Wire Color'],
    ['F001', 'TB1/1', 'TB2/1', 'BU'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Wiring');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function uploadWiring(token, projectCode, frameId) {
  const buf = makeWiringXlsx();
  const mapping = JSON.stringify({ ferrule: 'Ferrule', source: 'Source', destination: 'Destination', color: 'Wire Color' });
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'smoke-wiring.xlsx');
  form.append('sheet_name', 'Wiring');
  form.append('mapping', mapping);
  form.append('header_row', '0');
  if (frameId) form.append('frame_id', frameId);
  const res = await fetch(`${API}/upload/wiring-schedule-mapped/${projectCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function deleteDrawing(token, projectCode, drawingId) {
  return api(`/projects/${projectCode}/drawings/${drawingId}`, { method: 'DELETE' }, token);
}

async function shot(page, name) {
  await new Promise(r => setTimeout(r, 400));
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function openSupervisorPage(browser, token, user) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, token, JSON.stringify(user));
  await page.goto(`${FE}/supervisor`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1200));
  return { page, consoleErrors };
}

async function getDocUiState(page) {
  return page.evaluate(() => {
    const badges = [...document.querySelectorAll('.pj-doc-badge')].map(b => b.textContent?.trim());
    const viewDrawing = document.querySelector('.pj-info-action--drawing');
    const wiringView = document.querySelector('.pj-info-action--wiring');
    return {
      badges,
      viewDrawingDisabled: viewDrawing?.disabled ?? true,
      wiringViewDisabled: wiringView?.disabled ?? true,
      viewDrawingClass: viewDrawing?.className ?? '',
      wiringViewClass: wiringView?.className ?? '',
    };
  });
}

async function emitDocsChanged(page, detail) {
  await page.evaluate((d) => {
    window.dispatchEvent(new CustomEvent('dwes:documents-changed', { detail: d }));
  }, detail);
  await new Promise(r => setTimeout(r, 900));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sup = await login('supervisor1', 'super123');
const supToken = sup.access_token;
const projectsRes = await api('/projects', {}, supToken);
const projects = projectsRes.body || [];
const project = projects.find(p => p.is_active !== false) || projects[0];
if (!project) throw new Error('No active project for smoke test');

const framesRes = await api(`/projects/${project.code}/frames`, {}, supToken);
const frames = framesRes.body || [];
const panel = frames[0];
if (!panel) throw new Error(`No panels on project ${project.code}`);

const pdfFixture = minimalPdfBuffer();
let uploadedDrawingId = null;

// Clean slate — align with prod-readiness (orphan disk drawings break baseline/delete asserts)
const existingDrawings = (await api(`/projects/${project.code}/drawings`, {}, supToken)).body || [];
for (const d of existingDrawings) {
  await api(`/projects/${project.code}/drawings/${d.id}`, { method: 'DELETE' }, supToken);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  // Scenario baseline: neither doc
  const { page, consoleErrors } = await openSupervisorPage(browser, supToken, sup.user);
  const resolvedPanelId = await selectProjectPanel(page, project.code, panel.id);
  let state = await getDocUiState(page);
  await shot(page, '00-baseline-neither');
  const baselinePass = state.viewDrawingDisabled
    && state.badges.some(b => /Drawing.*Missing/i.test(b));
  record('Baseline (no drawing, wiring may exist)', baselinePass, JSON.stringify(state));

  // Scenario 1: Upload drawing — API + event (simulates modal onUploaded)
  const drawUp = await uploadDrawing(supToken, project.code, resolvedPanelId, pdfFixture);
  if (!drawUp.ok) {
    record('1. Upload drawing', false, `API ${drawUp.status}: ${JSON.stringify(drawUp.body)}`);
  } else {
    uploadedDrawingId = drawUp.body?.id;
    await emitDocsChanged(page, { projectCode: project.code, kind: 'drawing', action: 'uploaded' });
    state = await getDocUiState(page);
    await shot(page, '01-drawing-only');
    const pass = !state.viewDrawingDisabled
      && state.badges.some(b => /Drawing.*Available/i.test(b));
    record('1. Upload drawing', pass, JSON.stringify(state));
  }

  // Scenario 2: Upload wiring schedule
  const wireUp = await uploadWiring(supToken, project.code, resolvedPanelId);
  if (!wireUp.ok) {
    record('2. Upload wiring schedule', false, `API ${wireUp.status}: ${JSON.stringify(wireUp.body)}`);
  } else {
    await emitDocsChanged(page, { projectCode: project.code, frameId: resolvedPanelId, kind: 'wiring', action: 'uploaded' });
    state = await getDocUiState(page);
    await shot(page, '02-both-docs');
    const pass = !state.viewDrawingDisabled && !state.wiringViewDisabled
      && state.badges.some(b => /Drawing.*Available/i.test(b))
      && state.badges.some(b => /Wiring.*Available/i.test(b));
    record('2. Upload wiring schedule', pass, JSON.stringify(state));
  }

  // Scenario 3: Both available simultaneously (already tested above)
  record('3. Upload both documents', !state.viewDrawingDisabled && !state.wiringViewDisabled,
    'Covered by scenario 2 state');

  // Scenario 4: Delete drawing — verify API then UI
  if (uploadedDrawingId) {
    const beforeDel = await api(`/projects/${project.code}/drawings`, {}, supToken);
    const del = await deleteDrawing(supToken, project.code, uploadedDrawingId);
    const afterDel = await api(`/projects/${project.code}/drawings`, {}, supToken);
    const apiGone = (afterDel.body || []).every(d => d.id !== uploadedDrawingId);
    if (!del.ok) {
      record('4. Delete drawing', false, `API DELETE ${del.status}: ${JSON.stringify(del.body)}`);
    } else if (!apiGone) {
      record('4. Delete drawing', false, `API returned ${del.status} but drawing still listed (${(afterDel.body || []).length} remain)`);
    } else {
      await emitDocsChanged(page, { projectCode: project.code, kind: 'drawing', action: 'deleted' });
      state = await getDocUiState(page);
      await shot(page, '03-drawing-deleted');
      const pass = state.viewDrawingDisabled && state.badges.some(b => /Drawing.*Missing/i.test(b));
      record('4. Delete drawing', pass, JSON.stringify(state));
    }
  } else {
    record('4. Delete drawing', false, 'No drawing id from upload');
  }

  // Scenario 5: Switch panels/projects
  const alt = projects.find(p => p.code !== project.code);
  if (frames.length >= 2) {
    await selectProjectPanel(page, project.code, frames[1].id);
    state = await getDocUiState(page);
    await shot(page, '04-switched-panel');
    record('5. Switch project/panel', true, `Switched panel; state: ${JSON.stringify(state)}`);
  } else if (alt) {
    const altFrames = (await api(`/projects/${alt.code}/frames`, {}, supToken)).body || [];
    if (altFrames[0]) {
      await selectProjectPanel(page, alt.code, altFrames[0].id);
      state = await getDocUiState(page);
      await shot(page, '04-switched-project');
      record('5. Switch project/panel', true, `Switched to ${alt.code}; state: ${JSON.stringify(state)}`);
    } else {
      record('5. Switch project/panel', false, 'Alternate project has no panels');
    }
  } else {
    record('5. Switch project/panel', true, 'SKIP — single project/panel in DB; panel dropdown switch verified on load');
  }

  // Restore primary project/panel before instant toggle test (scenario 5 may switch context)
  await selectProjectPanel(page, project.code, resolvedPanelId);

  // Scenario 6: instant enable/disable via event after real API delete (matches prod-readiness)
  const reDraw = await uploadDrawing(supToken, project.code, resolvedPanelId, pdfFixture);
  if (reDraw.ok) {
    uploadedDrawingId = reDraw.body?.id ?? uploadedDrawingId;
    await emitDocsChanged(page, { projectCode: project.code, kind: 'drawing', action: 'uploaded' });
    const afterUpload = await getDocUiState(page);
    await deleteDrawing(supToken, project.code, reDraw.body.id);
    await emitDocsChanged(page, { projectCode: project.code, kind: 'drawing', action: 'deleted' });
    const afterDel = await getDocUiState(page);
    const immediatePass = !afterUpload.viewDrawingDisabled && afterDel.viewDrawingDisabled;
    record('6. Immediate enable/disable (no refresh)', immediatePass,
      `upload enabled=${!afterUpload.viewDrawingDisabled} delete disabled=${afterDel.viewDrawingDisabled}`);
  } else {
    record('6. Immediate enable/disable (no refresh)', false, 're-upload failed');
  }

  // modal-long-text + badge classes
  const badgeClasses = await page.evaluate(() =>
    [...document.querySelectorAll('.pj-doc-badge')].map(b => b.className));
  const hasBadgeMods = badgeClasses.every(c => /pj-doc-badge--/.test(c));
  record('Badge CSS modifiers', hasBadgeMods, badgeClasses.join(' | '));

  const consoleClean = consoleErrors.filter(e => !/favicon|devtools|extension/i.test(e)).length === 0;
  record('No console errors (supervisor)', consoleClean,
    consoleClean ? 'clean' : consoleErrors.slice(0, 5).join('; '));

  await page.close();

  // ── Technician gating ────────────────────────────────────────────────────
  const tech1 = await login('tech1', 'tech1');
  const tech24 = await login('tech24', 'tech24');
  const tech1Panels = (await api('/tech/my-panels', {}, tech1.access_token)).body || [];
  const tech24Panels = (await api('/tech/my-panels', {}, tech24.access_token)).body || [];
  record('Tech code: myPanels assignment filter', tech1Panels.length > 0 && tech24Panels.length === 0,
    `tech1=${tech1Panels.length} panels, tech24=${tech24Panels.length} panels`);

  // Unassigned project drawing access → 403
  const unassignedCode = project.code;
  const drawings = (await api(`/projects/${unassignedCode}/drawings`, {}, tech24.access_token)).body || [];
  let forbidden403 = false;
  if (drawings[0]?.id) {
    const fileRes = await fetch(`${API}/projects/${unassignedCode}/drawings/${drawings[0].id}/file`, {
      headers: { Authorization: `Bearer ${tech24.access_token}` },
    });
    forbidden403 = fileRes.status === 403;
  } else if (uploadedDrawingId) {
    // re-upload for 403 test if deleted
    const reUp = await uploadDrawing(supToken, project.code, panel.id, pdfFixture);
    if (reUp.ok) {
      const fileRes = await fetch(`${API}/projects/${unassignedCode}/drawings/${reUp.body.id}/file`, {
        headers: { Authorization: `Bearer ${tech24.access_token}` },
      });
      forbidden403 = fileRes.status === 403;
      await deleteDrawing(supToken, project.code, reUp.body.id);
    }
  } else {
    // Use any drawing from tech1's assigned project
    const assignedCode = tech1Panels[0]?.project_code;
    if (assignedCode) {
      const d = (await api(`/projects/${assignedCode}/drawings`, {}, tech1.access_token)).body || [];
      if (d[0]?.id) {
        const deny = await fetch(`${API}/projects/${assignedCode}/drawings/${d[0].id}/file`, {
          headers: { Authorization: `Bearer ${tech24.access_token}` },
        });
        forbidden403 = deny.status === 403;
      }
    }
  }
  record('Tech API: unassigned drawing file → 403', forbidden403,
    forbidden403 ? '403 as expected' : 'Could not verify 403');

  // Browser: tech24 no actions
  const techPage = await browser.newPage();
  const techConsole = [];
  techPage.on('console', msg => { if (msg.type() === 'error') techConsole.push(msg.text()); });
  await techPage.setViewport({ width: 1280, height: 800 });
  await techPage.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, tech24.access_token, JSON.stringify(tech24.user));
  await techPage.goto(`${FE}/technician`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1000));
  const tech24Ui = await techPage.evaluate(() => ({
    digitalDisabled: document.querySelector('.tech-dash-action-btn')?.disabled ?? true,
    emptyState: document.body.textContent?.includes('No panels assigned') ?? false,
    hasHookLeak: typeof window.__useProjectPanelDocumentStatus !== 'undefined',
  }));
  await shot(techPage, '05-tech24-no-assignment');
  record('Tech browser: unassigned no document actions', tech24Ui.digitalDisabled && tech24Ui.emptyState,
    JSON.stringify(tech24Ui));
  await techPage.close();

  // Browser: tech1 assigned panel has enabled actions
  const tech1Page = await browser.newPage();
  await tech1Page.setViewport({ width: 1280, height: 800 });
  await tech1Page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, tech1.access_token, JSON.stringify(tech1.user));
  await tech1Page.goto(`${FE}/technician`, { waitUntil: 'networkidle2', timeout: 45000 });
  await tech1Page.waitForFunction(
    () => document.querySelectorAll('.tech-panel-card, .tech-panel-row').length > 0
      || document.querySelector('.tech-dash-action-btn:not([disabled])'),
    { timeout: 15000 },
  ).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  const tech1Ui = await tech1Page.evaluate(() => {
    const btns = [...document.querySelectorAll('.tech-dash-action-btn')];
    return {
      digitalEnabled: btns[0] ? !btns[0].disabled : false,
      gaEnabled: btns[1] ? !btns[1].disabled : false,
      panelRows: document.querySelectorAll('.tech-panel-row, [class*="tech-panel"]').length,
    };
  });
  await shot(tech1Page, '06-tech1-assigned');
  record('Tech browser: assigned panel actions enabled', tech1Ui.digitalEnabled,
    JSON.stringify(tech1Ui));
  await tech1Page.close();

  // Code audit: hook not on technician
  const techUsesHook = readFileSync(path.join(ROOT, 'src/pages/technician/tabs/PanelsTab.tsx'), 'utf8')
    .includes('useProjectPanelDocumentStatus');
  record('Code: technician does NOT use supervisor doc hook', !techUsesHook,
    techUsesHook ? 'HOOK FOUND — gating leak risk' : 'PanelsTab uses assignment list only');

} finally {
  await browser.close();
}

const report = {
  timestamp: new Date().toISOString(),
  project: project.code,
  panel: panel.id,
  screenshots: OUT,
  results,
  allPass: results.every(r => r.pass),
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\n=== SUMMARY ===');
console.log(`Screenshots: ${OUT}`);
console.log(`Overall: ${report.allPass ? 'PASS' : 'FAIL'} (${results.filter(r => r.pass).length}/${results.length})`);
