/**
 * Desktop launcher — creates exactly ONE DWES startup icon.
 *
 *   node scripts/create-desktop-shortcut.mjs          -> single launcher (default)
 *   node scripts/create-desktop-shortcut.mjs --lan    -> browser-only .url for LAN tablets (not on host desktop)
 */
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const icoPath = path.join(root, 'public', 'app-icon.ico');
const PORT = process.env.VITE_PORT || 5173;
const fixScript = path.join(root, 'scripts', 'fix-desktop-shortcut.ps1');

if (process.platform !== 'win32') {
  console.error('[DWES] Desktop shortcuts are Windows-only.');
  process.exit(1);
}

const args = process.argv.slice(2);
const wantLan = args.includes('--lan');
let url = args.find(a => a.startsWith('http'));

if (wantLan || url) {
  if (!fs.existsSync(icoPath)) {
    console.error('[DWES] Icon not found. Run `npm run icons:generate` first.');
    process.exit(1);
  }
  const desktop = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"],
    { encoding: 'utf8' },
  ).trim();

  if (!url) {
    let ip = null;
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
      }
      if (ip) break;
    }
    if (!ip) {
      console.error('[DWES] No LAN IP found.');
      process.exit(1);
    }
    url = `https://${ip}:${PORT}/`;
  }

  const shortcutPath = path.join(desktop, 'DWES.url');
  fs.writeFileSync(shortcutPath, [
    '[InternetShortcut]',
    `URL=${url}`,
    `IconFile=${icoPath}`,
    'IconIndex=0',
    '',
  ].join('\r\n'), 'utf8');

  console.log(`\n[DWES] LAN browser shortcut: ${shortcutPath}\n  Opens: ${url}\n`);
  process.exit(0);
}

execFileSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fixScript],
  { stdio: 'inherit' },
);
