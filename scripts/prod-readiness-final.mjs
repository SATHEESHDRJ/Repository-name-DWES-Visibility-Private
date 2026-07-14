/**
 * DWES Production Readiness — comprehensive verification runner.
 * Run: node scripts/prod-readiness-final.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { resolveApiBase, FE, CHROME, ROOT_DIR as ROOT, filterConsoleErrors, selectProjectPanel } from './smoke-utils.mjs';
import { accountForRole } from './demo-account-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = resolveApiBase();
console.log(`[prod-readiness] API=${API} FE=${FE}`);
const OUT = path.join(ROOT, '.smoke-shots', `prod-ready-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const results = [];
const consoleErrors = [];

function record(category, scenario, pass, detail) {
  results.push({ category, scenario, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | [${category}] ${scenario}: ${detail}`);
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
  return Buffer.from(`%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF`, 'utf8');
}

async function uploadDrawing(token, projectCode, frameId) {
  const form = new FormData();
  form.append('file', new Blob([minimalPdfBuffer()], { type: 'application/pdf' }), 'verify-drawing.pdf');
  if (frameId) form.append('frame_id', frameId);
  const res = await fetch(`${API}/upload/drawing/${projectCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
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
  const form = new FormData();
  form.append('file', new Blob([makeWiringXlsx()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'verify-wiring.xlsx');
  form.append('sheet_name', 'Wiring');
  form.append('mapping', JSON.stringify({ ferrule: 'Ferrule', source: 'Source', destination: 'Destination', color: 'Wire Color' }));
  form.append('header_row', '0');
  if (frameId) form.append('frame_id', frameId);
  const res = await fetch(`${API}/upload/wiring-schedule-mapped/${projectCode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

async function openPage(browser, token, user, route, viewport) {
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errs.push(`[${route}] ${msg.text()}`); });
  page.on('pageerror', (err) => errs.push(`[${route}] ${err.message}`));
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, token, JSON.stringify(user));
  await page.goto(`${FE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1200));
  return { page, errs };
}

async function getDocUiState(page) {
  return page.evaluate(() => {
    const badges = [...document.querySelectorAll('.pj-doc-badge')].map((b) => b.textContent?.trim());
    const viewDrawing = document.querySelector('.pj-info-action--drawing');
    const wiringView = document.querySelector('.pj-info-action--wiring');
    return {
      badges,
      viewDrawingDisabled: viewDrawing?.disabled ?? true,
      wiringViewDisabled: wiringView?.disabled ?? true,
    };
  });
}

async function emitDocsChanged(page, detail) {
  await page.evaluate((d) => {
    window.dispatchEvent(new CustomEvent('dwes:documents-changed', { detail: d }));
  }, detail);
  await new Promise((r) => setTimeout(r, 1200));
}

async function testModalClose(page, openFn, label) {
  const before = await page.evaluate(() => document.querySelectorAll('.modal-overlay').length);
  const opened = await openFn();
  if (!opened) return { pass: false, detail: 'open trigger not found' };
  await new Promise((r) => setTimeout(r, 500));
  const modalVisible = await page.evaluate(() => !!document.querySelector('.modal-overlay'));
  if (!modalVisible) return { pass: false, detail: 'modal did not open' };
  const longTextOk = await page.evaluate(() => {
    const els = document.querySelectorAll('.modal-long-text, .modal-filename, .dlg-message');
    return els.length === 0 || [...els].every((el) => getComputedStyle(el).overflowWrap !== 'normal' || el.classList.contains('modal-long-text'));
  });
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  const closedEsc = await page.evaluate(() => !document.querySelector('.modal-overlay'));
  return { pass: modalVisible && closedEsc && longTextOk, detail: `open=${modalVisible} esc=${closedEsc} longText=${longTextOk}` };
}

// ── API pre-checks ───────────────────────────────────────────────────────────
const supervisorAccount = accountForRole('prod_supervisor');
const technicianAccount = accountForRole('wiring_technician');
const unassignedTechnicianAccount = accountForRole('wiring_technician', 1);
const adminAccount = accountForRole('system_admin');
const directorAccount = accountForRole('ops_director');
const qaAccount = accountForRole('qaqc_engineer');
const sup = await login(supervisorAccount.username, supervisorAccount.password);
const tech1 = await login(technicianAccount.username, technicianAccount.password);
const tech24 = await login(unassignedTechnicianAccount.username, unassignedTechnicianAccount.password);
const supToken = sup.access_token;

const projects = (await api('/projects', {}, supToken)).body || [];
const project = projects.find((p) => p.is_active !== false) || projects[0];
if (!project) throw new Error('No project');

const frames = (await api(`/projects/${project.code}/frames`, {}, supToken)).body || [];
const panel = frames[0];
if (!panel) throw new Error('No panel');

// Clean slate for drawing test
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
  // ── Supervisor doc workflow ──────────────────────────────────────────────
  const { page: supPage, errs: supErrs } = await openPage(browser, supToken, sup.user, '/supervisor', { width: 1280, height: 800 });
  const resolvedPanelId = await selectProjectPanel(supPage, project.code, panel.id);

  let state = await getDocUiState(supPage);
  record('Supervisor Docs', 'Baseline (no drawing, wiring may exist)', state.viewDrawingDisabled,
    JSON.stringify(state));

  const drawUp = await uploadDrawing(supToken, project.code, resolvedPanelId);
  if (drawUp.ok) {
    await emitDocsChanged(supPage, { projectCode: project.code, kind: 'drawing', action: 'uploaded' });
    state = await getDocUiState(supPage);
    record('Supervisor Docs', '1. Upload drawing → View Drawing enabled', !state.viewDrawingDisabled, JSON.stringify(state));
  } else {
    record('Supervisor Docs', '1. Upload drawing', false, `${drawUp.status}`);
  }

  const wireUp = await uploadWiring(supToken, project.code, resolvedPanelId);
  if (wireUp.ok) {
    await emitDocsChanged(supPage, { projectCode: project.code, frameId: resolvedPanelId, kind: 'wiring', action: 'uploaded' });
    state = await getDocUiState(supPage);
    record('Supervisor Docs', '2. Upload wiring → both enabled', !state.viewDrawingDisabled && !state.wiringViewDisabled, JSON.stringify(state));
  } else {
    record('Supervisor Docs', '2. Upload wiring', wireUp.status === 409 || wireUp.status === 400, `status ${wireUp.status} (may already exist)`);
    state = await getDocUiState(supPage);
    record('Supervisor Docs', '2. Wiring state after upload attempt', !state.wiringViewDisabled, JSON.stringify(state));
  }

  record('Supervisor Docs', '3. Both documents available', !state.viewDrawingDisabled && !state.wiringViewDisabled, JSON.stringify(state));

  const drawings = (await api(`/projects/${project.code}/drawings`, {}, supToken)).body || [];
  if (drawings[0]?.id) {
    await api(`/projects/${project.code}/drawings/${drawings[0].id}`, { method: 'DELETE' }, supToken);
    await emitDocsChanged(supPage, { projectCode: project.code, kind: 'drawing', action: 'deleted' });
    state = await getDocUiState(supPage);
    record('Supervisor Docs', '4. Delete drawing → View Drawing disabled', state.viewDrawingDisabled && !state.wiringViewDisabled, JSON.stringify(state));
  }

  // Scenario 6: toggle drawing via event (API already deleted above; re-upload then delete via API + event)
  const reDraw = await uploadDrawing(supToken, project.code, resolvedPanelId);
  if (reDraw.ok) {
    await emitDocsChanged(supPage, { projectCode: project.code, kind: 'drawing', action: 'uploaded' });
    const afterUpload = await getDocUiState(supPage);
    await api(`/projects/${project.code}/drawings/${reDraw.body.id}`, { method: 'DELETE' }, supToken);
    await emitDocsChanged(supPage, { projectCode: project.code, kind: 'drawing', action: 'deleted' });
    const afterDel = await getDocUiState(supPage);
    record('Supervisor Docs', '6. Instant enable/disable (no refresh)', !afterUpload.viewDrawingDisabled && afterDel.viewDrawingDisabled,
      `upload enabled=${!afterUpload.viewDrawingDisabled} delete disabled=${afterDel.viewDrawingDisabled}`);
  } else {
    record('Supervisor Docs', '6. Instant enable/disable (no refresh)', false, 're-upload failed');
  }

  record('Supervisor Docs', 'Console errors', filterConsoleErrors(supErrs).length === 0,
    filterConsoleErrors(supErrs).slice(0, 3).join('; ') || 'clean');

  // Modal smoke supervisor
  await supPage.waitForSelector('#pj-active-project, .pj-actions-toolbar', { timeout: 15000 }).catch(() => {});
  const supModal = await testModalClose(supPage, async () => {
    try {
      await supPage.waitForFunction(() =>
        [...document.querySelectorAll('button.pj-action-btn, button')].some((b) => {
          const labelSpan = b.querySelector('span:not(.ui-icon)');
          const text = labelSpan?.textContent?.trim()
            || (() => {
              const iconText = [...b.querySelectorAll('span.ui-icon')].map((s) => s.textContent?.trim() || '').join('');
              const full = b.textContent?.trim() || '';
              return iconText && full.startsWith(iconText) ? full.slice(iconText.length).trim() : full;
            })();
          return /New Project/i.test(text) && !b.disabled;
        }),
      { timeout: 12000 });
    } catch {
      return false;
    }
    return supPage.evaluate(() => {
      const labelOf = (b) => {
        const labelSpan = b.querySelector('span:not(.ui-icon)');
        if (labelSpan?.textContent?.trim()) return labelSpan.textContent.trim();
        const iconText = [...b.querySelectorAll('span.ui-icon')].map((s) => s.textContent?.trim() || '').join('');
        const full = b.textContent?.trim() || '';
        return iconText && full.startsWith(iconText) ? full.slice(iconText.length).trim() : full;
      };
      const btn = [...document.querySelectorAll('button.pj-action-btn')].find((b) => /^New Project$/i.test(labelOf(b)))
        || [...document.querySelectorAll('button')].find((b) => /New Project/i.test(labelOf(b)));
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
  }, 'New Project');
  record('Modals', 'Supervisor New Project (ESC close)', supModal.pass, supModal.detail);

  await supPage.screenshot({ path: path.join(OUT, 'supervisor-1280.png') });
  await supPage.close();

  // ── Technician gating ────────────────────────────────────────────────────
  const t1Panels = (await api('/tech/my-panels', {}, tech1.access_token)).body || [];
  const t24Panels = (await api('/tech/my-panels', {}, tech24.access_token)).body || [];
  record('Tech Gating', 'myPanels assignment filter', t1Panels.length > 0 && t24Panels.length === 0,
    `tech1=${t1Panels.length}, tech24=${t24Panels.length}`);

  // Re-upload drawing for 403 test
  const reUp = await uploadDrawing(supToken, project.code, resolvedPanelId);
  if (reUp.ok) {
    const fileRes = await fetch(`${API}/projects/${project.code}/drawings/${reUp.body.id}/file`, {
      headers: { Authorization: `Bearer ${tech24.access_token}` },
    });
    record('Tech Gating', 'API: unassigned drawing file → 403', fileRes.status === 403, `status ${fileRes.status}`);
  }

  const { page: tech24Page } = await openPage(browser, tech24.access_token, tech24.user, '/technician', { width: 1280, height: 800 });
  const tech24Ui = await tech24Page.evaluate(() => ({
    digitalDisabled: document.querySelector('.tech-dash-action-btn')?.disabled ?? true,
    emptyState: document.body.textContent?.includes('No panels assigned') ?? false,
  }));
  record('Tech Gating', 'Browser: unassigned no actions', tech24Ui.digitalDisabled && tech24Ui.emptyState, JSON.stringify(tech24Ui));
  await tech24Page.close();

  const { page: tech1Page } = await openPage(browser, tech1.access_token, tech1.user, '/technician', { width: 1280, height: 800 });
  const tech1Ui = await tech1Page.evaluate(() => ({
    digitalEnabled: document.querySelector('.tech-dash-action-btn') ? !document.querySelector('.tech-dash-action-btn').disabled : false,
    panelCards: document.querySelectorAll('.tech-panel-card').length,
  }));
  record('Tech Gating', 'Browser: assigned actions enabled', tech1Ui.digitalEnabled && tech1Ui.panelCards > 0, JSON.stringify(tech1Ui));

  const techWiring = await tech1Page.evaluate(() => {
    const btn = document.querySelector('.tech-dash-action-btn');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  let wiringOpen = false;
  for (let i = 0; i < 15 && !wiringOpen; i++) {
    await new Promise((r) => setTimeout(r, 200));
    wiringOpen = await tech1Page.evaluate(() =>
      !!document.querySelector('[data-testid="digital-wiring-workspace"], .wiring-workstation'),
    );
  }
  if (wiringOpen) {
    const escClosed = await tech1Page.evaluate(() => {
      const back = document.querySelector('.dwf-workspace-back');
      if (back) { back.click(); return true; }
      return false;
    });
    await new Promise((r) => setTimeout(r, 500));
    record('Modals', 'Technician Digital Wiring opens/closes', techWiring && wiringOpen && escClosed, `clicked=${techWiring} open=${wiringOpen} back=${escClosed}`);
  } else {
    record('Modals', 'Technician Digital Wiring opens/closes', false, `clicked=${techWiring} open=${wiringOpen}`);
  }
  await tech1Page.close();

  // ── All roles × viewports ────────────────────────────────────────────────
  const roles = [
    { u: adminAccount.username, p: adminAccount.password, route: '/admin', label: 'Admin' },
    { u: directorAccount.username, p: directorAccount.password, route: '/director', label: 'Director' },
    { u: supervisorAccount.username, p: supervisorAccount.password, route: '/supervisor', label: 'Supervisor' },
    { u: qaAccount.username, p: qaAccount.password, route: '/qaqc', label: 'QA/QC' },
    { u: technicianAccount.username, p: technicianAccount.password, route: '/technician', label: 'Technician' },
  ];
  const viewports = [
    { w: 1280, h: 800, tag: 'desktop' },
    { w: 1024, h: 768, tag: 'laptop' },
    { w: 834, h: 1112, tag: 'tablet' },
  ];

  for (const role of roles) {
    const sess = await login(role.u, role.p);
    for (const vp of viewports) {
      const { page, errs } = await openPage(browser, sess.access_token, sess.user, role.route, { width: vp.w, height: vp.h });
      const mounted = await page.evaluate(() => {
        const root = document.getElementById('root');
        return !!(root && root.innerText.trim().length > 30);
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
      consoleErrors.push(...errs);
      record('Role Mount', `${role.label} @ ${vp.tag}`, mounted && !overflow,
        `root=${mounted} hOverflow=${overflow} errs=${errs.length}`);
      const shotName = `${role.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${vp.tag}.png`;
      await page.screenshot({ path: path.join(OUT, shotName) });
      await page.close();
    }
  }

  // Admin modal
  const adminSess = await login(adminAccount.username, adminAccount.password);
  const { page: adminPage } = await openPage(browser, adminSess.access_token, adminSess.user, '/admin', { width: 1280, height: 800 });
  const adminModal = await testModalClose(adminPage, async () => adminPage.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Add User/i.test(b.textContent || ''));
    if (btn) { btn.click(); return true; }
    return false;
  }), 'Add User');
  record('Modals', 'Admin Add User (ESC close)', adminModal.pass, adminModal.detail);
  await adminPage.close();

} finally {
  await browser.close();
}

const report = {
  timestamp: new Date().toISOString(),
  project: project.code,
  panel: panel.id,
  screenshotsDir: OUT,
  results,
  allPass: results.every((r) => r.pass),
  passCount: results.filter((r) => r.pass).length,
  total: results.length,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n=== FINAL: ${report.allPass ? 'ALL PASS' : 'DEVIATIONS'} (${report.passCount}/${report.total}) ===`);
console.log(`Report: ${path.join(OUT, 'report.json')}`);
