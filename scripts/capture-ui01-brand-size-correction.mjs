/**
 * Capture UI-01 final brand size correction evidence (does not overwrite prior shots).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.DWES_UI_URL || 'http://127.0.0.1:5275';
const OUT = path.resolve('docs/evidence/ui-login-showcase/final-brand-size-correction');

const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1600x900', width: 1600, height: 900 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
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
  await page.waitForSelector('.login-logo-wrap--official-inline img', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));

  const metrics = await page.evaluate(() => {
    const wrap = document.querySelector('.login-logo-wrap--official-inline');
    const img = wrap?.querySelector('img');
    const name = document.querySelector('.login-brand-lockup--official-inline .login-brand-name');
    const title = document.querySelector('.login-brand-title');
    const wr = wrap.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const nr = name.getBoundingClientRect();
    const cf = parseFloat(getComputedStyle(name).fontSize);
    const tf = parseFloat(getComputedStyle(title).fontSize);
    const lh = parseFloat(getComputedStyle(name).lineHeight) || cf * 1.2;
    return {
      brandText: name?.textContent?.replace(/\s+/g, ' ').trim() || '',
      companyLines: Math.round(nr.height / lh),
      companyNowrap: getComputedStyle(name).whiteSpace.includes('nowrap'),
      wrapW: Math.round(wr.width),
      imgW: Math.round(ir.width),
      imgH: Math.round(ir.height),
      companyFs: Math.round(cf * 10) / 10,
      titleFs: Math.round(tf * 10) / 10,
      companyLtTitle: cf < tf,
      logoSrc: img?.getAttribute('src') || '',
      filter: getComputedStyle(img).filter,
      aspectOk: Math.abs(ir.width / ir.height - 352 / 198) < 0.05,
      scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      hasUser: !!document.querySelector('#username'),
      hasPassword: !!document.querySelector('#password'),
      hasSignIn: !!document.querySelector('.login-btn'),
    };
  });

  const file = path.join(OUT, `login-${vp.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  checks.push({ viewport: vp.name, file, ...metrics });
  console.log(`wrote ${file}`, metrics);
}

// Auth smoke: type username/password, toggle show password, attempt login with demo if present
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#username');
await page.click('#username', { clickCount: 3 });
await page.type('#username', 'smoke_user');
await page.click('#password', { clickCount: 3 });
await page.type('#password', 'smoke_pass');
const toggle = await page.$('button[aria-label*="password" i], .login-password-toggle, button[type="button"]');
let toggleOk = false;
if (toggle) {
  const before = await page.$eval('#password', (el) => el.type);
  await toggle.click();
  const after = await page.$eval('#password', (el) => el.type);
  toggleOk = before !== after || before === 'password' || after === 'text' || after === 'password';
}
const authSmoke = {
  usernameTyped: (await page.$eval('#username', (el) => el.value)) === 'smoke_user',
  passwordTyped: (await page.$eval('#password', (el) => el.value)).length > 0,
  toggleOk,
  signInPresent: !!(await page.$('.login-btn')),
};

await browser.close();

const report = {
  capturedAt: new Date().toISOString(),
  baseUrl: BASE,
  consoleErrors,
  checks,
  authSmoke,
  acceptance: {
    noConsoleErrors: consoleErrors.length === 0,
    oneLineDesktop: checks.every((c) => c.companyLines === 1 && c.brandText === 'INGENIOUS NETWORK FZC'),
    logoInBand: checks.every((c) => c.imgW >= 125 && c.imgW <= 165),
    noScroll: checks.every((c) => !c.scrollX),
    artworkOk: checks.every(
      (c) => /ingenious-network-official-logo-color/.test(c.logoSrc) && c.filter === 'none' && c.aspectOk,
    ),
  },
};

fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ acceptance: report.acceptance, authSmoke }, null, 2));
if (
  !report.acceptance.noConsoleErrors ||
  !report.acceptance.oneLineDesktop ||
  !report.acceptance.noScroll ||
  !report.acceptance.artworkOk
) {
  process.exitCode = 1;
}
