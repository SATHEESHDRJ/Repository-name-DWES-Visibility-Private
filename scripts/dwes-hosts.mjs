/**
 * Print hosts-file lines for dwes.local WebAuthn / fingerprint setup.
 * Does NOT modify the hosts file — elevation is required (user must run as Admin).
 *
 * Usage:
 *   node scripts/dwes-hosts.mjs          # print instructions
 *   node scripts/dwes-hosts.mjs --check  # verify dwes.local resolves
 */
import dns from 'node:dns/promises';
import os from 'node:os';
import { DWES_HOSTNAME } from './dwes-hostname.mjs';
import { HTTPS_GATEWAY_PORT } from './dwes-ports.mjs';

const HOSTS_PATH =
  process.platform === 'win32'
    ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
    : '/etc/hosts';

function lanIpv4Addresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

function isLikelyWifi(ip) {
  return ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

async function checkResolution() {
  try {
    const { address } = await dns.lookup(DWES_HOSTNAME);
    console.log(`[hosts] OK — ${DWES_HOSTNAME} resolves to ${address}`);
    console.log(`[hosts] Open https://${DWES_HOSTNAME}:${HTTPS_GATEWAY_PORT} after npm run dev:https\n`);
    return true;
  } catch {
    console.log(`[hosts] MISSING — ${DWES_HOSTNAME} does not resolve yet.\n`);
    return false;
  }
}

function printInstructions() {
  const ips = lanIpv4Addresses();
  const lanIp = [...ips].sort((a, b) => Number(isLikelyWifi(b)) - Number(isLikelyWifi(a)))[0];

  console.log('\n[DWES] Hosts file setup for fingerprint / WebAuthn\n');
  console.log(`  File: ${HOSTS_PATH}`);
  console.log('  Edit as Administrator (Windows: right-click Notepad → Run as administrator).\n');

  console.log('  ── This laptop only (fingerprint on this PC) ──');
  console.log(`  127.0.0.1    ${DWES_HOSTNAME}\n`);

  if (lanIp) {
    console.log('  ── Tablets / phones on the same Wi-Fi (add on EACH device) ──');
    console.log(`  ${lanIp}    ${DWES_HOSTNAME}\n`);
  } else {
    console.log('  (No LAN IPv4 detected — connect to Wi-Fi and re-run npm run hosts:help)\n');
  }

  console.log('  ── Open after hosts + dev:https ──');
  console.log(`  https://${DWES_HOSTNAME}:${HTTPS_GATEWAY_PORT}\n`);

  console.log('  ── Optional: elevated PowerShell on THIS PC (copy/paste — not run automatically) ──');
  console.log('  Start-Process powershell -Verb RunAs -ArgumentList @(\'-NoExit\', \'-Command\', @\'');
  console.log(`    $hosts = "${HOSTS_PATH}"`);
  console.log(`    $line = "127.0.0.1    ${DWES_HOSTNAME}"`);
  console.log('    if (-not (Select-String -Path $hosts -Pattern "dwes\\.local" -Quiet)) {');
  console.log('      Add-Content -Path $hosts -Value $line');
  console.log('      Write-Host "Added:" $line');
  console.log('    } else { Write-Host "dwes.local already in hosts file" }');
  console.log('  \'@)\n');
}

const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const ok = await checkResolution();
  if (!ok) printInstructions();
  process.exit(ok ? 0 : 1);
} else {
  printInstructions();
  await checkResolution();
}
