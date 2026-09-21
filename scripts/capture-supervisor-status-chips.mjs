import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(path.join(process.cwd(), 'e2e', 'package.json'));
const { chromium } = require('playwright');
const OUT = 'docs/evidence/final-two-blockers-2026-09-21_112345/ui/after-gallery-rereview/supervisor';
const BASE = 'http://127.0.0.1:5275';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[autocomplete="username"], input[type="text"]', 'supervisor1');
await page.fill('input[type="password"]', 'super123');
await Promise.all([
  page.waitForURL(/supervisor/, { timeout: 90000 }).catch(() => null),
  page.click('button:has-text("SIGN IN")'),
]);
await page.waitForTimeout(2500);
if ((await page.locator('.login-page-root').count()) > 0) {
  console.log('STILL_LOGIN');
  process.exit(2);
}
await page.goto(`${BASE}/supervisor?tab=status`, { waitUntil: 'networkidle' }).catch(() => null);
await page.waitForSelector('.dwes-status-chip', { timeout: 60000 }).catch(() => null);
await page.waitForTimeout(1500);
fs.mkdirSync(OUT, { recursive: true });
const outPath = path.join(OUT, 'status-chips-1440.png');
await page.screenshot({ path: outPath, fullPage: false });
const chips = await page.locator('.dwes-status-chip').count();
console.log(`OK_STATUS_CHIPS chips=${chips} path=${outPath}`);
await browser.close();
