import puppeteer from 'puppeteer';
import { accountForRole } from './demo-account-loader.mjs';

const BASE = 'http://localhost:5175';
const results = [];
const consoleErrors = [];
const supervisorAccount = accountForRole('prod_supervisor');
const technicianAccount = accountForRole('wiring_technician');
const adminAccount = accountForRole('system_admin');
const directorAccount = accountForRole('ops_director');
const qaAccount = accountForRole('qaqc_engineer');

async function login(page, username, password) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input', { timeout: 10000 });
  const inputs = await page.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(username);
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type(password);
  const buttons = await page.$$('button[type="submit"], button');
  await buttons[0].click();
  await new Promise((r) => setTimeout(r, 3000));
}

async function collectPageState(page, label) {
  const state = await page.evaluate(() => {
    const root = document.getElementById('root');
    const text = root?.innerText || '';
    const buttons = [...document.querySelectorAll('button')].map((b) => ({
      text: b.innerText.trim().slice(0, 60),
      disabled: b.disabled,
      visible: b.offsetParent !== null,
    }));
    const modals = [...document.querySelectorAll('.modal-overlay, [role="dialog"]')].length;
    return {
      hasRootContent: text.trim().length > 20,
      textSample: text.slice(0, 300),
      url: location.pathname,
      buttons: buttons.filter((b) => b.visible).slice(0, 30),
      modalCount: modals,
    };
  });
  results.push({ label, ...state });
}

async function testViewport(page, width, height, label) {
  await page.setViewport({ width, height });
  await new Promise((r) => setTimeout(r, 500));
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  results.push({ label, viewport: `${width}x${height}`, ...overflow });
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

try {
  // --- Supervisor ---
  const sup = await browser.newPage();
  sup.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[supervisor] ${msg.text()}`); });
  sup.on('pageerror', (err) => consoleErrors.push(`[supervisor] ${err.message}`));
  await login(sup, supervisorAccount.username, supervisorAccount.password);
  await collectPageState(sup, 'supervisor-after-login');

  for (const [w, h, tag] of [[1280, 800, 'supervisor-desktop'], [1024, 768, 'supervisor-laptop'], [834, 1112, 'supervisor-tablet']]) {
    await testViewport(sup, w, h, tag);
  }

  const docButtons = await sup.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => /View Drawing|Digital Wiring/i.test(b.innerText))
      .map((b) => ({ text: b.innerText.trim(), disabled: b.disabled, className: b.className })),
  );
  results.push({ check: 'supervisor-doc-buttons', buttons: docButtons });

  // Try open New Project modal
  const newProjBtn = await sup.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /New Project/i.test(b.innerText)),
  );
  if (newProjBtn) {
    await newProjBtn.asElement()?.click();
    await new Promise((r) => setTimeout(r, 800));
    const modalOpen = await sup.evaluate(() => !!document.querySelector('.modal-overlay'));
    results.push({ check: 'supervisor-new-project-modal', open: modalOpen });
    if (modalOpen) {
      await sup.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 500));
      const modalClosed = await sup.evaluate(() => !document.querySelector('.modal-overlay'));
      results.push({ check: 'supervisor-modal-esc-close', closed: modalClosed });
    }
  }
  await sup.close();

  // --- Technician ---
  const tech = await browser.newPage();
  tech.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[technician] ${msg.text()}`); });
  await login(tech, technicianAccount.username, technicianAccount.password);
  await collectPageState(tech, 'technician-after-login');
  const techActions = await tech.evaluate(() =>
    [...document.querySelectorAll('.tech-dash-action-btn, button')]
      .filter((b) => /Digital Wiring|GA 3D|Drawing/i.test(b.innerText))
      .map((b) => ({ text: b.innerText.trim(), disabled: b.disabled, title: b.title })),
  );
  results.push({ check: 'technician-doc-actions', actions: techActions });
  await tech.close();

  // --- Other roles quick mount ---
  for (const [user, pass, label] of [
    [adminAccount.username, adminAccount.password, 'admin'],
    [directorAccount.username, directorAccount.password, 'director'],
    [qaAccount.username, qaAccount.password, 'qaqc'],
  ]) {
    const p = await browser.newPage();
    p.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`); });
    await login(p, user, pass);
    await collectPageState(p, `${label}-after-login`);
    await p.close();
  }

  console.log(JSON.stringify({ results, consoleErrors }, null, 2));
} catch (e) {
  console.error('BROWSER_SMOKE_ERROR:', e.message);
  process.exit(1);
} finally {
  await browser.close();
}
