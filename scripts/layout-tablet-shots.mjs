import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FE, CHROME, resolveApiBase } from './smoke-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(__dirname, '..'), '.smoke-shots', `layout-tablet-${process.argv[2]||'before'}-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const API = resolveApiBase();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const sup = await (await fetch(`${API}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'supervisor1',password:'super123'})})).json();
const browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t,u)=>{localStorage.setItem('dwes_token',t);localStorage.setItem('dwes_user',u);}, sup.access_token, JSON.stringify(sup.user));

  for (const [w,h,tag] of [[768,1024,'768-portrait'],[834,1112,'834-portrait'],[1024,768,'1024-land']]) {
    await page.setViewport({ width:w, height:h });
    await page.goto(`${FE}/supervisor`, { waitUntil:'networkidle2', timeout:45000 });
    await sleep(1800);
    await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
    // topbar/drawer geometry
    const geo = await page.evaluate(() => {
      const tb = document.querySelector('.topbar')?.getBoundingClientRect();
      const shell = document.querySelector('.app-shell');
      const cssVar = shell ? getComputedStyle(shell).getPropertyValue('--dash-topbar-height').trim() : '';
      return { topbarH: tb ? Math.round(tb.height) : null, topbarBottom: tb ? Math.round(tb.bottom) : null, cssVar };
    });
    console.log(`${tag}: topbar=${geo.topbarH}px bottom=${geo.topbarBottom} cssVar=${geo.cssVar}`);
  }

  // 768 with mobile nav open (hamburger) — check drawer vs topbar overlap
  await page.setViewport({ width:768, height:1024 });
  await page.goto(`${FE}/supervisor`, { waitUntil:'networkidle2', timeout:45000 });
  await sleep(1500);
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('.topbar-menu-btn, [aria-label*="menu" i], button[aria-label*="Menu" i]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, `768-mobilenav-${opened?'open':'noBtn'}.png`) });
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('.dash-sidebar--mobile-open');
    const tb = document.querySelector('.topbar')?.getBoundingClientRect();
    if (!d) return { drawer:null };
    const r = d.getBoundingClientRect();
    return { drawerTop: Math.round(r.top), drawerBottom: Math.round(r.bottom), topbarBottom: tb?Math.round(tb.bottom):null,
             overlapPx: tb ? Math.round(tb.bottom - r.top) : null };
  });
  console.log('mobile drawer geometry:', JSON.stringify(drawer));

  await page.close();
} finally { await browser.close(); }
console.log('OUT:', OUT);
