/**
 * Navigate tech3 to Wire 022/D4 and open LIVE TB VIEW; capture chip/demo/match.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.DWES_BASE || 'http://127.0.0.1:5280';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const match = [];
  const consoles = [];
  page.on('console', (m) => { if (m.type() === 'error') consoles.push(m.text().slice(0, 250)); });
  page.on('request', (req) => {
    if (req.url().includes('/tb-markers/match')) match.push(req.url());
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[type="text"], input[name="username"]').first().fill('tech3');
  await page.locator('input[type="password"]').first().fill('tech3');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);

  for (const label of ['Resume', 'Start', 'Continue', 'Open']) {
    const b = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await b.count()) {
      try { await b.click({ timeout: 2000 }); await page.waitForTimeout(1200); } catch { /* */ }
    }
  }

  // Dismiss skipped filter
  for (let i = 0; i < 3; i++) {
    const closeSkipped = page.locator('button[aria-label="Close skipped wire filter"]').first();
    if (await closeSkipped.count()) {
      try { await closeSkipped.click({ timeout: 1500, force: true }); } catch { /* */ }
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }

  // Walk wires looking for 022/D4 with 87STUB
  let found = false;
  for (let i = 0; i < 120; i++) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/022\s*\/\s*D4/i.test(bodyText) && /87STUB/i.test(bodyText)) {
      found = true;
      break;
    }
    const next = page.getByRole('button', { name: /next cable|next wire|^Next$/i }).first()
      .or(page.locator('button[title*="Next"], button[aria-label*="Next"]').first());
    if (!(await next.count())) break;
    try { await next.click({ timeout: 800 }); } catch { break; }
    await page.waitForTimeout(120);
  }

  // Confirm active matrix shows 022/D4 before opening LIVE TB
  const activeRef = await page.locator('.swm-card, .dwf-workstation, body').first().innerText().catch(() => '');
  const activeLooks022 = /022\s*\/\s*D4/i.test(activeRef) && /87STUB/i.test(activeRef);

  // Open LIVE TB from wiring header only
  let opened = false;
  const liveTb = page.locator('button[aria-label="LIVE TB VIEW"]').first();
  if (await liveTb.count()) {
    try {
      await liveTb.click({ timeout: 10000 });
      await page.waitForSelector('.live-tb-wire-chip, .live-tb-modal', { timeout: 15000 });
      opened = true;
      await page.waitForTimeout(2500);
    } catch { /* */ }
  }

  const chip = page.locator('.live-tb-wire-chip[aria-label="Active wire"]').first();
  const chipText = (await chip.count()) ? await chip.innerText().catch(() => '') : '';
  const modalText = await page.locator('.live-tb-modal, .modal-box').first().innerText().catch(() => '');
  const body = [chipText, modalText].filter(Boolean).join('\n') || (opened ? await page.locator('body').innerText().catch(() => '') : '');
  const out = {
    found022D4: found,
    activeLooks022,
    opened,
    chipText: chipText.replace(/\s+/g, ' ').slice(0, 300),
    demoVisible: /DEMO VIEW|EXIT DEMO|DEMO-001|VISUAL EXAMPLE ONLY/i.test(body),
    srcDevice87: /SRC DEVICE\s+87STUB/i.test(body),
    srcTbX329: /SRC TB\s+X329/i.test(body),
    dstTbX5: /DST TB\s+X5A-C/i.test(body),
    deviceUnresolvedMsg: /Source device\s+87STUB/i.test(body),
    genericTbNotFound: /TB listed in the wiring schedule was not found/i.test(body),
    match,
    matchSourceX329: match.some((u) => /source_device=X329/i.test(u)),
    matchSourceEmpty: match.some((u) => /source_device=(?:&|$)/i.test(u) || /source_device=$/i.test(u)),
    matchDestX5: match.some((u) => /dest_device=X5A-C/i.test(u)),
    bodySnippet: body.replace(/\s+/g, ' ').slice(0, 700),
    consoleErrors: consoles.slice(0, 10),
  };
  fs.writeFileSync('backend/tmp_health_livetb_022.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await page.screenshot({ path: 'backend/tmp_health_livetb_022.png', fullPage: true }).catch(() => {});
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
