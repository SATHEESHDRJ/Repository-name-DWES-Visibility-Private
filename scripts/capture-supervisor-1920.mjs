import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(path.join(process.cwd(), 'e2e', 'package.json'));
const { chromium } = require('playwright');
const OUT = 'docs/evidence/final-two-blockers-2026-09-21_112345/ui/after-gallery-rereview/supervisor';
const BASE = 'http://127.0.0.1:5275';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[autocomplete="username"], input[type="text"]', 'supervisor1');
await page.fill('input[type="password"]', 'super123');
await Promise.all([
  page.waitForURL(/supervisor/, { timeout: 90000 }).catch(() => null),
  page.click('button:has-text("SIGN IN")'),
]);
await page.waitForTimeout(2000);
if ((await page.locator('.login-page-root').count()) > 0) {
  console.log('STILL_LOGIN');
  process.exit(2);
}
await page.goto(`${BASE}/supervisor`, { waitUntil: 'networkidle' }).catch(() => null);
await page.waitForTimeout(1500);
fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: path.join(OUT, '1920x1080.png'), fullPage: false });
const err = path.join(OUT, '1920x1080.ERROR.txt');
if (fs.existsSync(err)) fs.unlinkSync(err);
console.log('OK_SUPER_1920');
await browser.close();
