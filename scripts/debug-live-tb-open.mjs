import { chromium } from 'playwright';
import path from 'path';

const OUT =
  'C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/09_VERIFICATION_LOGS/LIVE_TB_VISUAL_DEMO';
const BASE = 'http://127.0.0.1:5280';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(async () => {
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
});
await page.reload({ waitUntil: 'networkidle', timeout: 60000 });

const js = await page.evaluate(
  () => [...document.scripts].map((s) => s.src).find((u) => u.includes('index-')) || '',
);
console.log('bundle', js);

await page.locator('input[name="username"], input[type="text"]').first().fill('tech3');
await page.locator('input[type="password"]').first().fill('tech3');
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(3000);

for (const label of ['Resume', 'Start', 'Continue', 'Open']) {
  const b = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
  if (await b.count()) {
    await b.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
}

const btn = page.locator('button.live-tb-open-btn').first();
console.log('btn count', await btn.count());
console.log('btn text', await btn.innerText().catch(() => null));
console.log('btn enabled', await btn.isEnabled().catch(() => null));
console.log('btn visible', await btn.isVisible().catch(() => null));

const before = await page.evaluate(() => ({
  openFlag: document.body.innerText.includes('Terminal block locations'),
  modalCount: document.querySelectorAll('.modal-overlay').length,
}));
console.log('before', before);

await btn.click({ force: true });
await page.waitForTimeout(4000);

const after = await page.evaluate(() => ({
  hasLiveTbModal: !!document.querySelector('.live-tb-modal'),
  hasModalBody: !!document.querySelector('.live-tb-modal-body'),
  modalOverlay: document.querySelectorAll('.modal-overlay').length,
  modalTitle: document.querySelector('#modal-title')?.textContent || null,
  demoBtn: !!document.querySelector('button.live-tb-demo-btn'),
  demoToolbar: !!document.querySelector('.live-tb-demo-toolbar'),
  titles: [...document.querySelectorAll('#modal-title, .modal-title')]
    .map((e) => (e.textContent || '').trim())
    .slice(0, 5),
}));
console.log('after', JSON.stringify(after, null, 2));
await page.screenshot({ path: path.join(OUT, 'debug-after-click.png') });
await browser.close();
