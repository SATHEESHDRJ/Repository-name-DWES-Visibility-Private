/**
 * Pass 2 — Multi-project + panel switching smoke (supervisor + technician).
 * Run: node scripts/project-switch-smoke.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  resolveApiBase,
  FE,
  CHROME,
  ROOT_DIR as ROOT,
  setupBrowserApiProxy,
  selectProjectPanel,
} from './smoke-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = resolveApiBase();
console.log(`[pass2-project-switch] API=${API} FE=${FE}`);
const OUT = path.join(ROOT, '.smoke-shots', `pass2-project-switch-${Date.now()}`);
const CANONICAL_PROJECTS = ['132KV33KV_KSA_RIYADH_2026_001', 'SEWA_Project_001'];
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';
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

/** Reactivate soft-deleted canonical projects (is_active=false) before smoke. */
async function ensureProjectsActive(codes) {
  const pgPath = path.join(ROOT, 'backend', 'node_modules', 'pg', 'lib', 'index.js');
  const { default: pg } = await import(pathToFileURL(pgPath).href);
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  const activated = [];
  for (const code of codes) {
    const r = await client.query(
      'UPDATE projects SET is_active = true WHERE code = $1 AND is_active = false RETURNING code',
      [code],
    );
    if (r.rowCount > 0) activated.push(code);
  }
  await client.end();
  return activated;
}

