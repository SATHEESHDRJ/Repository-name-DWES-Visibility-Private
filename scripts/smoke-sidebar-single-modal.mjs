/**
 * Smoke: Technician sidebar filter popups — only one open at a time.
 * Uses force clicks so overlay stacking does not block the exclusivity assert
 * (production CSS insets overlays off the sidebar when a function is open).
 */
import { chromium } from 'playwright';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';

const FILTER_LABELS = [
  'Tag Cable-Wise Filter',
  'Skipped Wire Filter',
  'Equipment Filter',
  'Internal Device Looping',
];

/** Count technician function overlays only — exclude #modal-root and DWS workspace role=dialog. */
function techFnDialogCount(page) {
  return page.locator(
    '.modal-overlay:visible, .tech-skipped-filter-popup:visible, [class*="filter-popup"]:visible, [class*="tech-"][role="dialog"]:visible',
  ).count();
}

async function clickSidebarFilter(page, label) {
  const item = page.locator('.dash-sidebar-link, .dash-sidebar-control').filter({ hasText: label }).first();
  await item.waitFor({ state: 'attached', timeout: 15000 });
  await item.click({ force: true, timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[type="password"]').first().waitFor({ timeout: 20000 });
  await page.locator('input[type="text"], input[name="username"]').first().fill('tech3');
  await page.locator('input[type="password"]').first().fill('tech3');
  await page.locator('button[type="submit"]').first().click();
  await page.locator('.dash-sidebar-link').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);

  const sidebarCount = await page.locator('.dash-sidebar-link, .dash-sidebar-control').count();
  if (sidebarCount < 4) {
    console.log(JSON.stringify({ pass: false, reason: 'sidebar filters not present', sidebarCount }, null, 2));
    await browser.close();
    process.exit(1);
  }

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(150);
  }

  const results = [];
  for (const label of FILTER_LABELS) {
    await clickSidebarFilter(page, label);
    await page.waitForTimeout(450);
    const dialogs = await techFnDialogCount(page);
    const htmlClass = await page.evaluate(() => document.documentElement.classList.contains('tech-fn-modal-open'));
    results.push({ label, dialogs, techFnClass: htmlClass, ok: dialogs === 1 && htmlClass });
  }

  await clickSidebarFilter(page, 'Tag Cable-Wise Filter');
  await page.waitForTimeout(250);
  await clickSidebarFilter(page, 'Skipped Wire Filter');
  await page.waitForTimeout(450);
  const rapid = await techFnDialogCount(page);
  results.push({ label: 'rapid Tag→Skipped', dialogs: rapid, ok: rapid === 1 });

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(350);
  const afterClose = await techFnDialogCount(page);
  const classAfter = await page.evaluate(() => document.documentElement.classList.contains('tech-fn-modal-open'));
  results.push({ label: 'after Escape', dialogs: afterClose, techFnClass: classAfter, ok: afterClose === 0 && !classAfter });

  await browser.close();

  const failed = results.filter((r) => r.ok === false);
  console.log(JSON.stringify({ results, pass: failed.length === 0 }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
