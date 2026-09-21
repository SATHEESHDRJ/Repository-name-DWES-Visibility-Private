/**
 * Retry only missing AFTER-gallery viewports (throttle-safe).
 * Usage: node scripts/capture-after-gallery-retry.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'e2e', 'package.json'));
const { chromium } = require('playwright');
const OUT = path.join(
  ROOT,
  'docs/evidence/final-two-blockers-2026-09-21_112345/ui/after-gallery-rereview',
);
const BASE = process.env.DWES_UI_BASE || 'http://127.0.0.1:5275';

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const ROLES = [
  { folder: 'supervisor', user: 'supervisor1', pass: 'super123', path: '/supervisor' },
  { folder: 'technician', user: 'tech3', pass: 'tech3', path: '/technician' },
  { folder: 'qa', user: 'qa1', pass: 'qa1', path: '/qa' },
  { folder: 'director', user: 'ops_director1', pass: 'ops_director123', path: '/director' },
  { folder: 'sysadmin', user: 'sysadmin', pass: 'admin123', path: '/admin' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, user, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const userSel = 'input[name="username"], input[autocomplete="username"], input[type="text"]';
  const passSel = 'input[name="password"], input[autocomplete="current-password"], input[type="password"]';
  await page.waitForSelector(userSel, { timeout: 30000 });
  await page.fill(userSel, user);
  await page.fill(passSel, pass);
  await Promise.all([
    page.waitForURL(/\/(supervisor|technician|qa|director|admin|system)/, { timeout: 90000 }).catch(() => null),
    page.click('button[type="submit"], button:has-text("SIGN IN"), button:has-text("Sign in")'),
  ]);
  await sleep(2000);
  if ((await page.locator('.login-page-root').count()) > 0) {
    throw new Error(`Login failed for ${user}`);
  }
}

async function captureOne(browser, role, vp) {
  const dir = path.join(OUT, role.folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${vp.name}.png`);
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await login(page, role.user, role.pass);
    await page.goto(`${BASE}${role.path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
    await sleep(1500);
    await page.screenshot({ path: file, fullPage: false });
    const err = path.join(dir, `${vp.name}.ERROR.txt`);
    if (fs.existsSync(err)) fs.unlinkSync(err);
    console.log('OK', role.folder, vp.name);
  } finally {
    await context.close();
  }
}

async function main() {
  const missing = [];
  for (const role of ROLES) {
    for (const vp of VIEWPORTS) {
      const png = path.join(OUT, role.folder, `${vp.name}.png`);
      if (!fs.existsSync(png)) missing.push({ role, vp });
    }
  }
  console.log('MISSING', missing.length);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const item of missing) {
      let ok = false;
      for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
        try {
          await sleep(12000 * attempt);
          await captureOne(browser, item.role, item.vp);
          ok = true;
        } catch (err) {
          console.error('RETRY_FAIL', item.role.folder, item.vp.name, attempt, err.message);
        }
      }
      if (!ok) {
        fs.writeFileSync(
          path.join(OUT, item.role.folder, `${item.vp.name}.ERROR.txt`),
          `Failed after retries\n`,
        );
      }
    }
  } finally {
    await browser.close();
  }
  console.log('RETRY_DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
