// Diagnostic browser dump for final verification (no git).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = process.env.DWES_BASE_URL || 'http://localhost:5175';
const OUT = resolve(ROOT, 'logs', 'final-verify-diag.json');
const PANEL_RE = new RegExp('=H001|Panel', 'i');
const TECH_RE = /technician/i;
const SUP_RE = /supervisor/i;
const QA_RE = /qaqc/i;
const DIR_RE = /director/i;
const ADM_RE = /admin/i;
const SIGN_IN_RE = /sign in/i;
const DWS_RE = /Digital Wiring Schedule/i;
const SALES_RE = /Sales Director/i;
const DASH_RE = /Dashboard/i;
const LOGIN_URL_RE = new RegExp('(/$|login)', 'i');
const API_FILTER_RE = /tech|frame|engineering|operational|cable|assign/i;

function loadCreds(rolePrefer) {
  const accounts = JSON.parse(readFileSync(resolve(ROOT, 'backend/seeds/demo-accounts.local.json'), 'utf8'));
  const hit = accounts.find((a) => a.role === rolePrefer)
    || accounts.find((a) => a.username === rolePrefer);
  if (!hit) throw new Error('No account for ' + rolePrefer);
  return hit;
}

async function importPlaywright() {
  try { return await import('playwright'); }
  catch { return await import('../e2e/node_modules/playwright/index.mjs'); }
}

async function loginAs(page, account) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('textbox').first().fill(account.username);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole('button', { name: SIGN_IN_RE }).click();
  await page.waitForTimeout(2500);
  return {
    url: page.url(),
    rootChildren: await page.locator('#root').evaluate((el) => el.childElementCount),
    title: await page.title(),
  };
}

async function dumpTechWiring(page) {
  const apiHits = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/api/')) apiHits.push({ status: res.status(), url: u.slice(0, 200) });
  });

  const wiringBtn = page.getByRole('button', { name: DWS_RE });
  await wiringBtn.waitFor({ state: 'visible', timeout: 30000 });
  if (await wiringBtn.isDisabled()) {
    const card = page.locator('button, [role="button"], .panel-card, [class*="panel"]').filter({ hasText: PANEL_RE }).first();
    if (await card.count()) await card.click();
    await page.waitForTimeout(800);
  }
  await wiringBtn.click();
  await page.waitForTimeout(4000);

  const dom = await page.evaluate(() => {
    const text = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').trim().slice(0, 200) : null;
    };
    const twinRe = /2D Operational Twin/i;
    return {
      url: location.href,
      hasDwfShell: !!document.querySelector('.dwf-shell'),
      emptyText: text('.empty-text'),
      execCount: text('.dwf-exec-count'),
      excelRows: document.querySelectorAll('table.dwf-table--excel tbody tr').length,
      activeRows: document.querySelectorAll('tr.dwf-row--active').length,
      ot2dRoot: !!document.querySelector('.ot2d-root'),
      ot2dSvg: !!document.querySelector('svg.ot2d-svg'),
      ot2dLoading: !!document.querySelector('.ot2d-loading'),
      ot2dError: text('.ot2d-error'),
      twinHeading: Array.from(document.querySelectorAll('h1,h2,h3,h4,.workspace-section-heading-title')).some(
        (el) => twinRe.test(el.textContent || ''),
      ),
      cvp: !!document.querySelector('[aria-label*="visual path" i]'),
      bodySnippet: ((document.body && document.body.innerText) || '').slice(0, 900),
    };
  });

  return {
    dom,
    apiHits: apiHits.filter((h) => API_FILTER_RE.test(h.url)).slice(0, 50),
    twinApi: apiHits.filter((h) => h.url.includes('operational-twin')),
  };
}

async function main() {
  const { chromium } = await importPlaywright();
  const browser = await chromium.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), roles: {} };
  const roles = [
    { key: 'technician', role: 'wiring_technician', expect: TECH_RE },
    { key: 'supervisor', role: 'prod_supervisor', expect: SUP_RE },
    { key: 'qaqc', role: 'qaqc_engineer', expect: QA_RE },
    { key: 'director', role: 'ops_director', expect: DIR_RE },
    { key: 'admin', role: 'system_admin', expect: ADM_RE },
  ];

  for (const r of roles) {
    const acct = loadCreds(r.role);
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    try {
      const login = await loginAs(p, acct);
      const ok = r.expect.test(login.url) && login.rootChildren > 0;
      report.roles[r.key] = { status: ok ? 'PASS' : 'FAIL', login, username: acct.username };
      if (r.key === 'technician' && ok) report.technicianWiring = await dumpTechWiring(p);
    } catch (e) {
      report.roles[r.key] = { status: 'FAIL', error: String((e && e.message) || e) };
    } finally {
      await ctx.close();
    }
  }

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + '/director', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  report.salesDirector = {
    directorRouteWithoutAuth: {
      url: p.url(),
      rootChildren: await p.locator('#root').evaluate((el) => el.childElementCount),
      hasSalesLabel: (await p.getByText(SALES_RE).count()) > 0,
    },
  };
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('textbox').first().fill('sales_demo');
  await p.locator('input[type="password"]').fill('wrong');
  await p.getByRole('button', { name: SIGN_IN_RE }).click();
  await p.waitForTimeout(1500);
  const rootText = await p.locator('#root').innerText();
  report.salesDirector.loginAttempt = {
    url: p.url(),
    stillOnLogin: LOGIN_URL_RE.test(p.url()) || !DASH_RE.test(rootText),
    bodyHasSales: (await p.getByText(SALES_RE).count()) > 0,
  };
  await ctx.close();
  await browser.close();
  mkdirSync(resolve(ROOT, 'logs'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(Object.values(report.roles).some((x) => x.status === 'FAIL') ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });