// DWES popup/screen visual audit — headless Chrome via puppeteer-core.
// Logs in per role, opens key popups, saves screenshots to ./shots.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5175';
const OUT = 'C:/Users/sathe/AppData/Local/Temp/claude/c--Users-sathe-OneDrive-Desktop-DWES/0c4b9e9a-a768-4ae1-ac54-95ad873292dd/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const shot = async (page, name) => {
  await new Promise(r => setTimeout(r, 450)); // let animations settle
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot:', name);
};

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  return res.json(); // { access_token, user }
}

async function clickByText(page, text, selector = 'button') {
  const ok = await page.evaluate((sel, t) => {
    const els = [...document.querySelectorAll(sel)];
    const el = els.find(e => e.textContent && e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, selector, text);
  if (!ok) console.log('  !! not found:', text);
  return ok;
}

const esc = async page => { await page.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 350)); };

async function withRole(browser, creds, route, fn, viewport = { width: 1280, height: 800 }) {
  const { access_token, user } = await login(creds.u, creds.p);
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, access_token, JSON.stringify(user));
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  try { await fn(page); } catch (e) { console.log('  step error:', e.message); }
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
});

// ── Supervisor (landscape 13") ──
await withRole(browser, { u: 'supervisor1', p: 'super123' }, '/supervisor', async page => {
  await shot(page, '01-supervisor-projects-1280');
  if (await clickByText(page, 'New Project')) { await shot(page, '02-modal-new-project'); await esc(page); }
  if (await clickByText(page, 'Manage Team')) { await shot(page, '03-modal-manage-team'); await esc(page); }
  if (await clickByText(page, 'Remove'))      { await shot(page, '04-dialog-confirm-remove'); await esc(page); }
  if (await clickByText(page, 'Edit'))        { await shot(page, '05-modal-edit-project'); await esc(page); }
  // Operations tab (sectioned tabs view)
  if (await clickByText(page, 'Operations')) {
    await new Promise(r => setTimeout(r, 700));
    await shot(page, '06-supervisor-operations');
  }
});

// ── Supervisor (portrait 10") ──
await withRole(browser, { u: 'supervisor1', p: 'super123' }, '/supervisor', async page => {
  await shot(page, '07-supervisor-portrait-768');
  if (await clickByText(page, 'New Project')) { await shot(page, '08-modal-new-project-portrait'); await esc(page); }
}, { width: 768, height: 1024 });

// ── Admin ──
await withRole(browser, { u: 'admin1', p: 'admin1' }, '/admin', async page => {
  await shot(page, '09-admin-users-1280');
  if (await clickByText(page, 'Add User')) { await shot(page, '10-modal-add-user'); await esc(page); }
});

// ── QAQC ──
await withRole(browser, { u: 'qa1', p: 'qa1' }, '/qaqc', async page => {
  await shot(page, '11-qaqc-1280');
});

// ── Technician ──
await withRole(browser, { u: 'tech1', p: 'tech1' }, '/technician', async page => {
  await shot(page, '12-technician-1280');
});

await browser.close();
console.log('done');
