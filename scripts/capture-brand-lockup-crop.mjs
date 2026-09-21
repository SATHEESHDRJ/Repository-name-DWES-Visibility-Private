import puppeteer from 'puppeteer-core';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve('docs/evidence/ui-login-showcase');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(process.env.DWES_UI_URL || 'http://127.0.0.1:5275/', {
  waitUntil: 'networkidle2',
  timeout: 60000,
});
await page.waitForSelector('.login-brand-lockup--official-stack');
await new Promise((r) => setTimeout(r, 500));

const el = await page.$('.login-brand-lockup--official-stack');
const box = await el.boundingBox();
const metrics = await page.evaluate(() => {
  const wrap = document.querySelector('.login-logo-wrap--official-inline').getBoundingClientRect();
  const img = document.querySelector('.login-logo-wrap--official-inline img').getBoundingClientRect();
  const c = parseFloat(
    getComputedStyle(document.querySelector('.login-brand-lockup--official-inline .login-brand-name'))
      .fontSize,
  );
  const t = parseFloat(getComputedStyle(document.querySelector('.login-brand-title')).fontSize);
  return {
    wrapW: Math.round(wrap.width),
    imgW: Math.round(img.width),
    padApprox: Math.round(wrap.width - img.width),
    companyFs: c,
    titleFs: t,
    companyLtTitle: c < t,
  };
});

if (box) {
  await page.screenshot({
    path: path.join(OUT, 'login-brand-lockup-crop-1920.png'),
    clip: {
      x: Math.max(0, box.x - 12),
      y: Math.max(0, box.y - 12),
      width: Math.min(box.width + 24, 900),
      height: box.height + 24,
    },
  });
}

console.log(JSON.stringify(metrics));
await browser.close();
