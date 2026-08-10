/**
 * Full-app health probe: auth roles + Director Monitoring idle network.
 * Read-only where possible. Writes JSON report to stdout.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';
const OUT = process.env.HEALTH_OUT || 'backend/tmp_health_probe.json';

const accounts = [
  { role: 'supervisor', user: 'supervisor1', pass: 'super123', expectPath: /supervisor/i },
  { role: 'technician', user: 'tech3', pass: 'tech3', expectPath: /tech|technician/i },
  { role: 'director', user: 'ops_director1', pass: 'ops_director1', expectPath: /director/i },
];

async function login(page, user, pass) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
  const userInput = page.locator('input[name="username"], input#username, input[type="text"]').first();
  const passInput = page.locator('input[name="password"], input#password, input[type="password"]').first();
  await userInput.waitFor({ timeout: 20000 });
  await userInput.fill(user);
  await passInput.fill(pass);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').first().click();
  await page.waitForTimeout(2500);
  for (const label of ['Close', 'Dismiss', 'Later', 'Not now', 'Skip']) {
    const b = page.locator(`button:has-text("${label}")`).first();
    if (await b.count()) {
      try { await b.click({ timeout: 400 }); } catch { /* ignore */ }
    }
  }
}

async function logout(page) {
  for (const label of ['Logout', 'Log out', 'Sign out']) {
    const b = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await b.count()) {
      try { await b.click({ timeout: 1500 }); await page.waitForTimeout(1000); return; } catch { /* next */ }
    }
  }
  // Clear storage fallback
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    base: BASE,
    auth: [],
    directorMonitoring: null,
    consoleErrors: [],
    networkErrors: [],
  };

  // --- Auth + role isolation ---
  for (const acc of accounts) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoles = [];
    const netErr = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoles.push(msg.text().slice(0, 300));
    });
    page.on('response', (res) => {
      const s = res.status();
      if (s >= 400) netErr.push({ status: s, url: res.url().slice(0, 180) });
    });
    let ok = false;
    let url = '';
    let isolation = null;
    try {
      await login(page, acc.user, acc.pass);
      url = page.url();
      ok = acc.expectPath.test(url) || (await page.locator('text=/Dashboard|Panels|Monitoring|Projects/i').count()) > 0;
      // Cross-role attempt
      const cross = acc.role === 'technician' ? '/supervisor' : '/technician';
      await page.goto(BASE + cross, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const after = page.url();
      isolation = {
        attempted: cross,
        landed: after,
        rejected: !after.includes(cross.replace('/', '')) || after.includes('login') || after === url,
      };
    } catch (e) {
      ok = false;
      isolation = { error: String(e.message || e).slice(0, 200) };
    }
    report.auth.push({
      role: acc.role,
      user: acc.user,
      loginOk: ok,
      url,
      isolation,
      consoleErrors: consoles.slice(0, 10),
      net4xx5xx: netErr.filter(n => !n.url.includes('favicon')).slice(0, 15),
    });
    report.consoleErrors.push(...consoles.map(c => ({ role: acc.role, c })));
    await ctx.close();
  }

  // --- Director Monitoring idle ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const monReqs = [];
    let status429 = 0;
    page.on('request', (req) => {
      const u = req.url();
      if (/monitoring/i.test(u) && /\/api\//i.test(u)) {
        monReqs.push({ t: Date.now(), method: req.method(), url: u.slice(0, 220) });
      }
    });
    page.on('response', (res) => {
      if (res.status() === 429) status429 += 1;
    });
    await login(page, 'ops_director1', 'ops_director1');
    // Open Monitoring tab
    const monTab = page.getByRole('button', { name: /Monitoring/i }).first()
      .or(page.locator('text=Monitoring').first());
    if (await monTab.count()) {
      await monTab.click({ timeout: 5000 }).catch(() => {});
    } else {
      await page.goto(BASE + '/director', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1000);
      await page.locator('text=Monitoring').first().click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(3000);
    const afterOpen = monReqs.length;
    const idleStart = Date.now();
    await page.waitForTimeout(12000);
    const idleEnd = Date.now();
    const idleCount = monReqs.filter(r => r.t >= idleStart && r.t <= idleEnd).length;
    // Navigate away
    const liveTab = page.locator('text=/Live Project|Projects Status|Submitted/i').first();
    if (await liveTab.count()) await liveTab.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const afterLeave = monReqs.length;
    // Return
    await page.locator('text=Monitoring').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const afterReturn = monReqs.length;

    report.directorMonitoring = {
      totalMonitoringApiCalls: monReqs.length,
      afterOpen,
      idleWindowSec: 12,
      idleCalls: idleCount,
      afterLeave,
      afterReturn,
      returnDelta: afterReturn - afterLeave,
      status429,
      sample: monReqs.slice(0, 20),
    };
    await ctx.close();
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
