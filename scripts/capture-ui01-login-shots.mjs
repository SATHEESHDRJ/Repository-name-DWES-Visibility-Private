/**
 * UI-01 login showcase evidence screenshots (presentation only).
 * Usage: node scripts/capture-ui01-login-shots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.DWES_UI_URL || 'http://127.0.0.1:5275';
const OUT = path.resolve('docs/evidence/ui-login-showcase');

const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1600x900', width: 1600, height: 900 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'tablet-landscape-1024x768', width: 1024, height: 768 },
  { name: 'tablet-portrait-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1080'],
});

const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

const checks = [];

for (const vp of VIEWPORTS) {
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.login-page-root', { timeout: 20000 });
  // Allow fonts/logo to settle
  await new Promise((r) => setTimeout(r, 700));

  const metrics = await page.evaluate(() => {
    const root = document.querySelector('.login-page-root');
    const hasHorizontalScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      hasRoot: Boolean(root),
      hasShowcase: Boolean(document.querySelector('[data-ui01-login-showcase]')),
      hasWelcome: Boolean(document.querySelector('.login-heading')),
      hasUsername: Boolean(document.querySelector('#username')),
      hasPassword: Boolean(document.querySelector('#password')),
      hasSignIn: Boolean(document.querySelector('.login-btn')),
      brandText: document.querySelector('.login-brand-name')?.textContent?.trim() || '',
      titleText: document.querySelector('.login-brand-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      titleLineCount: (() => {
        const el = document.querySelector('.login-brand-title');
        if (!el) return 0;
        const styles = getComputedStyle(el);
        const lh = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.2;
        return Math.round(el.getBoundingClientRect().height / lh);
      })(),
      hasWireGraphic: Boolean(document.querySelector('.login-wire-showcase')),
      hasAtmosphere: Boolean(document.querySelector('.login-hero-atmosphere')),
      hasUtilityRail: Boolean(document.querySelector('.login-utility-rail')),
      featureCount: document.querySelectorAll('.login-feature-card, .login-feature-chip').length,
      pageText: document.body?.innerText || '',
      hasHorizontalScroll,
    };
  });

  const file = path.join(OUT, `login-${vp.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  checks.push({ viewport: vp.name, file, ...metrics });
  console.log(`wrote ${file}`, metrics);
}

await browser.close();

const report = {
  capturedAt: new Date().toISOString(),
  baseUrl: BASE,
  consoleErrors,
  checks,
  acceptance: {
    noConsoleErrors: consoleErrors.length === 0,
    allRootsPresent: checks.every((c) => c.hasRoot && c.hasWelcome && c.hasUsername && c.hasSignIn),
    noHorizontalScroll: checks.every((c) => !c.hasHorizontalScroll),
    brandPresent: checks.every((c) => /INGENIOUS/i.test(c.brandText)),
    wireGraphicRemoved: checks.every((c) => !c.hasWireGraphic && !/SOURCE PANEL|Wire 001|DEST PANEL/i.test(c.pageText)),
    atmospherePresentDesktop: checks
      .filter((c) => c.viewport.startsWith('desktop') || c.viewport.startsWith('laptop') || c.viewport.includes('landscape'))
      .every((c) => c.hasAtmosphere),
    titleSingleLineWide: checks
      .filter((c) => /1920|1600|1366|tablet-landscape/.test(c.viewport))
      .every((c) => c.titleLineCount === 1 && /DIGITAL WIRING EXECUTION SYSTEM/.test(c.titleText)),
  },
};

fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.acceptance, null, 2));
if (
  !report.acceptance.allRootsPresent ||
  !report.acceptance.noHorizontalScroll ||
  !report.acceptance.wireGraphicRemoved ||
  !report.acceptance.titleSingleLineWide
) {
  process.exitCode = 1;
}