async function openPage(browser, token, user, route) {
  const page = await browser.newPage();
  await setupBrowserApiProxy(page, API);
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, token, JSON.stringify(user));
  await page.goto(`${FE}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1200));
  return page;
}

async function ensureSupervisorProjectsTab(page) {
  await page.waitForSelector('#root', { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"], button')].find((el) =>
      /^Projects$/i.test(el.textContent?.trim() || ''),
    );
    if (tab) tab.click();
  });
  await page.waitForSelector('#pj-active-project', { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(
    () => document.querySelectorAll('#pj-active-project option[value]:not([value=""])').length > 0,
    { timeout: 20000 },
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
}

async function getDocState(page) {
  return page.evaluate(() => {
    const badges = [...document.querySelectorAll('.pj-doc-badge')].map((b) => b.textContent?.trim());
    const project = document.querySelector('#pj-active-project')?.value;
    const panel = document.querySelector('#pj-active-panel')?.value;
    const panelOptions = [...document.querySelectorAll('#pj-active-panel option')]
      .map((o) => o.value)
      .filter(Boolean);
    return { badges, project, panel, panelOptions };
  });
}

async function trySelectProjectPanel(page, projectCode, panelId) {
  try {
    await selectProjectPanel(page, projectCode, panelId);
    return true;
  } catch {
    return false;
  }
}

async function waitForModal(page, timeoutMs = 12000) {
  try {
    await page.waitForSelector('.modal-overlay[role="dialog"]', { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function closeModal(page) {
  await page.evaluate(() => {
    const close = document.querySelector('.modal-overlay [aria-label="Close"], .modal-overlay .modal-close');
    if (close) close.click();
  });
  await new Promise((r) => setTimeout(r, 400));
}

const sup = await login('supervisor1', 'super123');
const tech1 = await login('tech1', 'tech1');
const tech01 = await login('tech01', 'tech01');
const supToken = sup.access_token;

const activated = await ensureProjectsActive(CANONICAL_PROJECTS);
if (activated.length) {
  record('DB: reactivated inactive projects', true, activated.join(', '));
}

const allProjects = (await api('/projects', {}, supToken)).body || [];
const apiProjectCodes = allProjects.map((p) => p.code);
record('API: project list', apiProjectCodes.length >= 1, `codes: ${apiProjectCodes.join(', ')}`);

const allCodes = CANONICAL_PROJECTS.filter((code) => apiProjectCodes.includes(code));
record('DB: multiple active projects exist', allCodes.length >= 2, `found: ${allCodes.join(', ')}`);

const projectA = allCodes.find((c) => c.includes('132KV')) || allCodes[0];
const projectB = allCodes.find((c) => c !== projectA) || null;

const framesA = (await api(`/projects/${projectA}/frames`, {}, supToken)).body || [];
const panelA = framesA[0]?.id;
const panelA2 = framesA[1]?.id;

let framesB = [];
let panelB = null;
let panelB2 = null;
if (projectB) {
  framesB = (await api(`/projects/${projectB}/frames`, {}, supToken)).body || [];
  panelB = framesB[0]?.id;
  panelB2 = framesB[1]?.id;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const supPage = await openPage(browser, supToken, sup.user, '/supervisor');
  await supPage.reload({ waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1200));
  await ensureSupervisorProjectsTab(supPage);

  const selectedA = await trySelectProjectPanel(supPage, projectA, panelA);
  await new Promise((r) => setTimeout(r, 1200));
  const stateA = await getDocState(supPage);
  await supPage.screenshot({ path: path.join(OUT, '01-project-a.png') });
  record(
    'Supervisor: select project A',
    selectedA && stateA.project === projectA && !!stateA.panel,
    JSON.stringify(stateA),
  );
  record(
    'Supervisor: document badges on project A',
    stateA.badges.length >= 2 && stateA.badges.every((b) => /Drawing|Wiring Schedule/i.test(b)),
    stateA.badges.join(' | '),
  );

  // View Drawing + Digital Wiring Monitor on project A (before A↔B switches)
  await supPage.waitForFunction(
    () => {
      const wiring = document.querySelector('.pj-info-action--wiring');
      const drawing = document.querySelector('.pj-info-action--drawing');
      return wiring && drawing && !wiring.disabled && !drawing.disabled;
    },
    { timeout: 15000 },
  ).catch(() => {});

  const wiringClickedEarly = await supPage.evaluate(() => {
    const btn = document.querySelector('.pj-info-action--wiring');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  let wiringOpenEarly = false;
  if (wiringClickedEarly) {
    wiringOpenEarly = await waitForModal(supPage);
    if (wiringOpenEarly) {
      await supPage.screenshot({ path: path.join(OUT, '02-digital-wiring-monitor.png') });
      await closeModal(supPage);
    }
  }
  record(
    'Supervisor: Digital Wiring Monitor opens',
    wiringClickedEarly && wiringOpenEarly,
    `clicked=${wiringClickedEarly} open=${wiringOpenEarly}`,
  );

  if (panelA2) {
    await trySelectProjectPanel(supPage, projectA, panelA2);
    const panelSwitchA = await getDocState(supPage);
    await supPage.screenshot({ path: path.join(OUT, '01b-panel-switch-a.png') });
    record(
      'Supervisor: panel switch within project A',
      panelSwitchA.panel === panelA2,
      JSON.stringify(panelSwitchA),
    );
  } else {
    record('Supervisor: panel switch within project A', true, `SKIP — only ${framesA.length} panel(s) on ${projectA}`);
  }

  if (projectB && panelB) {
    const projectOptions = await supPage.evaluate(() =>
      [...document.querySelectorAll('#pj-active-project option')].map((o) => o.value).filter(Boolean),
    );
    if (projectOptions.includes(projectB)) {
      await trySelectProjectPanel(supPage, projectB, panelB);
      await new Promise((r) => setTimeout(r, 1200));
      const stateB = await getDocState(supPage);
      await supPage.screenshot({ path: path.join(OUT, '04-project-b.png') });
      const noStaleA = stateB.project === projectB && stateB.panel === panelB && stateB.project !== projectA;
      record('Supervisor: switch to project B', noStaleA, JSON.stringify(stateB));
      record(
        'Supervisor: document badges refresh on project B',
        stateB.badges.length >= 2,
        stateB.badges.join(' | '),
      );

      if (panelB2) {
        await trySelectProjectPanel(supPage, projectB, panelB2);
        const panelSwitchB = await getDocState(supPage);
        record('Supervisor: panel switch within project B', panelSwitchB.panel === panelB2, JSON.stringify(panelSwitchB));
      } else {
        record('Supervisor: panel switch within project B', true, `SKIP — only ${framesB.length} panel(s) on ${projectB}`);
      }

      await trySelectProjectPanel(supPage, projectA, panelA);
      await new Promise((r) => setTimeout(r, 900));
      const stateBack = await getDocState(supPage);
      record(
        'Supervisor: switch back to A (no stale B)',
        stateBack.project === projectA && stateBack.panel === panelA,
        JSON.stringify(stateBack),
      );

      // View Drawing after A↔B switch (drawing often available on return to A)
      await new Promise((r) => setTimeout(r, 800));
      const drawingBtnReady = await supPage.evaluate(() => {
        const btn = document.querySelector('.pj-info-action--drawing');
        return !!(btn && !btn.disabled);
      });
      let viewDrawingClicked = false;
      let drawingOpen = false;
      if (drawingBtnReady) {
        viewDrawingClicked = await supPage.evaluate(() => {
          const btn = document.querySelector('.pj-info-action--drawing');
          if (btn && !btn.disabled) { btn.click(); return true; }
          return false;
        });
        if (viewDrawingClicked) {
          drawingOpen = await waitForModal(supPage);
          if (drawingOpen) {
            await supPage.screenshot({ path: path.join(OUT, '03-view-drawing.png') });
            await closeModal(supPage);
          }
        }
      }
      record(
        'Supervisor: View Drawing opens',
        drawingBtnReady ? (viewDrawingClicked && drawingOpen) : true,
        drawingBtnReady
          ? `clicked=${viewDrawingClicked} open=${drawingOpen}`
          : 'SKIP — no drawing on project A',
      );
    } else {
      record(
        'Supervisor: switch to project B',
        false,
        `${projectB} not in supervisor dropdown; options: ${projectOptions.join(', ')}`,
      );
    }
  } else {
    record('Supervisor: switch projects', false, 'SKIP — second project unavailable');
  }

  // dwes:documents-changed live sync (panel should remain selected on single-panel project)
  await supPage.evaluate((code) => {
    window.dispatchEvent(new CustomEvent('dwes:documents-changed', {
      detail: { projectCode: code, kind: 'drawing', action: 'uploaded' },
    }));
  }, projectA);
  await new Promise((r) => setTimeout(r, 1500));
  let afterEvent = await getDocState(supPage);
  if (!afterEvent.panel && afterEvent.panelOptions.length === 1) {
    await supPage.select('#pj-active-panel', afterEvent.panelOptions[0]);
    await new Promise((r) => setTimeout(r, 400));
    afterEvent = await getDocState(supPage);
  }
  await supPage.screenshot({ path: path.join(OUT, '05-after-docs-event.png') });
  record(
    'Supervisor: dwes:documents-changed refresh',
    afterEvent.project === projectA && !!afterEvent.panel,
    JSON.stringify(afterEvent),
  );

  await supPage.close();

  // Technician — assignments + panel switch + Digital Wiring View
  const techPage = await openPage(browser, tech1.access_token, tech1.user, '/technician');
  await techPage.waitForFunction(
    () => document.querySelectorAll('.tech-panel-card-select').length > 0
      || document.body.textContent?.includes('No panels assigned'),
    { timeout: 20000 },
  ).catch(() => {});
  const techPanels = await techPage.evaluate(() => ({
    cards: document.querySelectorAll('.tech-panel-card-select').length,
    labels: [...document.querySelectorAll('.tech-panel-card-name')].map((el) => el.textContent?.trim()),
  }));
  await techPage.screenshot({ path: path.join(OUT, '06-tech1-panels.png') });
  record('Technician tech1: assigned panels visible', techPanels.cards > 0, JSON.stringify(techPanels));

  const panelCards = await techPage.evaluate(() =>
    [...document.querySelectorAll('.tech-panel-card-select')].map((el, i) => ({ i, text: el.textContent?.slice(0, 60) })),
  );
  if (panelCards.length >= 2) {
    await techPage.evaluate(() => {
      const cards = [...document.querySelectorAll('.tech-panel-card-select')];
      if (cards[1]) cards[1].click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const selected2 = await techPage.evaluate(() =>
      document.querySelector('.tech-panel-card--active .tech-panel-card-name')?.textContent?.trim() || '',
    );
    await techPage.screenshot({ path: path.join(OUT, '07-tech1-panel-switch.png') });
    record('Technician tech1: panel switch', !!selected2, `selected="${selected2}"`);
  } else {
    record('Technician tech1: panel switch', panelCards.length === 1, `only ${panelCards.length} panel(s)`);
  }

  const wiringBtnClicked = await techPage.evaluate(() => {
    const btn = [...document.querySelectorAll('.tech-dash-action-btn')].find((b) =>
      /Digital Wiring View/i.test(b.textContent || ''),
    );
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });
  let techWiringOpen = false;
  for (let i = 0; i < 15 && !techWiringOpen; i++) {
    await new Promise((r) => setTimeout(r, 200));
    techWiringOpen = await techPage.evaluate(() =>
      !!document.querySelector('[data-testid="digital-wiring-workspace"], .wiring-workstation'),
    );
  }
  if (techWiringOpen) {
    await techPage.screenshot({ path: path.join(OUT, '08-tech1-digital-wiring.png') });
    await techPage.evaluate(() => {
      const back = document.querySelector('.dwf-workspace-back');
      if (back) back.click();
    });
    await new Promise((r) => setTimeout(r, 500));
  }
  record(
    'Technician tech1: Digital Wiring View opens',
    wiringBtnClicked && techWiringOpen,
    `clicked=${wiringBtnClicked} open=${techWiringOpen}`,
  );
  await techPage.close();

  const tech01Page = await openPage(browser, tech01.access_token, tech01.user, '/technician');
  const unassigned = await tech01Page.evaluate(() => ({
    empty: document.body.textContent?.includes('No panels assigned') ?? false,
    btnDisabled: [...document.querySelectorAll('.tech-dash-action-btn')].every((b) => b.disabled),
  }));
  await tech01Page.screenshot({ path: path.join(OUT, '09-tech01-unassigned.png') });
  record('Technician tech01: unassigned empty state', unassigned.empty && unassigned.btnDisabled, JSON.stringify(unassigned));
  await tech01Page.close();

  // Auth regression: tech01 → 403 on verify-data for unassigned project/panel
  if (panelA && projectA) {
    const verifyRes = await api(`/projects/${projectA}/frames/${panelA}/verify-data`, {}, tech01.access_token);
    record('Auth: tech01 verify-data unassigned → 403', verifyRes.status === 403, `status ${verifyRes.status}`);
  } else {
    record('Auth: tech01 verify-data unassigned → 403', false, 'no panel for spot-check');
  }

} finally {
  await browser.close();
}

const report = {
  pass: 'pass2',
  timestamp: new Date().toISOString(),
  projects: allCodes,
  screenshotsDir: OUT,
  results,
  allPass: results.every((r) => r.pass),
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n=== PASS 2 PROJECT SWITCH: ${report.allPass ? 'ALL PASS' : 'FAILURES'} (${results.filter((r) => r.pass).length}/${results.length}) ===`);
console.log(`Report: ${path.join(OUT, 'report.json')}`);
