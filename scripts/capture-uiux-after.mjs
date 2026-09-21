/**
 * Capture AFTER gallery for UI/UX recovery — 4 roles × 5 viewports.
 * Seeds auth via API into dwes_token / dwes_user (matches useAuthStore).
 * Usage: node scripts/capture-uiux-after.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/evidence/uiux-recovery/after');
const BASE = process.env.DWES_UI_URL || 'http://127.0.0.1:5275';
const API = process.env.DWES_API_URL || 'http://127.0.0.1:3101';
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
];

const ROLES = [
  {
    key: 'supervisor',
    user: 'supervisor1',
    pass: 'super123',
    path: '/supervisor?tab=projects&project=002&panel=frame_1784977437763_0_ahv74',
  },
  { key: 'technician', user: 'tech2', pass: 'tech2', path: '/technician' },
  { key: 'director', user: 'ops_director1', pass: 'ops_director123', path: '/director' },
  { key: 'admin', user: 'sysadmin', pass: 'admin123', path: '/admin/settings' },
];

async function apiLogin(username, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`API login failed for ${username}: ${res.status}`);
  return res.json();
}

async function seedSession(page, auth) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((payload) => {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    localStorage.setItem('dwes_token', payload.access_token);
    if (payload.refresh_token) localStorage.setItem('dwes_refresh_token', payload.refresh_token);
    localStorage.setItem('dwes_user', JSON.stringify(payload.user));
  }, auth);
}

async function gotoStable(page, url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 2500));
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn('goto retry', attempt, url, String(err?.message || err));
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080'],
  });
  const page = await browser.newPage();
  const manifest = [];

  for (const role of ROLES) {
    const auth = await apiLogin(role.user, role.pass);
    await seedSession(page, auth);
    await gotoStable(page, `${BASE}${role.path}`);
    console.log('role', role.key, 'url', page.url());

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await new Promise(r => setTimeout(r, 700));
      const file = `after-${role.key}-${vp.name}.png`;
      const dest = path.join(OUT, file);
      await page.screenshot({ path: dest, fullPage: false });
      const stat = fs.statSync(dest);
      manifest.push({
        role: role.key,
        viewport: vp.name,
        file,
        bytes: stat.size,
        url: page.url(),
      });
      console.log('OK', file, stat.size);
    }
  }

  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, shots: manifest }, null, 2),
  );
  await browser.close();
  console.log('AFTER gallery:', OUT, 'count=', manifest.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
