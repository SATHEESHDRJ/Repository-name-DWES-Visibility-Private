/**
 * Layout-stability diagnostic probe (read-only).
 * Measures, in a real browser, the concrete symptoms the user reports:
 *   - Cumulative Layout Shift (CLS) during load, tab-switch, and data refresh
 *   - horizontal overflow (scrollWidth > clientWidth) at multiple resolutions
 *   - topbar real height vs the --dash-topbar-height magic number (calc coupling)
 *   - fixed/sticky descendants trapped by a transformed/filtered ancestor
 *   - elements overflowing the viewport / their parent (overlap, clipping)
 * Run: node scripts/layout-stability-probe.mjs
 */
import puppeteer from 'puppeteer-core';
import { FE, CHROME, resolveApiBase } from './smoke-utils.mjs';

const API = resolveApiBase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  return res.json();
}

// Injected into the page: start a CLS observer we can read later.
const CLS_INIT = () => {
  window.__cls = 0;
  window.__shifts = [];
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__cls += e.value;
          if (e.value > 0.002) {
            const nodes = (e.sources || []).map(s => {
              const n = s.node;
              if (!n || n.nodeType !== 1) return null;
              return (n.className && typeof n.className === 'string')
                ? `${n.tagName.toLowerCase()}.${n.className.split(' ').slice(0,2).join('.')}`
                : n.tagName?.toLowerCase();
            }).filter(Boolean);
            window.__shifts.push({ value: +e.value.toFixed(4), nodes });
          }
        }
      }
    });
    po.observe({ type: 'layout-shift', buffered: true });
  } catch { /* older engine */ }
};

async function measure(page) {
  return page.evaluate(() => {
    const de = document.scrollingElement || document.documentElement;
    const vw = window.innerWidth, vh = window.innerHeight;
    const q = (s) => document.querySelector(s);
    const rectOf = (s) => { const el = q(s); if (!el) return null; const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };

    // topbar magic-number coupling
    const shell = q('.app-shell');
    const cssTopbar = shell ? parseFloat(getComputedStyle(shell).getPropertyValue('--dash-topbar-height')) * 16 : null;
    const topbar = q('.topbar');
    const topbarH = topbar ? Math.round(topbar.getBoundingClientRect().height) : null;

    // fixed/sticky descendants trapped by a transformed/filtered ancestor
    const trapped = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      let a = el.parentElement, hop = 0;
      while (a && a !== document.body && hop < 40) {
        const acs = getComputedStyle(a);
        const bad = (acs.transform && acs.transform !== 'none')
          || (acs.filter && acs.filter !== 'none')
          || (acs.backdropFilter && acs.backdropFilter !== 'none')
          || (acs.perspective && acs.perspective !== 'none')
          || (acs.contain && /paint|layout|strict|content/.test(acs.contain))
          || acs.willChange === 'transform';
        if (bad) {
          trapped.push({
            el: `${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ').slice(0,2).join('.')}`,
            pos: cs.position,
            ancestor: `${a.tagName.toLowerCase()}.${(a.className||'').toString().split(' ').slice(0,2).join('.')}`,
            cause: (acs.transform!=='none'&&'transform') || (acs.backdropFilter!=='none'&&'backdrop-filter')
                  || (acs.filter!=='none'&&'filter') || (acs.contain!=='none'&&`contain:${acs.contain}`) || 'will-change',
          });
          break;
        }
        a = a.parentElement; hop++;
      }
    }
    // de-dup trapped by el+cause
    const seen = new Set();
    const trappedUniq = trapped.filter(t => { const k = t.el+t.cause+t.ancestor; if (seen.has(k)) return false; seen.add(k); return true; });

    // elements overflowing the viewport horizontally (right edge past vw+1)
    const overflowX = [];
    for (const el of document.querySelectorAll('.app-shell *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1.5 && r.left >= -1) {
        overflowX.push({ el: `${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ').slice(0,2).join('.')}`, right: Math.round(r.right), over: Math.round(r.right - vw) });
      }
    }
    overflowX.sort((a,b)=>b.over-a.over);

    return {
      vw, vh,
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      horizontalOverflow: de.scrollWidth - de.clientWidth,
      docScrollH: de.scrollHeight,
      pageScrolls: de.scrollHeight > vh + 1,
      cssTopbarPx: cssTopbar, topbarRealPx: topbarH,
      topbarMismatch: (topbarH!=null && cssTopbar!=null) ? topbarH - cssTopbar : null,
      shell: rectOf('.app-shell'), layout: rectOf('.dash-layout'), main: rectOf('.dash-main'), sidebar: rectOf('.dash-sidebar'),
      trapped: trappedUniq.slice(0, 12),
      overflowX: overflowX.slice(0, 8),
      cls: +(window.__cls || 0).toFixed(4),
      shifts: (window.__shifts || []).slice(0, 8),
    };
  });
}

const sup = await login('supervisor1', 'super123');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const report = {};
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(CLS_INIT);
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('dwes_token', t); localStorage.setItem('dwes_user', u);
  }, sup.access_token, JSON.stringify(sup.user));

  // ── Load @ 1440 ──
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FE}/supervisor`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500); // let load animations + first data settle
  report['load-1440'] = await measure(page);

  // ── Tab switches (sidebar nav) ──
  const tabs = await page.$$eval('.dash-sidebar-link', els => els.map(e => (e.textContent||'').trim()).slice(0, 6));
  await page.evaluate(() => { window.__cls = 0; window.__shifts = []; });
  for (let i = 0; i < Math.min(4, tabs.length); i++) {
    const links = await page.$$('.dash-sidebar-link');
    if (links[i]) { await links[i].click(); await sleep(900); }
  }
  report['after-tab-switches'] = await measure(page);
  report['after-tab-switches'].tabsTried = tabs;

  // ── Idle refresh window (event/poll-driven re-render) ──
  await page.evaluate(() => { window.__cls = 0; window.__shifts = []; });
  await sleep(6000);
  report['idle-refresh'] = await measure(page);

  // ── Resolutions sweep ──
  for (const [w, h] of [[1920,1080],[1366,768],[1280,800],[1024,1366],[834,1112],[768,1024]]) {
    await page.setViewport({ width: w, height: h });
    await page.evaluate(() => { window.__cls = 0; window.__shifts = []; });
    await sleep(1400);
    report[`res-${w}x${h}`] = await measure(page);
  }

  await page.close();
} finally {
  await browser.close();
}

// ── Print concise findings ──
for (const [phase, m] of Object.entries(report)) {
  console.log(`\n=== ${phase} (vw=${m.vw} vh=${m.vh}) ===`);
  console.log(`  CLS=${m.cls}  hOverflow=${m.horizontalOverflow}px  pageScrolls=${m.pageScrolls}  topbar real=${m.topbarRealPx} css=${m.cssTopbarPx} mismatch=${m.topbarMismatch}px`);
  if (m.overflowX?.length) console.log('  overflowX:', JSON.stringify(m.overflowX));
  if (m.trapped?.length) console.log('  trapped fixed/sticky:', JSON.stringify(m.trapped));
  if (m.shifts?.length) console.log('  shifts:', JSON.stringify(m.shifts));
}
console.log('\nDONE');
