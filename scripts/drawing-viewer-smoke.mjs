/**
 * Read-only smoke: Supervisor "View Drawing" must render PDF pages (not blank).
 * Verifies the PdfDocumentViewer fix. Does NOT mutate any data.
 * Run: node scripts/drawing-viewer-smoke.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FE, CHROME, resolveApiBase, selectProjectPanel } from './smoke-utils.mjs';
import { accountForRole } from './demo-account-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = resolveApiBase();
const OUT = path.join(ROOT, '.smoke-shots', `drawing-viewer-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

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

const isPreviewable = (name = '') => /\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

const results = [];
const record = (scenario, pass, detail) => {
  results.push({ scenario, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${scenario}: ${detail}`);
};

// ── Locate a project + panel that actually has a previewable drawing ──────────
const supervisorAccount = accountForRole('prod_supervisor');
const sup = await login(supervisorAccount.username, supervisorAccount.password);
const token = sup.access_token;
const projects = (await api('/projects', {}, token)).body || [];

let target = null;
for (const p of projects) {
  const drawings = (await api(`/projects/${p.code}/drawings`, {}, token)).body || [];
  const drawing = drawings.find(d => isPreviewable(d.original_name));
  if (drawing) {
    const frames = (await api(`/projects/${p.code}/frames`, {}, token)).body || [];
    target = { project: p, drawing, panelId: frames[0]?.id ?? '' };
    break;
  }
}
if (!target) throw new Error('No project with a previewable drawing found — cannot verify.');
console.log(`Target: project=${target.project.code} drawing="${target.drawing.original_name}" pages?`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));
  await page.setViewport({ width: 1440, height: 960 });
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, token, JSON.stringify(sup.user));
  await page.goto(`${FE}/supervisor`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1000));

  await selectProjectPanel(page, target.project.code, target.panelId);

  // Wait for the View Drawing button to enable (drawing availability resolved)
  await page.waitForFunction(
    () => {
      const b = document.querySelector('.pj-info-action--drawing');
      return b && !b.disabled;
    },
    { timeout: 20000 },
  );
  record('View Drawing button enabled', true, 'drawing availability resolved');

  await page.click('.pj-info-action--drawing');
  await page.waitForSelector('.pdf-viewer-viewport', { timeout: 15000 });

  // THE FIX: a real canvas must render inside the pages host (was blank before)
  await page.waitForSelector('.pdf-viewer-pages canvas.pdf-viewer-canvas', { timeout: 25000 });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT, 'drawing-rendered.png') });

  const render = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('.pdf-viewer-pages canvas.pdf-viewer-canvas')];
    const first = canvases[0];
    const rect = first?.getBoundingClientRect();
    const totalEl = document.querySelector('.pdf-viewer-page-total');
    const errEl = document.querySelector('.pdf-viewer-overlay .form-error');
    return {
      canvasCount: canvases.length,
      firstW: rect ? Math.round(rect.width) : 0,
      firstH: rect ? Math.round(rect.height) : 0,
      pageTotal: totalEl?.textContent?.trim() ?? '',
      errorOverlay: errEl?.textContent?.trim() ?? '',
    };
  });

  record('Canvas rendered (non-blank)', render.canvasCount >= 1 && render.firstW > 50 && render.firstH > 50,
    `count=${render.canvasCount} size=${render.firstW}x${render.firstH}`);
  record('Page count shown', /\/\s*\d+/.test(render.pageTotal), `pageTotal="${render.pageTotal}"`);
  record('No render/load error overlay', render.errorOverlay === '', render.errorOverlay || 'none');

  // Exercise a control: zoom-in should keep pages rendered (no blank regression)
  const zoomBtn = await page.$('button[aria-label="Zoom in"]');
  if (zoomBtn) {
    await zoomBtn.click();
    await new Promise(r => setTimeout(r, 1200));
    const stillRendered = await page.evaluate(() =>
      document.querySelectorAll('.pdf-viewer-pages canvas.pdf-viewer-canvas').length >= 1);
    record('Zoom keeps pages rendered', stillRendered, stillRendered ? 'canvas present after zoom' : 'blank after zoom');
  }

  const pdfErrors = consoleErrors.filter(e => /Could not (load|render) PDF|PdfDocumentViewer/.test(e));
  record('No PDF console errors', pdfErrors.length === 0, pdfErrors.slice(0, 3).join('; ') || 'clean');

  await page.close();
} finally {
  await browser.close();
}

console.log('\n=== SUMMARY ===');
console.log(`Screenshots: ${OUT}`);
const allPass = results.every(r => r.pass);
console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'} (${results.filter(r => r.pass).length}/${results.length})`);
process.exit(allPass ? 0 : 1);
