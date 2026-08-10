/**
 * Extended role workflow probe: Supervisor tabs, Technician LIVE TB 022/D4, Director pages.
 * Cancel-only on write modals. No business-state mutations.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';
const OUT = 'backend/tmp_health_workflows.json';

async function login(page, user, pass) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(600);
  await page.locator('input[name="username"], input#username, input[type="text"]').first().fill(user);
  await page.locator('input[name="password"], input#password, input[type="password"]').first().fill(pass);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').first().click();
  await page.waitForTimeout(2500);
  for (const label of ['Close', 'Dismiss', 'Later', 'Not now', 'Skip']) {
    const b = page.locator(`button:has-text("${label}")`).first();
    if (await b.count()) try { await b.click({ timeout: 300 }); } catch { /* */ }
  }
}

async function dismiss(page) {
  for (const label of ['Cancel', 'Close', 'Dismiss', 'Not now']) {
    const b = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (await b.count()) try { await b.click({ timeout: 400 }); } catch { /* */ }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = { supervisor: {}, technician: {}, director: {}, liveTb: {}, consoleErrors: [], net429: 0 };

  // SUPERVISOR
  {
    const page = await (await browser.newContext()).newPage();
    const consoles = [];
    page.on('console', (m) => { if (m.type() === 'error') consoles.push(m.text().slice(0, 250)); });
    page.on('response', (r) => { if (r.status() === 429) report.net429 += 1; });
    await login(page, 'supervisor1', 'super123');
    report.supervisor.loginUrl = page.url();
    report.supervisor.dashboard = /supervisor/i.test(page.url());
    // Click common nav items if present
    const tabs = ['Projects', 'Summary', 'Frames', 'Assignments', 'Workflow'];
    const tabHits = {};
    for (const t of tabs) {
      const el = page.locator(`text=${t}`).first();
      if (await el.count()) {
        try {
          await el.click({ timeout: 2000 });
          await page.waitForTimeout(800);
          tabHits[t] = true;
        } catch { tabHits[t] = 'click_fail'; }
      } else tabHits[t] = false;
    }
    report.supervisor.tabs = tabHits;
    report.supervisor.consoleErrors = consoles.slice(0, 12);
    await page.context().close();
  }

  // TECHNICIAN + LIVE TB
  {
    const page = await (await browser.newContext()).newPage();
    const consoles = [];
    const matchReqs = [];
    page.on('console', (m) => { if (m.type() === 'error') consoles.push(m.text().slice(0, 250)); });
    page.on('request', (req) => {
      if (req.url().includes('/tb-markers/match')) matchReqs.push(req.url().slice(0, 300));
    });
    page.on('response', (r) => { if (r.status() === 429) report.net429 += 1; });
    await login(page, 'tech3', 'tech3');
    report.technician.loginUrl = page.url();

    // Open panel if visible
    for (const label of ['Resume', 'Start', 'Continue', 'Open']) {
      const b = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await b.count()) {
        try { await b.click({ timeout: 2000 }); await page.waitForTimeout(1500); break; } catch { /* */ }
      }
    }
    // Try select panel 001
    const p001 = page.locator('text=/\\b001\\b|E01/i').first();
    if (await p001.count()) try { await p001.click({ timeout: 2000 }); await page.waitForTimeout(1200); } catch { /* */ }

    for (const label of ['Resume', 'Start', 'Continue', 'Wiring']) {
      const b = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await b.count()) {
        try { await b.click({ timeout: 2000 }); await page.waitForTimeout(1500); break; } catch { /* */ }
      }
    }

    // Search / jump toward 022/D4 if filter exists
    const search = page.locator('input[placeholder*="Search"], input[placeholder*="filter"], input[type="search"]').first();
    if (await search.count()) {
      try { await search.fill('022/D4'); await page.waitForTimeout(800); } catch { /* */ }
    }
    const wireRow = page.locator('text=022/D4').first();
    if (await wireRow.count()) {
      try { await wireRow.click({ timeout: 3000 }); await page.waitForTimeout(1000); report.technician.selected022D4 = true; } catch { report.technician.selected022D4 = 'click_fail'; }
    } else {
      report.technician.selected022D4 = false;
    }

    // LIVE TB VIEW
    const liveTbBtn = page.getByRole('button', { name: /LIVE TB/i }).first()
      .or(page.locator('button:has-text("LIVE TB")').first());
    let liveOpened = false;
    if (await liveTbBtn.count()) {
      try {
        await liveTbBtn.click({ timeout: 4000 });
        await page.waitForTimeout(3500);
        liveOpened = true;
      } catch { /* */ }
    }
    report.technician.liveTbOpened = liveOpened;
    const bodyText = liveOpened ? await page.locator('body').innerText() : '';
    report.liveTb = {
      demoViewVisible: /DEMO VIEW|EXIT DEMO|VISUAL EXAMPLE ONLY|DEMO-001/i.test(bodyText),
      chipHasSrcDevice: /SRC DEVICE\s+87STUB/i.test(bodyText),
      chipHasSrcTbX329: /SRC TB\s+X329/i.test(bodyText),
      chipHasDstTb: /DST TB\s+X5A-C/i.test(bodyText),
      bodySnippet: bodyText.replace(/\s+/g, ' ').slice(0, 500),
      matchUrls: matchReqs,
      matchSendsX329AsSource: matchReqs.some(u => /source_device=X329/i.test(u)),
      matchSendsEmptyOrStub: matchReqs.some(u => /source_device=(?:&|$)|source_device=87STUB/i.test(u) || /source_device=&/.test(u)),
      matchDestX5AC: matchReqs.some(u => /dest_device=X5A-C/i.test(u)),
    };
    await dismiss(page);
    report.technician.consoleErrors = consoles.slice(0, 15);
    await page.screenshot({ path: 'backend/tmp_health_livetb.png', fullPage: true }).catch(() => {});
    await page.context().close();
  }

  // DIRECTOR pages
  {
    const page = await (await browser.newContext()).newPage();
    const mon = [];
    page.on('request', (req) => {
      if (/\/api\/.*monitoring/i.test(req.url())) mon.push({ t: Date.now(), url: req.url().slice(0, 180) });
    });
    page.on('response', (r) => { if (r.status() === 429) report.net429 += 1; });
    await login(page, 'ops_director1', 'ops_director1');
    report.director.loginUrl = page.url();
    const labels = ['Monitoring', 'Live Project', 'Projects Status', 'Status Report', 'Panel-wise', 'One-Side', 'Employee Performance', 'People Working'];
    const hits = {};
    for (const t of labels) {
      const el = page.locator(`text=${t}`).first();
      if (await el.count()) {
        try {
          await el.click({ timeout: 2500 });
          await page.waitForTimeout(1200);
          hits[t] = true;
        } catch { hits[t] = 'click_fail'; }
      } else hits[t] = false;
    }
    // Idle monitoring if we opened it
    await page.locator('text=Monitoring').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const openCount = mon.length;
    await page.waitForTimeout(10000);
    const idleExtra = mon.length - openCount;
    report.director.tabs = hits;
    report.director.monitoring = { openCount, idleExtra10s: idleExtra, total: mon.length, sample: mon.slice(0, 10) };
    await page.context().close();
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
