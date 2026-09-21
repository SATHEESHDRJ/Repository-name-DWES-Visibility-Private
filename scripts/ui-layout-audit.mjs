/**
 * DWES UI layout audit — horizontal overflow, root render, report buttons, single-wire row.
 * Requires dev server (5175) + backend (3001). Uses private demo accounts.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FE, CHROME, resolveApiBase } from './smoke-utils.mjs';
import { accountForRole } from './demo-account-loader.mjs';

const API = resolveApiBase();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1440, height: 960, name: '1440x960' },
  { width: 1280, height: 900, name: '1280x900' },
  { width: 1180, height: 820, name: '1180x820' },
  { width: 1024, height: 768, name: '1024x768' },
  { width: 820, height: 1180, name: '820x1180' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 600, height: 960, name: '600x960' },
  { width: 390, height: 844, name: '390x844' },
];

const ROUTES = [
  { role: 'login', path: '/login', auth: false },
  { role: 'technician', path: '/technician', roleKey: 'wiring_technician' },
  { role: 'supervisor', path: '/supervisor/panels', roleKey: 'prod_supervisor' },
  { role: 'qaqc', path: '/qaqc', roleKey: 'qaqc_engineer' },
  { role: 'admin', path: '/admin/settings', roleKey: 'system_admin' },
  { role: 'director', path: '/director', roleKey: 'ops_director', roleIndex: 1 },
];

const THEMES = ['light', 'dark'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiLogin(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: HTTP ${res.status}`);
  return res.json();
}

async function injectSession(page, token, user) {
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t);
    localStorage.setItem('dwes_user', u);
  }, token, JSON.stringify(user));
}

async function setTheme(page, theme) {
  await page.evaluate(t => {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  }, theme);
  await sleep(350);
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const de = document.scrollingElement || document.documentElement;
    const root = document.querySelector('#root');
    const rootEmpty = !root || root.children.length === 0;
    const pageOverflow = de.scrollWidth - de.clientWidth;

    const reportRows = [...document.querySelectorAll('.sws-report-row, .sup-report-row, .sup-report-list-row')];
    const duplicateReportBtns = reportRows.filter(row => {
      const viewBtns = [...row.querySelectorAll('button')].filter(b => /view report/i.test(b.textContent || ''));
      return viewBtns.length > 1;
    }).length;

    const multiExecRows = document.querySelectorAll('.dwf-shell--single-exec .dwf-table--primary tbody tr, .dwf-shell--single-exec .dwf-table--excel tbody tr').length;
    const hasDigitalWiring = !!document.querySelector('.dwf-shell--single-exec, [data-testid="digital-wiring-workspace"]');

    const overflowEls = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll('.app-shell *, .login-page-root *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2 && r.left >= -2) {
        overflowEls.push({
          el: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')}`,
          over: Math.round(r.right - vw),
        });
      }
    }
    overflowEls.sort((a, b) => b.over - a.over);

    return {
      rootEmpty,
      pageOverflow,
      duplicateReportBtns,
      singleWireRows: multiExecRows,
      hasDigitalWiring,
      cvpPresent: !!document.querySelector('.dwf-cvp'),
      overflowEls: overflowEls.slice(0, 5),
      url: location.pathname,
    };
  });
}

async function auditPage(page, route, viewport, theme) {
  const issues = [];
  try {
    await page.setViewport({ width: viewport.width, height: viewport.height });
    await page.goto(`${FE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await setTheme(page, theme);
    await sleep(route.auth === false ? 600 : 1800);

    const metrics = await measureLayout(page);
    if (metrics.rootEmpty) issues.push('blank #root');
    if (metrics.pageOverflow > 4) issues.push(`horizontal overflow ${metrics.pageOverflow}px`);
    if (metrics.overflowEls?.length) {
      const worst = metrics.overflowEls[0];
      if (worst.over > 4) issues.push(`element overflow: ${worst.el} +${worst.over}px`);
    }
    if (metrics.duplicateReportBtns > 0) issues.push(`${metrics.duplicateReportBtns} report row(s) with duplicate View Report buttons`);
    if (metrics.hasDigitalWiring && metrics.singleWireRows > 1) {
      issues.push(`${metrics.singleWireRows} excel rows in single-wire view (expected 1)`);
    }
    if (metrics.hasDigitalWiring && !metrics.cvpPresent) {
      issues.push('Cable Visual Path missing in digital wiring view');
    }

    return { pass: issues.length === 0, issues, metrics };
  } catch (err) {
    return { pass: false, issues: [`error: ${err.message}`], metrics: null };
  }
}

async function run() {
  console.log('DWES UI Layout Audit');
  console.log('====================\n');

  const sessions = {};
  for (const route of ROUTES) {
    if (route.auth === false) continue;
    const acct = accountForRole(route.roleKey, route.roleIndex ?? 0);
    sessions[route.role] = await apiLogin(acct.username, acct.password);
  }

  let browser;
  const results = [];
  const defects = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (const route of ROUTES) {
      const page = await browser.newPage();
      if (route.auth !== false) {
        const sess = sessions[route.role];
        await injectSession(page, sess.access_token, sess.user);
      }

      for (const theme of THEMES) {
        for (const vp of VIEWPORTS) {
          const key = `${vp.name}|${route.role}|${theme}`;
          process.stdout.write(`Checking ${key}... `);
          const result = await auditPage(page, route, vp, theme);
          results.push({ key, route: route.role, viewport: vp.name, theme, ...result });
          if (result.pass) console.log('PASS');
          else {
            console.log('FAIL:', result.issues.join('; '));
            defects.push({ key, route: route.role, viewport: vp.name, theme, issues: result.issues });
          }
        }
      }
      await page.close();
    }
  } catch (err) {
    console.error('Audit failed:', err.message);
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
  }

  const outDir = path.join(path.dirname(__dirname), 'viewport-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: results.filter(r => !r.pass).length,
    defects,
    results,
  };
  fs.writeFileSync(path.join(outDir, 'layout-audit-report.json'), JSON.stringify(report, null, 2));

  console.log('\n--- Summary ---');
  console.log(`Total: ${report.total}  Passed: ${report.passed}  Failed: ${report.failed}`);
  console.log(`Report: viewport-screenshots/layout-audit-report.json`);
  if (report.failed > 0) process.exitCode = 1;
}

run();
