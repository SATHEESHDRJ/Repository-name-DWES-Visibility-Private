// TEMP — full 5-role page verification: screenshots, console errors, overflow,
// icon-font, workflow dropdown geometry, Mid Change modal. Deleted after use.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { accountForRole } from './demo-account-loader.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5175';
const OUT = 'C:/Users/sathe/AppData/Local/Temp/claude/c--Users-sathe-OneDrive-Desktop-DWES/da53a6e3-a204-4698-825f-c722c0f3e6a7/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));

async function login(u, p) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  });
  if (!res.ok) throw new Error(`login ${u}: ${res.status}`);
  return res.json();
}
async function clickText(page, text, sel = 'button') {
  return page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent && e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; } return false;
  }, sel, text);
}
async function pageChecks(page) {
  return page.evaluate(() => ({
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    iconFont: document.fonts.check('16px "Material Symbols Rounded"'),
  }));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] });

async function role(creds, route, name, fn, viewport = { width: 1280, height: 900 }) {
  const { access_token, user } = await login(creds.username, creds.password);
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 160)); });
  page.on('pageerror', err => errors.push(`PAGEERROR: ${String(err).slice(0, 160)}`));
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((t, u) => { localStorage.setItem('dwes_token', t); localStorage.setItem('dwes_user', u); }, access_token, JSON.stringify(user));
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await wait(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const checks = await pageChecks(page);
  console.log(`${name}: hOverflow=${checks.hOverflow} iconFont=${checks.iconFont}`);
  try { await fn?.(page); } catch (e) { console.log(`  ${name} step error:`, e.message); }
  const uniq = [...new Set(errors)].filter(e => !e.includes('favicon'));
  if (uniq.length) console.log(`  ${name} console errors:`, JSON.stringify(uniq.slice(0, 5)));
  await page.close();
}

// 1. Supervisor + workflow popup
await role(accountForRole('prod_supervisor'), '/supervisor', 'V1-supervisor', async page => {
  if (await clickText(page, 'Workflow')) {
    await wait(1500);
    await page.screenshot({ path: path.join(OUT, 'V2-workflow-popup.png') });
    const geo = await page.evaluate(() => {
      const menu = document.querySelector('.tech-select-menu');
      const box = document.querySelector('[class*="modal-box"]');
      if (!menu || !box) return { menu: Boolean(menu), box: Boolean(box) };
      const m = menu.getBoundingClientRect(), b = box.getBoundingClientRect();
      const rows = [...menu.querySelectorAll('.tech-select-option')];
      const first = rows[0];
      const nameOk = first ? Boolean(first.querySelector('.tech-select-copy strong')?.textContent?.trim()) : false;
      const userOk = first ? Boolean(first.querySelector('.tech-select-copy small')?.textContent?.startsWith('@')) : false;
      const statusOk = first ? /available|assigned/i.test(first.querySelector('.tech-select-status')?.textContent || '') : false;
      return {
        inline: menu.classList.contains('is-inline'),
        insideModal: m.left >= b.left - 1 && m.right <= b.right + 1 && m.top >= b.top - 1 && m.bottom <= b.bottom + 1,
        internalScroll: menu.scrollHeight > menu.clientHeight,
        rows: rows.length,
        disabledRows: rows.filter(r => r.classList.contains('is-disabled')).length,
        rowShape: { nameOk, userOk, statusOk },
      };
    });
    console.log('  workflow dropdown:', JSON.stringify(geo));
    // click first available row -> check Assign button enables (no actual assign)
    const sel = await page.evaluate(() => {
      const row = document.querySelector('.tech-select-option:not(.is-disabled)');
      if (!row) return 'no-row';
      row.click();
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Assign Technician'));
      return btn ? { selected: Boolean(document.querySelector('.tech-select-option.is-selected')), assignEnabled: !btn.disabled } : 'no-btn';
    });
    console.log('  selection check:', JSON.stringify(sel));
    await page.screenshot({ path: path.join(OUT, 'V3-workflow-selected.png') });
    await page.keyboard.press('Escape'); await wait(400);
  } else console.log('  !! Workflow button not found');
});

// 2. Technician + Mid Change
await role(accountForRole('wiring_technician'), '/technician', 'V4-technician', async page => {
  const found = await clickText(page, 'Mid Change') || await clickText(page, 'Mid-Change');
  if (found) {
    await wait(1200);
    await page.screenshot({ path: path.join(OUT, 'V5-midchange-popup.png') });
    const state = await page.evaluate(() => {
      const box = [...document.querySelectorAll('[class*="modal-box"]')].at(-1);
      return box ? box.textContent.slice(0, 200) : 'no-modal';
    });
    console.log('  midchange modal text:', JSON.stringify(state).slice(0, 220));
    await page.keyboard.press('Escape'); await wait(300);
  } else console.log('  (no Mid Change button visible — may require active assignment)');
});

// 3. Admin
await role(accountForRole('system_admin'), '/admin', 'V6-admin', async page => {
  await clickText(page, 'Users'); await wait(700);
  if (await clickText(page, 'Add User')) { await wait(900); await page.screenshot({ path: path.join(OUT, 'V7-admin-adduser.png') }); await page.keyboard.press('Escape'); }
});

// 4. QA/QC
await role(accountForRole('qaqc_engineer'), '/qaqc', 'V8-qaqc');

// 5. Director (second demo account — first is deactivated)
await role(accountForRole('ops_director', 1), '/director', 'V9-director');

await browser.close();
console.log('done');
