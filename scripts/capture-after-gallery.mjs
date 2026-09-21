/**
 * AFTER gallery capture — local restore only (ports 5275 / 3101).
 * Usage: node scripts/capture-after-gallery.mjs
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

async function login(page, user, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const userSel = 'input[name="username"], input[autocomplete="username"], input[type="text"]';
  const passSel = 'input[name="password"], input[autocomplete="current-password"], input[type="password"]';
  await page.waitForSelector(userSel, { timeout: 30000 });
  await page.fill(userSel, '');
  await page.fill(userSel, user);
  await page.fill(passSel, '');
  await page.fill(passSel, pass);
  await Promise.all([
    page.waitForURL(/\/(supervisor|technician|qa|director|admin|system)/, { timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"], button:has-text("SIGN IN"), button:has-text("Sign in")'),
  ]);
  await page.waitForTimeout(1500);
  if ((await page.locator('.login-page-root').count()) > 0) {
    throw new Error(`Login failed for ${user} — still on login page (${page.url()})`);
  }
}

async function captureRole(browser, role) {
  const dir = path.join(OUT, role.folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      await login(page, role.user, role.pass);
      await page.goto(`${BASE}${role.path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
      await page.waitForTimeout(1200);
      const file = path.join(dir, `${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log('OK', role.folder, vp.name, file);
    } catch (err) {
      console.error('FAIL', role.folder, vp.name, err.message);
      fs.writeFileSync(path.join(dir, `${vp.name}.ERROR.txt`), String(err.stack || err));
    } finally {
      await context.close();
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const role of ROLES) {
      await captureRole(browser, role);
      // Avoid Nest throttler 429 between role logins
      await new Promise((r) => setTimeout(r, 8000));
    }
  } finally {
    await browser.close();
  }
  console.log('GALLERY_DONE', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
