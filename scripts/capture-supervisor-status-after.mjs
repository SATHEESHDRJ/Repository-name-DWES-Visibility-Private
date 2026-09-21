/** One-shot: Status → Selected Panel desktop AFTER (identity de-dupe evidence). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../docs/evidence/uiux-recovery/after');
const BASE = 'http://127.0.0.1:5275';
const API = 'http://127.0.0.1:3101';
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL =
  '/supervisor?tab=status&project=002&panel=frame_1784977437763_0_ahv74';

const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'supervisor1', password: 'super123' }),
});
if (!res.ok) throw new Error(`login ${res.status}`);
const auth = await res.json();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate((payload) => {
  localStorage.setItem('dwes_token', payload.access_token);
  if (payload.refresh_token) localStorage.setItem('dwes_refresh_token', payload.refresh_token);
  localStorage.setItem('dwes_user', JSON.stringify(payload.user));
}, auth);
await page.goto(`${BASE}${URL}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const selected = tabs.find((t) => /selected panel/i.test(t.textContent || ''));
  if (selected instanceof HTMLElement) selected.click();
});
await new Promise((r) => setTimeout(r, 1500));
const file = 'after-supervisor-status-selected-desktop.png';
await page.screenshot({ path: path.join(OUT, file), fullPage: false });
await browser.close();
console.log('OK', file);
