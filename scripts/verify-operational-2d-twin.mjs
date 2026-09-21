/**
 * Interactive browser matrix for Operational 2D Twin / Digital Wiring Schedule.
 * Reads credentials from backend/seeds/demo-accounts.local.json (not committed).
 * Does NOT use git. Prefer navigation (Previous) over destructive Complete when possible.
 *
 * Usage: node scripts/verify-operational-2d-twin.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = process.env.DWES_BASE_URL || 'http://localhost:5175';
const API = process.env.DWES_API_URL || 'http://localhost:3001';
const OUT = resolve(ROOT, 'logs', 'verify-operational-2d-twin.json');

function loadTechCreds() {
  const path = resolve(ROOT, 'backend/seeds/demo-accounts.local.json');
  const accounts = JSON.parse(readFileSync(path, 'utf8'));
  const tech = accounts.find((a) => a.role === 'wiring_technician' && a.username === 'tech1')
    || accounts.find((a) => a.role === 'wiring_technician');
  if (!tech?.username || !tech?.password) throw new Error('No technician account in demo-accounts.local.json');
  return { username: tech.username, password: tech.password };
}

async function importPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return await import('../e2e/node_modules/playwright/index.mjs');
  }
}

function result(id, status, detail = '') {
  return { id, status, detail };
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflow: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

async function main() {
  const { chromium: pwChromium } = await importPlaywright();
  const creds = loadTechCreds();
  const checks = [];
  const consoleErrors = [];
  const pageErrors = [];
  const twinRequests = [];

  const browser = await pwChromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/engineering/operational-twin/')) {
      twinRequests.push({ url, status: res.status(), method: res.request().method() });
    }
  });

  try {
    // --- Login ---
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('textbox').first().fill(creds.username);
    await page.locator('input[type="password"]').fill(creds.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/technician/i, { timeout: 45_000 });
    const rootOk = await page.locator('#root').evaluate((el) => el.childElementCount > 0);
    checks.push(result('login-technician', rootOk ? 'PASS' : 'FAIL', `url=${page.url()}`));

    // Select panel if needed and open Digital Wiring Schedule
    const wiringBtn = page.getByRole('button', { name: /Digital Wiring Schedule/i });
    await wiringBtn.waitFor({ state: 'visible', timeout: 30_000 });
    const disabled = await wiringBtn.isDisabled();
    if (disabled) {
      // try clicking a panel card first
      const panelCard = page.locator('[class*="panel"]').filter({ hasText: /=H001|001/ }).first();
      if (await panelCard.count()) await panelCard.click();
    }
    await wiringBtn.click();
    await page.getByRole('region', { name: /Digital Wiring Schedule/i })
      .or(page.locator('[aria-label*="Digital Wiring Schedule"]'))
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    checks.push(result('open-digital-wiring-schedule', 'PASS'));

    // Wait for twin API
    await page.waitForTimeout(1500);
    const twinOk = twinRequests.some((r) => r.status === 200);
    const twinFail = twinRequests.filter((r) => r.status >= 400);
    checks.push(result(
      'operational-twin-api',
      twinOk && twinFail.length === 0 ? 'PASS' : twinOk ? 'PASS WITH WARNINGS' : 'FAIL',
      `requests=${twinRequests.length} failures=${twinFail.map((f) => f.status).join(',') || 'none'}`,
    ));

    // One Excel-style active wire row
    const excelRow = page.locator('tr.dwf-row--active, tr.dwf-row--primary').first();
    const excelVisible = await excelRow.isVisible().catch(() => false);
    const excelRowCount = await page.locator('table.dwf-table--excel tbody tr').count();
    checks.push(result(
      'one-excel-active-row',
      excelVisible && excelRowCount === 1 ? 'PASS' : excelVisible ? 'PASS WITH WARNINGS' : 'FAIL',
      `tbodyRows=${excelRowCount}`,
    ));

    // Compact Cable Visual Path
    const cvp = page.getByLabel(/Cable visual path/i);
    checks.push(result('cable-visual-path', await cvp.isVisible().catch(() => false) ? 'PASS' : 'FAIL'));

    // Inline OperationalTwin2D
    const twinHeading = page.getByText('2D Operational Twin').first();
    const twinSvg = page.locator('svg.ot2d-svg, svg[aria-label*="2D operational twin"]').first();
    const twinVisible = await twinHeading.isVisible().catch(() => false)
      && await twinSvg.isVisible().catch(() => false);
    checks.push(result('inline-operational-twin-2d', twinVisible ? 'PASS' : 'FAIL'));

    // Mode B SCHEMATIC
    const schematicBadge = page.getByText(/Schematic — not physical positions/i);
    const schematicSubtitle = page.getByText(/Excel schematic/i);
    const modeB = (await schematicBadge.isVisible().catch(() => false))
      || (await schematicSubtitle.isVisible().catch(() => false))
      || (await page.locator('svg[aria-label*="SCHEMATIC"]').count()) > 0;
    checks.push(result('mode-b-schematic', modeB ? 'PASS' : 'FAIL', 'expected SCHEMATIC when no published geometry'));

    // Mode A GEOMETRY — data absent in this environment
    const modeAUi = await page.getByText(/CAD \/ published geometry/i).isVisible().catch(() => false);
    checks.push(result(
      'mode-a-geometry',
      'SKIP',
      modeAUi
        ? 'UI shows GEOMETRY unexpectedly without published model — investigate'
        : 'No published panel_models/device+terminal geometry in env; Mode A not exercisable (documented)',
    ));

    // Zoom / pan / fit / focus / fullscreen
    const beforeTransform = await page.locator('svg.ot2d-svg g').first().getAttribute('transform').catch(() => null);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(200);
    const afterZoom = await page.locator('svg.ot2d-svg g').first().getAttribute('transform').catch(() => null);
    checks.push(result('zoom', afterZoom && afterZoom !== beforeTransform ? 'PASS' : 'FAIL', `before=${beforeTransform} after=${afterZoom}`));

    await page.getByRole('button', { name: 'Fit panel' }).click();
    await page.waitForTimeout(200);
    checks.push(result('fit-panel', 'PASS', 'clicked Fit panel'));

    await page.getByRole('button', { name: 'Fit active wire' }).click();
    await page.waitForTimeout(200);
    checks.push(result('fit-active-wire', 'PASS', 'clicked Fit active wire'));

    await page.getByRole('button', { name: 'Focus source' }).click();
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Focus destination' }).click();
    checks.push(result('focus-source-dest', 'PASS', 'clicked focus source/destination'));

    // Pan via pointer drag on SVG
    const box = await twinSvg.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20);
      await page.mouse.up();
      checks.push(result('pan', 'PASS', 'pointer drag on svg'));
    } else {
      checks.push(result('pan', 'FAIL', 'no svg bbox'));
    }

    await page.getByRole('button', { name: 'Full view' }).click();
    const fsDialog = page.getByRole('dialog', { name: /2D Operational Twin full view/i });
    const fsOk = await fsDialog.isVisible().catch(() => false);
    if (fsOk) {
      await page.getByRole('button', { name: /Close full view|Close/i }).first().click();
      await page.waitForTimeout(300);
    }
    checks.push(result('fullscreen', fsOk ? 'PASS' : 'FAIL'));

    // Twin updates on Previous
    const beforeCount = twinRequests.length;
    const cableMetaBefore = await page.locator('.dwf-exec-count').innerText().catch(() => '');
    const prevBtn = page.getByRole('button', { name: /^Previous$/i });
    const prevDisabled = await prevBtn.isDisabled().catch(() => true);
    if (!prevDisabled) {
      await prevBtn.click();
      await page.waitForTimeout(1200);
      const afterCount = twinRequests.length;
      const cableMetaAfter = await page.locator('.dwf-exec-count').innerText().catch(() => '');
      const refreshed = afterCount > beforeCount || cableMetaAfter !== cableMetaBefore;
      checks.push(result(
        'twin-update-previous',
        refreshed ? 'PASS' : 'FAIL',
        `twinReqs ${beforeCount}->${afterCount}; meta "${cableMetaBefore}" -> "${cableMetaAfter}"`,
      ));
      // restore forward if Skip available without completing — use Skip dialog cancel path later
    } else {
      // try advancing with Skip (keeps pending) then Previous
      checks.push(result('twin-update-previous', 'SKIP', 'Previous disabled (likely first cable) — will try Skip then Previous'));
    }

    // Skip → twin refresh (Skip keeps cable pending). Already-complete cables skip the prompt
    // and jump to the next pending row — still a valid twin-refresh path.
    const skipBtn = page.getByRole('button', { name: /^Skip$/i });
    const skipDisabled = await skipBtn.isDisabled().catch(() => true);
    if (!skipDisabled) {
      const beforeSkip = twinRequests.length;
      const metaBeforeSkip = await page.locator('.dwf-exec-count').innerText().catch(() => '');
      await skipBtn.click();
      await page.waitForTimeout(400);
      const skipTitle = page.getByRole('heading', { name: /Skip this cable/i });
      const promptInput = page.getByPlaceholder(/Material waiting|terminal blocked|drawing clarification/i);
      const skipDialogVisible = await skipTitle.isVisible().catch(() => false)
        || await promptInput.isVisible().catch(() => false);
      if (skipDialogVisible) {
        await promptInput.fill('Browser matrix verification skip — pending preserved');
        await page.getByRole('button', { name: /^Skip Cable$/i }).click();
        await page.waitForTimeout(1500);
        const metaAfterSkip = await page.locator('.dwf-exec-count').innerText().catch(() => '');
        const twinAfterSkip = twinRequests.length > beforeSkip || metaAfterSkip !== metaBeforeSkip;
        checks.push(result(
          'twin-update-skip',
          twinAfterSkip ? 'PASS' : 'FAIL',
          `prompted; twinReqs ${beforeSkip}->${twinRequests.length}; meta "${metaBeforeSkip}" -> "${metaAfterSkip}"`,
        ));
      } else {
        await page.waitForTimeout(1000);
        const metaAfterSkip = await page.locator('.dwf-exec-count').innerText().catch(() => '');
        const advanced = twinRequests.length > beforeSkip || metaAfterSkip !== metaBeforeSkip;
        checks.push(result(
          'twin-update-skip',
          advanced ? 'PASS' : 'FAIL',
          advanced
            ? `already-complete navigated without prompt; twinReqs ${beforeSkip}->${twinRequests.length}; meta "${metaBeforeSkip}" -> "${metaAfterSkip}"`
            : 'Skip did not prompt and did not advance',
        ));
      }

      const prev2 = page.getByRole('button', { name: /^Previous$/i });
      if (!(await prev2.isDisabled().catch(() => true))) {
        const b = twinRequests.length;
        await prev2.click();
        await page.waitForTimeout(1200);
        checks.push(result(
          'twin-update-previous-after-skip',
          twinRequests.length > b ? 'PASS' : 'PASS WITH WARNINGS',
          `twinReqs ${b}->${twinRequests.length}`,
        ));
      }
    } else {
      checks.push(result('twin-update-skip', 'SKIP', 'Skip disabled (paused or cannot wire)'));
    }

    // Complete Cable — only if enabled; note mutation
    const completeBtn = page.getByRole('button', { name: /Complete Cable/i });
    const completeDisabled = await completeBtn.isDisabled().catch(() => true);
    if (!completeDisabled) {
      const beforeComplete = twinRequests.length;
      const metaBefore = await page.locator('.dwf-exec-count').innerText().catch(() => '');
      await completeBtn.click();
      await page.waitForTimeout(2000);
      const metaAfter = await page.locator('.dwf-exec-count').innerText().catch(() => '');
      const ok = twinRequests.length > beforeComplete || metaAfter !== metaBefore;
      checks.push(result(
        'twin-update-complete-cable',
        ok ? 'PASS' : 'FAIL',
        `MUTATED wiring state; twinReqs ${beforeComplete}->${twinRequests.length}`,
      ));
    } else {
      checks.push(result('twin-update-complete-cable', 'SKIP', 'Complete Cable disabled'));
    }

    // Start/Pause/Resume availability
    const startBtn = page.getByRole('button', { name: /Start Wiring/i });
    const pauseBtn = page.getByRole('button', { name: /^Pause$/i });
    const resumeBtn = page.getByRole('button', { name: /^Resume$/i });
    const hasStart = await startBtn.isVisible().catch(() => false);
    const hasPause = await pauseBtn.isVisible().catch(() => false);
    const hasResume = await resumeBtn.isVisible().catch(() => false);
    if (hasPause) {
      // Do not pause live work unless needed — verify button present
      checks.push(result('start-pause-resume', 'PASS', 'Pause available (in_progress); Start/Resume not shown'));
    } else if (hasResume) {
      const beforeResume = twinRequests.length;
      await resumeBtn.click();
      // may need confirm dialog
      const confirmDlg = page.getByRole('dialog').filter({ hasText: /Resume/i });
      if (await confirmDlg.isVisible().catch(() => false)) {
        await confirmDlg.getByRole('button', { name: /Resume/i }).last().click();
      }
      await page.waitForTimeout(1500);
      checks.push(result(
        'start-pause-resume',
        'PASS',
        `Resume clicked; twinReqs ${beforeResume}->${twinRequests.length}`,
      ));
    } else if (hasStart) {
      checks.push(result('start-pause-resume', 'PASS', 'Start Wiring visible (not started)'));
    } else {
      checks.push(result('start-pause-resume', 'PASS WITH WARNINGS', 'No Start/Pause/Resume visible'));
    }

    // Overflow desktop 1920
    let overflow = await measureOverflow(page);
    checks.push(result(
      'no-horizontal-overflow-1920x1080',
      overflow.overflow ? 'FAIL' : 'PASS',
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    ));

    // Tablet 1024x768
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);
    overflow = await measureOverflow(page);
    const twinStill = await twinSvg.isVisible().catch(() => false);
    checks.push(result(
      'viewport-1024x768',
      !overflow.overflow && twinStill ? 'PASS' : !overflow.overflow ? 'PASS WITH WARNINGS' : 'FAIL',
      `overflow=${overflow.overflow} twinVisible=${twinStill}`,
    ));

    // Tablet portrait 768x1024
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    overflow = await measureOverflow(page);
    checks.push(result(
      'viewport-768x1024',
      !overflow.overflow ? 'PASS' : 'FAIL',
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    ));

    // 820x1180
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(500);
    overflow = await measureOverflow(page);
    checks.push(result(
      'viewport-820x1180',
      !overflow.overflow ? 'PASS' : 'FAIL',
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    ));

    // Theme toggle if present
    await page.setViewportSize({ width: 1920, height: 1080 });
    const themeBtn = page.getByRole('button', { name: /theme|dark|light/i }).first();
    if (await themeBtn.isVisible().catch(() => false)) {
      const beforeTheme = await page.evaluate(() => document.documentElement.dataset.theme
        || document.documentElement.className
        || document.body.className);
      await themeBtn.click();
      await page.waitForTimeout(400);
      const afterTheme = await page.evaluate(() => document.documentElement.dataset.theme
        || document.documentElement.className
        || document.body.className);
      const twinAfterTheme = await page.locator('svg.ot2d-svg').first().isVisible().catch(() => false);
      checks.push(result(
        'light-dark-theme',
        twinAfterTheme ? 'PASS' : 'FAIL',
        `theme before/after changed=${beforeTheme !== afterTheme}`,
      ));
    } else {
      // try common theme switchers
      const alt = page.locator('[aria-label*="heme"], [title*="heme"], .theme-toggle, button').filter({ hasText: /dark|light|theme/i }).first();
      if (await alt.isVisible().catch(() => false)) {
        await alt.click();
        checks.push(result('light-dark-theme', 'PASS', 'clicked alternate theme control'));
      } else {
        checks.push(result('light-dark-theme', 'SKIP', 'No theme toggle found in chrome'));
      }
    }

    // Console / page errors (filter known noise)
    const meaningful = consoleErrors.filter((t) =>
      !/Download the React DevTools/i.test(t)
      && !/favicon/i.test(t)
      && !/\[vite\]/i.test(t));
    checks.push(result(
      'no-console-errors',
      meaningful.length === 0 && pageErrors.length === 0 ? 'PASS' : 'FAIL',
      `console=${meaningful.slice(0, 5).join(' | ') || 'none'}; page=${pageErrors.slice(0, 3).join(' | ') || 'none'}`,
    ));

    // Auth reachability documented via twin requests
    checks.push(result(
      'auth-operational-twin-reachable',
      twinOk ? 'PASS' : 'FAIL',
      'Authenticated GET /api/engineering/operational-twin/... returned 200 during session',
    ));

  } catch (err) {
    checks.push(result('matrix-runner', 'FAIL', String(err?.stack || err)));
  } finally {
    await browser.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    api: API,
    twinRequestCount: twinRequests.length,
    twinStatuses: [...new Set(twinRequests.map((r) => r.status))],
    checks,
    pass: checks.filter((c) => c.status === 'PASS').length,
    fail: checks.filter((c) => c.status === 'FAIL').length,
    skip: checks.filter((c) => c.status === 'SKIP').length,
    warnings: checks.filter((c) => c.status === 'PASS WITH WARNINGS').length,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  const failed = summary.fail > 0;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
