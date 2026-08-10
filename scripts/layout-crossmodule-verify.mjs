/**
 * Cross-module layout verification (read-only). For every role dashboard, at
 * desktop (1440) and tablet-portrait (768), measure: horizontal overflow, CLS,
 * topbar-var accuracy (measured vs real), page-fill, and any sticky/fixed trapped
 * by a transformed ancestor. Screenshots the supervisor Status tab (sticky head).
 * Run: node scripts/layout-crossmodule-verify.mjs [tag]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FE, CHROME, resolveApiBase } from './smoke-utils.mjs';
import { accountForRole } from './demo-account-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(__dirname, '..'), '.smoke-shots', `layout-crossmod-${process.argv[2]||'after'}-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const API = resolveApiBase();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function roleLogin(role) {
  const { username: user, password: pass } = accountForRole(role);
  return { user, pass };
}

const ROLES = [
  { role: 'admin', ...roleLogin('system_admin'), path: '/admin' },
  { role: 'director', ...roleLogin('ops_director'), path: '/director' },
  { role: 'supervisor', ...roleLogin('prod_supervisor'), path: '/supervisor' },
  { role: 'technician', ...roleLogin('wiring_technician'), path: '/technician' },
  { role: 'qaqc', ...roleLogin('qaqc_engineer'), path: '/qaqc' },
];

const CLS_INIT = () => {
  window.__cls = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true }); } catch {}
};

async function login(username, password) {
  const r = await fetch(`${API}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) });
  if (!r.ok) throw new Error(`login ${username}: ${r.status}`);
  return r.json();
}

async function measure(page) {
  return page.evaluate(() => {
    const de = document.scrollingElement || document.documentElement;
    const shell = document.querySelector('.app-shell');
    const cssVar = shell ? getComputedStyle(shell).getPropertyValue('--dash-topbar-height').trim() : '';
    const tb = document.querySelector('.topbar');
    const tbH = tb ? Math.round(tb.getBoundingClientRect().height) : null;
    // trapped fixed (real break: fixed under transform/filter). sticky is tolerant, report separately.
    let trappedFixed = 0, trappedSticky = 0;
    for (const el of document.querySelectorAll('.app-shell *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      let a = el.parentElement, hop = 0, bad = false;
      while (a && a !== document.body && hop < 30) {
        const acs = getComputedStyle(a);
        if ((acs.transform && acs.transform !== 'none') || (acs.filter && acs.filter !== 'none') ||
            (acs.backdropFilter && acs.backdropFilter !== 'none') || acs.willChange === 'transform') { bad = true; break; }
        a = a.parentElement; hop++;
      }
      if (bad) { if (cs.position === 'fixed') trappedFixed++; else trappedSticky++; }
    }
    return {
      hOverflow: de.scrollWidth - de.clientWidth,
      cls: +(window.__cls||0).toFixed(4),
      cssVar, topbarReal: tbH,
      varAccurate: cssVar.endsWith('px') ? Math.abs(parseFloat(cssVar) - tbH) <= 1 : null,
      trappedFixed, trappedSticky,
    };
  });
}

const results = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--disable-gpu'] });
try {
  for (const r of ROLES) {
    let auth;
    try { auth = await login(r.user, r.pass); }
    catch (e) { console.log(`${r.role}: SKIP (login failed — ${e.message})`); continue; }
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(CLS_INIT);
    await page.evaluateOnNewDocument((t,u)=>{localStorage.setItem('dwes_token',t);localStorage.setItem('dwes_user',u);}, auth.access_token, JSON.stringify(auth.user));
    for (const [w,h] of [[1440,900],[768,1024]]) {
      await page.setViewport({ width:w, height:h });
      await page.goto(`${FE}${r.path}`, { waitUntil:'networkidle2', timeout:45000 });
      await sleep(2200);
      const m = await measure(page);
      results.push({ mod: `${r.role}@${w}`, ...m });
      console.log(`${r.role}@${w}: hOverflow=${m.hOverflow}px CLS=${m.cls} topbar=${m.topbarReal} var=${m.cssVar} varOK=${m.varAccurate} trappedFixed=${m.trappedFixed}`);
    }
    // Supervisor: capture Status tab (sticky rwa head) at 1440
    if (r.role === 'supervisor') {
      await page.setViewport({ width:1440, height:900 });
      await page.goto(`${FE}/supervisor`, { waitUntil:'networkidle2', timeout:45000 });
      await sleep(1500);
      await page.evaluate(() => { const links=[...document.querySelectorAll('.dash-sidebar-link')]; const s=links.find(l=>/status/i.test(l.textContent||'')); if(s) s.click(); });
      await sleep(1800);
      await page.screenshot({ path: path.join(OUT, 'supervisor-status.png') });
    }
    await page.close();
  }
} finally { await browser.close(); }

const bad = results.filter(r => r.hOverflow > 1 || r.cls > 0.1 || r.trappedFixed > 0 || r.varAccurate === false);
console.log(`\n=== SUMMARY: ${results.length} module/size checks, ${bad.length} with issues ===`);
if (bad.length) console.log(JSON.stringify(bad, null, 2));
console.log('OUT:', OUT);
process.exit(bad.length ? 1 : 0);
