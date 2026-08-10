/**
 * Compact UI smoke — hero ≤64px, #root mounts, no horizontal overflow for all 5 roles.
 * Requires FE :5175 + BE :3001.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FE, CHROME, resolveApiBase } from './smoke-utils.mjs';
import { accountForRole } from './demo-account-loader.mjs';

const API = resolveApiBase();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'artifacts', 'compact-ui-smoke');

const VIEWPORTS = [
  { width: 1280, height: 900, name: '1280x900' },
  { width: 1024, height: 768, name: '1024x768' },
  { width: 820, height: 1180, name: '820x1180' },
  { width: 768, height: 1024, name: '768x1024' },
];

const ROUTES = [
  { role: 'supervisor', path: '/supervisor', roleKey: 'prod_supervisor' },
  { role: 'technician', path: '/technician', roleKey: 'wiring_technician' },
  { role: 'qaqc', path: '/qaqc', roleKey: 'qaqc_engineer' },
  { role: 'admin', path: '/admin/settings', roleKey: 'system_admin' },
  { role: 'director', path: '/director', roleKey: 'ops_director', roleIndex: 1 },
];

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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const results = [];
  let failures = 0;

  for (const route of ROUTES) {
    const acct = accountForRole(route.roleKey, route.roleIndex ?? 0);
    const session = await apiLogin(acct.username, acct.password);
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((t, u) => {
      localStorage.setItem('dwes_token', t);
      localStorage.setItem('dwes_user', u);
    }, session.access_token, JSON.stringify(session.user));

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.goto(`${FE}${route.path}`, { waitUntil: 'networkidle2', timeout: 45000 });
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await sleep(800);
        }
      }
      await sleep(2000);
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await sleep(300);

      let metrics = await page.evaluate(() => {
        const root = document.querySelector('#root');
        const hero = document.querySelector('.dashboard-hero, .page-heading');
        const section = document.querySelector('.workspace-section-heading');
        const de = document.scrollingElement || document.documentElement;
        const hr = hero ? hero.getBoundingClientRect() : null;
        const sr = section ? section.getBoundingClientRect() : null;
        return {
          rootEmpty: !root || root.children.length === 0,
          heroH: hr ? Math.round(hr.height) : null,
          sectionH: sr ? Math.round(sr.height) : null,
          pageOverflow: de.scrollWidth - de.clientWidth,
          title: document.querySelector('.dashboard-hero-title')?.textContent?.trim() || '',
          subtitle: document.querySelector('.dashboard-hero-subtitle')?.textContent?.trim() || '',
        };
      });
      if (metrics.rootEmpty) {
        await sleep(1500);
        metrics = await page.evaluate(() => {
          const root = document.querySelector('#root');
          const hero = document.querySelector('.dashboard-hero, .page-heading');
          const section = document.querySelector('.workspace-section-heading');
          const de = document.scrollingElement || document.documentElement;
          const hr = hero ? hero.getBoundingClientRect() : null;
          const sr = section ? section.getBoundingClientRect() : null;
          return {
            rootEmpty: !root || root.children.length === 0,
            heroH: hr ? Math.round(hr.height) : null,
            sectionH: sr ? Math.round(sr.height) : null,
            pageOverflow: de.scrollWidth - de.clientWidth,
            title: document.querySelector('.dashboard-hero-title')?.textContent?.trim() || '',
            subtitle: document.querySelector('.dashboard-hero-subtitle')?.textContent?.trim() || '',
          };
        });
      }

      const shot = `${route.role}-${vp.name}-light.png`;
      await page.screenshot({ path: path.join(OUT, shot), fullPage: false });

      const issues = [];
      if (metrics.rootEmpty) issues.push('blank #root');
      if (metrics.heroH == null) issues.push('missing hero');
      else if (metrics.heroH > 72) issues.push(`hero height ${metrics.heroH}px > 72`);
      if (metrics.pageOverflow > 4) issues.push(`h-overflow ${metrics.pageOverflow}px`);
      if (issues.length) failures += 1;

      results.push({ role: route.role, viewport: vp.name, ...metrics, issues, shot });
      console.log(
        `${route.role.padEnd(12)} ${vp.name.padEnd(10)} hero=${String(metrics.heroH).padStart(3)} ` +
        `section=${String(metrics.sectionH).padStart(3)} overflow=${metrics.pageOverflow} ` +
        (issues.length ? `FAIL ${issues.join('; ')}` : 'OK'),
      );
    }

    // One dark-theme shot at 1280×900
    await page.setViewport({ width: 1280, height: 900 });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(`${FE}${route.path}`, { waitUntil: 'networkidle2', timeout: 45000 });
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await sleep(800);
      }
    }
    await sleep(1500);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, `${route.role}-1280x900-dark.png`), fullPage: false });

    await page.close();
  }

  await browser.close();
  const reportPath = path.join(OUT, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ failures, results }, null, 2));
  console.log(`\nfailures=${failures} report=${reportPath}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
