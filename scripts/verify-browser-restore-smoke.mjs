import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(path.join(process.cwd(), 'e2e', 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.DWES_UI_URL || 'http://127.0.0.1:5275';
const OUT = 'docs/evidence/final-two-blockers-2026-09-21_112345/verify/browser-smoke-nest11.txt';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const lines = [];

async function rootOk(route, login) {
  if (login) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    const user = page.locator('input[autocomplete="username"], input[type="text"]').first();
    const pass = page.locator('input[type="password"]').first();
    await user.fill('');
    await pass.fill('');
    await user.fill(login.user);
    await pass.fill(login.pass);
    const submit = page.locator('button.login-btn:not([disabled])');
    await submit.waitFor({ state: 'visible', timeout: 15000 });
    await Promise.all([
      page.waitForURL(new RegExp(login.expect), { timeout: 90000 }).catch(() => null),
      submit.click(),
    ]);
    await page.waitForTimeout(2000);
    if ((await page.locator('.login-page-root').count()) > 0) {
      lines.push(`${login.expect}: still on login url=${page.url()}`);
      return false;
    }
  } else {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        () => {
          const root = document.getElementById('root');
          const t = (root?.innerText || '').trim();
          if (t.length > 20) return true;
          return !!document.querySelector('.login-page-root');
        },
        { timeout: 20000 },
      )
      .catch(() => null);
  }
  const ok = await page.evaluate(() => {
    const root = document.getElementById('root');
    const t = (root?.innerText || '').trim();
    if (t.length > 20) return true;
    return !!document.querySelector('.login-page-root');
  });
  lines.push(`${route || login?.expect}: root=${ok ? 'ok' : 'empty'} url=${page.url()}`);
  return ok;
}

const a = await rootOk('/login');
const b = await rootOk(null, { user: 'tech3', pass: 'tech3', expect: 'technician' });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const pass = a && b;
fs.writeFileSync(OUT, [...lines, `pass: ${pass}`, `timestamp: ${new Date().toISOString()}`].join('\n'));
console.log(pass ? 'BROWSER_SMOKE_PASS' : 'BROWSER_SMOKE_FAIL');
await browser.close();
process.exit(pass ? 0 : 1);
