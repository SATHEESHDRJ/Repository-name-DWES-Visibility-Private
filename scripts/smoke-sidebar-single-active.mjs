/**
 * Smoke: Technician sidebar must have at most one .is-active primary tile.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[type="password"]').first().waitFor({ timeout: 20000 });
  await page.locator('input[type="text"], input[name="username"]').first().fill('tech3');
  await page.locator('input[type="password"]').first().fill('tech3');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2800);

  for (const label of ['Resume', 'Start', 'Continue', 'Open']) {
    const b = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await b.count()) {
      try {
        await b.click({ timeout: 1500 });
        await page.waitForTimeout(900);
      } catch { /* */ }
    }
  }

  // Dismiss overlays that block the sidebar (Open Side, skipped filter, etc.)
  for (let i = 0; i < 4; i++) {
    const closeOverlay = page.locator(
      'button[aria-label="Close open side dialog"], button[aria-label="Close skipped wire filter"], .dwf-open-side-backdrop',
    ).first();
    if (await closeOverlay.count()) {
      try {
        await closeOverlay.click({ timeout: 800, force: true });
        await page.waitForTimeout(300);
      } catch { /* */ }
    }
    await page.keyboard.press('Escape').catch(() => {});
  }

  const tablet = page.locator('.dash-sidebar-link', { hasText: /Tablet/i }).first();
  if (await tablet.count()) {
    await tablet.click({ force: true });
    await page.waitForTimeout(600);
  }

  // Open skipped filter UI then dismiss — should not add is-active
  const skipped = page.locator('#skipped-wire-filter');
  if (await skipped.count()) {
    await skipped.click();
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }

  const active = await page.locator('.dash-sidebar-nav .dash-sidebar-link.is-active').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim()),
  );
  const filterApplied = await page.locator('.dash-sidebar-nav .dash-sidebar-link.is-filter-applied').evaluateAll((els) =>
    els.map((e) => e.id || (e.textContent || '').replace(/\s+/g, ' ').trim()),
  );
  const out = {
    activeCount: active.length,
    active,
    onlyOnePrimaryBlue: active.length === 1,
    filterApplied,
    filterDotCount: await page.locator('.dash-sidebar-filter-dot').count(),
  };
  fs.writeFileSync('backend/tmp_sidebar_single_active.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  if (active.length !== 1) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
