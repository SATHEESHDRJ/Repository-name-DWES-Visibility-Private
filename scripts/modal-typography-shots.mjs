/**
 * Read-only screenshots of representative popups to calibrate/verify modal typography.
 * Opens: New Project (non-UM), a confirm dialog (AppDialog), and Users (UM reference).
 * Run: node scripts/modal-typography-shots.mjs [tag]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FE, CHROME, resolveApiBase } from './smoke-utils.mjs';
import { accountForRole } from './demo-account-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = resolveApiBase();
const tag = process.argv[2] || 'before';
const OUT = path.join(ROOT, '.smoke-shots', `modal-typo-${tag}-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await sleep(500);
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p });
  console.log('shot:', p);
}

async function clickByText(page, selector, text) {
  const handle = await page.evaluateHandle((sel, t) => {
    const els = [...document.querySelectorAll(sel)];
    return els.find(e => (e.textContent || '').trim().toLowerCase().includes(t.toLowerCase())) || null;
  }, selector, text);
  const el = handle.asElement();
  if (el) { await el.click(); return true; }
  return false;
}

const supervisorAccount = accountForRole('prod_supervisor');
const sup = await login(supervisorAccount.username, supervisorAccount.password);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, sup.access_token, JSON.stringify(sup.user));
  await page.goto(`${FE}/supervisor`, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(1200);

  // 1) New Project modal (non-UM form popup)
  if (await clickByText(page, 'button', 'New Project')) {
    await page.waitForSelector('.modal-box, .modal-box-lg, .modal-box-form', { timeout: 8000 }).catch(() => {});
    await sleep(700);
    await shot(page, '01-new-project');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('New Project button not found');
  }

  // 2) Users / Team Management modal (UM reference — should stay unchanged)
  if (await clickByText(page, 'button', 'Users')) {
    await page.waitForSelector('.modal-box-team', { timeout: 8000 }).catch(() => {});
    await sleep(800);
    await shot(page, '02-users-UM-reference');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('Users button not found');
  }

  // 3) An AppDialog confirm (via the top-bar logout confirm), if reachable
  const openedLogout = await clickByText(page, 'button', 'Logout') || await clickByText(page, 'button', 'Sign out');
  if (openedLogout) {
    await page.waitForSelector('.dlg-message', { timeout: 5000 }).catch(() => {});
    await sleep(500);
    await shot(page, '03-confirm-dialog');
  } else {
    console.log('Logout/confirm not directly reachable — skipped');
  }

  await page.close();
} finally {
  await browser.close();
}
console.log('OUT:', OUT);
