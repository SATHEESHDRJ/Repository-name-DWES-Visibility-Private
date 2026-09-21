import { chromium } from 'playwright';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';
const OUT =
  'C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/09_VERIFICATION_LOGS/LIVE_TB_VISUAL_DEMO/debug_demo_viewport.png';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1000'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(async () => {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('input[name="username"], input#username, input[type="text"]').first().fill('tech3');
  await page.locator('input[name="password"], input#password, input[type="password"]').first().fill('tech3');
  await page.locator('button[type="submit"]').first().click();
  await sleep(2500);
  const resume = page.getByRole('button', { name: /^Resume$/i }).first();
  if (await resume.count()) {
    await resume.click().catch(() => {});
    await sleep(1200);
  }
  await page.locator('button.live-tb-open-btn').first().click({ force: true });
  await page.locator('.live-tb-modal').first().waitFor({ timeout: 20000 });
  await sleep(5000);
  await page.locator('button.live-tb-demo-btn').first().click();
  await sleep(4000);
  const src = page.locator('[data-live-tb-demo-overlay="source-label"]').first();
  if (await src.count()) await src.scrollIntoViewIfNeeded();
  await sleep(1000);

  const info = await page.evaluate(() => {
    const overlays = [...document.querySelectorAll('[data-live-tb-demo-overlay]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        attr: el.getAttribute('data-live-tb-demo-overlay'),
        text: (el.textContent || '').slice(0, 40),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    const pages = [...document.querySelectorAll('.pdf-viewer-page[data-page]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        page: el.getAttribute('data-page'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return {
      overlays,
      pages,
      chip: document.querySelector('.live-tb-wire-chip')?.innerText || '',
      pageVal: document.querySelector('.pdf-viewer-toolbar input')?.value || null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: OUT });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
