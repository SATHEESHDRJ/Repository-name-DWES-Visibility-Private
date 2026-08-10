/**
 * LIVE TB Visual Demo — capture screenshots + zero-impact network proof.
 * Read-only against API except login GET/POST auth used to reach UI.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';
const OUT =
  process.env.DWES_DEMO_OUT ||
  'C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/09_VERIFICATION_LOGS/LIVE_TB_VISUAL_DEMO';
const USER = process.env.DWES_USER || 'tech3';
const PASS = process.env.DWES_PASS || 'tech3';

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isWriteMethod(m) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(m || '').toUpperCase());
}

function classifyApi(url) {
  const u = String(url || '');
  if (/\/api\/tb-markers\/match/i.test(u)) return 'match';
  if (/\/api\/.*tb-analysis|drawing-tb-analysis|live-tb/i.test(u)) return 'analysis';
  if (/\/api\/.*ocr|locate|opencv|evidence/i.test(u)) return 'analysis';
  if (/\/api\//i.test(u)) return 'api';
  return 'other';
}

async function dismissNoise(page) {
  for (const label of ['Close', 'Dismiss', 'Later', 'Not now', 'Skip']) {
    const b = page.locator(`button:has-text("${label}")`).first();
    if (await b.count()) {
      try {
        await b.click({ timeout: 400 });
      } catch {
        /* ignore */
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    const closeSkipped = page.locator('button[aria-label="Close skipped wire filter"]').first();
    if (await closeSkipped.count()) {
      try {
        await closeSkipped.click({ timeout: 1500, force: true });
        await sleep(300);
      } catch {
        /* ignore */
      }
    }
    if (!(await page.locator('.tech-skipped-filter-root').count())) break;
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);
  }
}

