import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');

test('PWA manifest keeps the DWES standalone identity and valid icons', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#1B2958');

  for (const icon of manifest.icons) {
    const iconPath = path.join(root, 'public', icon.src.replace(/^\//, ''));
    assert.equal(existsSync(iconPath), true, `${icon.src} must exist`);
    assert.ok(statSync(iconPath).size > 0, `${icon.src} must not be empty`);
  }
});

test('service worker is network-only and bypasses every private API request', () => {
  const worker = read('public/sw.js');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /event\.respondWith\(fetch\(request/);
  assert.match(worker, /request\.mode === 'navigate' \? 'no-store'/);
  assert.doesNotMatch(worker, /\bcaches\s*\./);
  assert.doesNotMatch(worker, /\bCacheStorage\b/);
});

test('frontend registers the root-scoped worker without HTTP-caching its script', () => {
  const main = read('src/main.tsx');
  const registration = read('src/pwa/registerServiceWorker.ts');
  const html = read('index.html');

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(main, /registerDwesServiceWorker\(\)/);
  assert.match(registration, /register\(SERVICE_WORKER_URL/);
  assert.match(registration, /scope:\s*'\/'/);
  assert.match(registration, /updateViaCache:\s*'none'/);
  assert.match(registration, /window\.isSecureContext/);
});
