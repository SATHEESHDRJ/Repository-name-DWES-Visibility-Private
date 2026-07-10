/**
 * Shared helpers for DWES browser smoke scripts.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Resolve backend API base (matches vite.config.ts proxy logic). */
export function resolveApiBase() {
  if (process.env.DWES_API) return process.env.DWES_API.replace(/\/$/, '');
  const runtimePortFile = path.join(ROOT, 'backend', '.dwes-port');
  if (existsSync(runtimePortFile)) {
    const port = readFileSync(runtimePortFile, 'utf8').trim();
    if (/^\d+$/.test(port)) return `http://127.0.0.1:${port}/api`;
  }
  return 'http://127.0.0.1:3001/api';
}

export const FE = process.env.DWES_FE || 'http://localhost:5175';
export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const ROOT_DIR = ROOT;

export function filterConsoleErrors(errors) {
  return errors.filter((e) => !/favicon|devtools|Failed to load resource.*favicon/i.test(e));
}

/**
 * Bypass a stale Vite /api proxy (502) by routing browser /api/* to the live backend.
 */
export async function setupBrowserApiProxy(page, apiBase = resolveApiBase()) {
  const backendRoot = apiBase.replace(/\/api\/?$/, '');
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (!/\/api(\/|$)/.test(url)) {
      await req.continue();
      return;
    }
    try {
      const parsed = new URL(url);
      const target = `${backendRoot}${parsed.pathname}${parsed.search}`;
      const headers = { ...req.headers() };
      delete headers.host;
      const method = req.method();
      const res = await fetch(target, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : req.postData(),
      });
      const body = Buffer.from(await res.arrayBuffer());
      const resHeaders = {};
      res.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k.toLowerCase())) {
          resHeaders[k] = v;
        }
      });
      await req.respond({ status: res.status, headers: resHeaders, body });
    } catch {
      await req.abort('failed');
    }
  });
}

/**
 * Select project + panel on Supervisor Projects tab.
 * Matches UI dedupe: if API frame id is absent from dropdown, picks first available option.
 */
export async function selectProjectPanel(page, projectCode, panelId) {
  await page.waitForSelector('#pj-active-project', { timeout: 20000 });
  await page.waitForFunction(
    (code) => [...document.querySelectorAll('#pj-active-project option')].some((o) => o.value === code),
    { timeout: 20000 },
    projectCode,
  );

  const currentProject = await page.$eval('#pj-active-project', (el) => el.value);
  if (currentProject !== projectCode) {
    await page.select('#pj-active-project', projectCode);
    await new Promise((r) => setTimeout(r, 900));
  }

  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#pj-active-panel');
      return sel && !sel.disabled && [...sel.querySelectorAll('option[value]:not([value=""])')].length > 0;
    },
    { timeout: 20000 },
  );

  const resolvedPanelId = await page.evaluate((preferredId) => {
    const options = [...document.querySelectorAll('#pj-active-panel option[value]:not([value=""])')];
    const match = options.find((o) => o.value === preferredId);
    return match ? match.value : options[0]?.value ?? '';
  }, panelId);

  if (!resolvedPanelId) {
    throw new Error(`No panel options for project ${projectCode}`);
  }

  await page.select('#pj-active-panel', resolvedPanelId);
  await new Promise((r) => setTimeout(r, 900));
  return resolvedPanelId;
}
