/**
 * Prints URLs for opening DWES from phones, tablets, or other PCs on the same Wi-Fi / LAN.
 * Usage: node scripts/print-lan-url.mjs [port] [--https]
 */
import os from 'os';
import { DWES_HOSTNAME } from './dwes-hostname.mjs';
import { HTTP_DEV_PORT, HTTPS_GATEWAY_PORT, HTTP_REDIRECT_PORT } from './dwes-ports.mjs';

const args = process.argv.slice(2);
const useHttps = args.includes('--https') || process.env.DWES_HTTPS === '1';
const portArg = args.find((a) => /^\d+$/.test(a));
const PORT = portArg || (useHttps ? HTTPS_GATEWAY_PORT : HTTP_DEV_PORT);
const REDIRECT_PORT = HTTP_REDIRECT_PORT;
const scheme = useHttps ? 'https' : 'http';

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

const ips = lanIpv4Addresses();
const wifiFirst = [...ips].sort((a, b) => Number(isLikelyWifi(b)) - Number(isLikelyWifi(a)));

console.log(`\n[DWES] LAN access (${scheme.toUpperCase()}) — open on any device on the same network\n`);
if (wifiFirst.length === 0) {
  console.log('  No LAN IPv4 found. Connect to Wi-Fi/Ethernet and retry.\n');
} else {
  for (const ip of wifiFirst) {
    const tag = isLikelyWifi(ip) ? 'Wi-Fi/LAN' : 'other';
    console.log(`  [${tag}]  ${scheme}://${ip}:${PORT}`);
  }
}
console.log(`  [hostname] ${scheme}://${DWES_HOSTNAME}:${PORT}  ← use for fingerprint / WebAuthn`);
console.log(`  [local]    ${scheme}://localhost:${PORT}`);
if (useHttps) {
  console.log(`  [local]    http://localhost:${PORT}  (auto-redirects to HTTPS)`);
  console.log(`\n  HTTP redirect: http://<IP>:${REDIRECT_PORT}/ → ${scheme}://<hostname>:${PORT}/`);
  console.log(`\n  WebAuthn / fingerprint (each device on the LAN):`);
  console.log(`    1. Add to hosts file:  <LAN-IP>  ${DWES_HOSTNAME}`);
  console.log(`       Windows: C:\\Windows\\System32\\drivers\\etc\\hosts  (edit as Administrator)`);
  console.log(`    2. backend/.env:  RP_ID=${DWES_HOSTNAME}  RP_ORIGIN=${scheme}://${DWES_HOSTNAME}:${PORT}`);
  console.log(`    3. Trust certs on this PC:  npm run certs:trust`);
  console.log(`    4. Open ${scheme}://${DWES_HOSTNAME}:${PORT} — not the raw IP`);
}
if (!useHttps) {
  console.log(
    `  [note]    Plain HTTP dev (npm run dev / dev:all). https:// on port ${PORT} causes ERR_SSL_PROTOCOL_ERROR — use http:// or npm run dev:watch / dev:https.`,
  );
}
console.log('\n  Dev HTTPS:   npm run dev:https');
console.log('  Deploy LAN:  npm run deploy:lan:https');
console.log('  Certs:       npm run certs:generate');
if (useHttps) {
  console.log('  Login:       username + password (passkeys: set RP_ID + RP_ORIGIN in backend/.env)');
  console.log('  Mobile:      accept the self-signed certificate warning on first visit');
} else {
  console.log('  Login:       use username + password (passkeys need HTTPS + hostname — npm run dev:https)');
}
console.log('  Firewall:    allow Node.js inbound on TCP ports 5175, 3001, and 8080 (Private network)\n');