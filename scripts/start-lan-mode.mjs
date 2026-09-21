/**
 * Universal Local Network Mode - start frontend + backend for any Wi-Fi/LAN.
 * Binds Vite to IPv4 0.0.0.0 and backend to 0.0.0.0 so tablets/phones can connect.
 * Usage: npm run lan [-- --skip-firewall]
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatLanBanner, preferredLanIpv4 } from './lan-network.mjs';
import { HTTP_DEV_PORT } from './dwes-ports.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipFirewall = process.argv.includes('--skip-firewall');
const FE_PORT = HTTP_DEV_PORT;
const BE_PORT = Number(process.env.PORT) || 3001;
const isWin = process.platform === 'win32';

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true, env: process.env });
}

function ensureFirewall() {
  if (skipFirewall || !isWin) return;
  const ps1 = path.join(root, 'scripts', 'ensure-lan-firewall.ps1');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status === 2) {
    console.log('[DWES] Firewall rules need an elevated PowerShell once (see command above).');
    console.log('[DWES] Continuing startup - tablets may be blocked until rules exist.\n');
  }
}

console.log(formatLanBanner({ frontendPort: FE_PORT, backendPort: BE_PORT, scheme: 'http' }));
if (!preferredLanIpv4()) {
  console.warn('[DWES] Warning: No LAN IP yet - still binding 0.0.0.0; reconnect Wi-Fi and restart.\n');
}

ensureFirewall();

const portsCheck = runNode(path.join(root, 'scripts', 'check-dev-ports.mjs'), [String(FE_PORT), String(BE_PORT)]);
if (portsCheck.status !== 0) process.exit(portsCheck.status ?? 1);

const env = { ...process.env, HOST: '0.0.0.0', PORT: String(BE_PORT), DWES_MODE: process.env.DWES_MODE || 'dev', VITE_HTTP_PORT: String(FE_PORT) };
// Run concurrently through the shell as a single quoted command string (matching the
// working "dev:all" script). The FE uses `dev:lan` = `vite --host 0.0.0.0`, binding IPv4
// explicitly so Android/iOS clients reach the IPv4 LAN address (default --host binds :: / IPv6).
const cmd = `concurrently -n FE,BE -c cyan,green --kill-others-on-fail "npm run dev:lan" "npm run backend"`;
const child = spawn(cmd, { cwd: root, stdio: 'inherit', windowsHide: true, shell: true, env });

child.on('exit', (code, signal) => { if (signal) process.exit(1); process.exit(code ?? 0); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => { try { child.kill('SIGTERM'); } catch {} });
}