async function main() {
  const evidence = {
    startedAt: new Date().toISOString(),
    base: BASE,
    beforeDemo: { network: [], banners: [], wireChip: '' },
    duringDemo: { network: [], matchCalls: 0, writeCalls: 0, analysisCalls: 0 },
    afterExit: { banners: [], wireChip: '', demoOverlayCount: 0 },
    afterRefresh: { demoModeVisible: false, demoOverlayCount: 0 },
    screenshots: [],
    errors: [],
  };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1000'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  let phase = 'boot';
  const phaseNets = { boot: [], before: [], demo: [], after: [], refresh: [] };

  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('/api/')) return;
    const row = {
      phase,
      method: req.method(),
      url: url.slice(0, 260),
      kind: classifyApi(url),
      write: isWriteMethod(req.method()),
    };
    (phaseNets[phase] || (phaseNets[phase] = [])).push(row);
  });

  try {
    phase = 'boot';
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    // Clear service worker / caches so nginx dist (demo-enabled) is used.
    await page.evaluate(async () => {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      for (const r of regs) await r.unregister();
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    const user = page.locator('input[name="username"], input#username, input[type="text"]').first();
    const pass = page.locator('input[name="password"], input#password, input[type="password"]').first();
    await user.waitFor({ timeout: 20000 });
    await user.fill(USER);
    await pass.fill(PASS);
    await page
      .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")')
      .first()
      .click();
    await sleep(2500);
    await dismissNoise(page);

    const panelBtn = page.locator('text=/001|frame_1785319116166|wcplt/i').first();
    if (await panelBtn.count()) {
      await panelBtn.click({ timeout: 10000 }).catch(() => {});
      await sleep(1500);
    }

    // Prefer Resume only (avoid Start / Open side effects).
    const resume = page.getByRole('button', { name: /^Resume$/i }).first();
    if (await resume.count()) {
      await resume.click({ timeout: 2000 }).catch(() => {});
      await sleep(1200);
    }
    await dismissNoise(page);

    // Open LIVE TB — wait for match/analysis from real open to settle first
    phase = 'before';
    await dismissNoise(page);
    const liveTb = page.locator('button.live-tb-open-btn').first();
    await liveTb.waitFor({ timeout: 20000 });
    await liveTb.click({ force: true });
    await page.locator('.live-tb-modal').first().waitFor({ timeout: 20000 });
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT, '00_live_tb_opened.png') }).catch(() => {});

    const demoBtn = page.locator('button.live-tb-demo-btn').first();
    if (!(await demoBtn.count())) {
      const bodySnippet = (await page.locator('body').innerText()).slice(0, 800);
      throw new Error(
        `DEMO VIEW button not found — is VITE_LIVE_TB_DEMO_ENABLED baked into the bundle? snippet=${bodySnippet}`,
      );
    }

    evidence.beforeDemo.banners = await page.locator('.live-tb-banner, [role="status"]').allTextContents();
    evidence.beforeDemo.wireChip = (await page.locator('.live-tb-wire-chip').first().innerText().catch(() => '')) || '';
    evidence.beforeDemo.network = phaseNets.before.slice();

    // Enter demo — zero new match/write expected
    phase = 'demo';
    const demoStartLen = phaseNets.demo.length;
    await demoBtn.click();
    // Wait for demo-only scroll to page 2 LEFT SIDE physical TB banks
    await sleep(3500);
    await page.locator('[data-live-tb-demo-overlay="source-label"], [data-live-tb-demo-overlay="same-label"]').first()
      .waitFor({ timeout: 15000 });
    await sleep(1200);
    // Centre viewport on midpoint of SRC+DST so both physical strips appear in 01_full_demo
    await page.evaluate(() => {
      const src = document.querySelector('[data-live-tb-demo-overlay="source-label"], [data-live-tb-demo-overlay="same-label"]');
      const dst = document.querySelector('[data-live-tb-demo-overlay="destination-label"]');
      const viewport = document.querySelector('.pdf-viewer-viewport');
      if (!src || !viewport) return;
      const a = src.getBoundingClientRect();
      const b = dst ? dst.getBoundingClientRect() : a;
      const cx = (a.left + a.width / 2 + b.left + b.width / 2) / 2;
      const cy = (a.top + a.height / 2 + b.top + b.height / 2) / 2;
      const vr = viewport.getBoundingClientRect();
      viewport.scrollTo({
        left: Math.max(0, viewport.scrollLeft + cx - (vr.left + vr.width / 2)),
        top: Math.max(0, viewport.scrollTop + cy - (vr.top + vr.height / 2)),
        behavior: 'auto',
      });
    });
    await sleep(600);

    const fullPath = path.join(OUT, '01_full_demo.png');
    await page.screenshot({ path: fullPath, fullPage: false });
    evidence.screenshots.push(fullPath);

    // Source close-up
    const srcLabel = page.locator('[data-live-tb-demo-overlay="source-label"]').first();
    if (await srcLabel.count()) {
      await srcLabel.scrollIntoViewIfNeeded().catch(() => {});
      const box = await srcLabel.boundingBox();
      if (box) {
        await page.screenshot({
          path: path.join(OUT, '02_source_demo.png'),
          clip: {
            x: Math.max(0, box.x - 120),
            y: Math.max(0, box.y - 80),
            width: Math.min(480, 1600 - Math.max(0, box.x - 120)),
            height: Math.min(360, 1000 - Math.max(0, box.y - 80)),
          },
        });
        evidence.screenshots.push(path.join(OUT, '02_source_demo.png'));
      }
    } else {
      await page.screenshot({ path: path.join(OUT, '02_source_demo.png') });
      evidence.screenshots.push(path.join(OUT, '02_source_demo.png'));
    }

    const dstLabel = page.locator('[data-live-tb-demo-overlay="destination-label"]').first();
    if (await dstLabel.count()) {
      await dstLabel.scrollIntoViewIfNeeded().catch(() => {});
      const box = await dstLabel.boundingBox();
      if (box) {
        await page.screenshot({
          path: path.join(OUT, '03_destination_demo.png'),
          clip: {
            x: Math.max(0, box.x - 120),
            y: Math.max(0, box.y - 80),
            width: Math.min(480, 1600 - Math.max(0, box.x - 120)),
            height: Math.min(360, 1000 - Math.max(0, box.y - 80)),
          },
        });
        evidence.screenshots.push(path.join(OUT, '03_destination_demo.png'));
      }
    } else {
      await page.screenshot({ path: path.join(OUT, '03_destination_demo.png') });
      evidence.screenshots.push(path.join(OUT, '03_destination_demo.png'));
    }

    // Same-header scenario
    const sameBtn = page.locator('button:has-text("Same header")').first();
    if (await sameBtn.count()) {
      await sameBtn.click();
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, '04_same_header_demo.png') });
      evidence.screenshots.push(path.join(OUT, '04_same_header_demo.png'));
    }

    const demoNets = phaseNets.demo.slice(demoStartLen);
    evidence.duringDemo.network = demoNets;
    evidence.duringDemo.matchCalls = demoNets.filter((r) => r.kind === 'match').length;
    evidence.duringDemo.analysisCalls = demoNets.filter((r) => r.kind === 'analysis').length;
    evidence.duringDemo.writeCalls = demoNets.filter((r) => r.write && !/\/api\/auth\//i.test(r.url)).length;

    // Exit demo
    phase = 'after';
    const exitBtn = page.locator('button:has-text("EXIT DEMO")').first();
    await exitBtn.click();
    await sleep(1500);

    evidence.afterExit.banners = await page.locator('.live-tb-banner, [role="status"]').allTextContents();
    evidence.afterExit.wireChip = (await page.locator('.live-tb-wire-chip').first().innerText().catch(() => '')) || '';
    evidence.afterExit.demoOverlayCount = await page.locator('[data-live-tb-demo-overlay]').count();
    await page.screenshot({ path: path.join(OUT, '05_real_mode_restored.png') });
    evidence.screenshots.push(path.join(OUT, '05_real_mode_restored.png'));

    // Refresh clears demo (SSE keeps networkidle forever — use load).
    phase = 'refresh';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    evidence.afterRefresh.demoModeVisible = (await page.locator('button:has-text("EXIT DEMO")').count()) > 0;
    evidence.afterRefresh.demoOverlayCount = await page.locator('[data-live-tb-demo-overlay]').count();
    evidence.afterRefresh.demoBtnAbsentOrOff =
      (await page.locator('button.live-tb-demo-btn:has-text("EXIT DEMO")').count()) === 0;
  } catch (err) {
    evidence.errors.push(String(err && err.stack ? err.stack : err));
    await page.screenshot({ path: path.join(OUT, 'ERROR.png') }).catch(() => {});
  } finally {
    evidence.finishedAt = new Date().toISOString();
    evidence.phaseNets = phaseNets;
    fs.writeFileSync(path.join(OUT, 'zero-impact-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({
      ok: evidence.errors.length === 0,
      matchDuringDemo: evidence.duringDemo.matchCalls,
      writeDuringDemo: evidence.duringDemo.writeCalls,
      analysisDuringDemo: evidence.duringDemo.analysisCalls,
      overlaysAfterExit: evidence.afterExit.demoOverlayCount,
      demoAfterRefresh: evidence.afterRefresh.demoModeVisible,
      screenshots: evidence.screenshots.map((p) => path.basename(p)),
      errors: evidence.errors,
    }, null, 2));
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
