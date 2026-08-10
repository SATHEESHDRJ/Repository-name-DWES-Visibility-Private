/**
 * Prints URLs for opening DWES from phones, tablets, or other PCs on the same Wi-Fi / LAN.
 * Usage: node scripts/print-lan-url.mjs [port] [--https]
 */
import { DWES_HOSTNAME } from './dwes-hostname.mjs';
import { HTTP_DEV_PORT, HTTPS_GATEWAY_PORT, HTTP_REDIRECT_PORT } from './dwes-ports.mjs';
import { formatLanBanner, lanIpv4Addresses, preferredLanIpv4 } from './lan-network.mjs';

const args = process.argv.slice(2);
const useHttps = args.includes('--https') || process.env.DWES_HTTPS === '1';
const portArg = args.find((a) => /^\d+$/.test(a));
const PORT = portArg || (useHttps ? HTTPS_GATEWAY_PORT : HTTP_DEV_PORT);
const BE_PORT = Number(process.env.PORT) || 3001;
const REDIRECT_PORT = HTTP_REDIRECT_PORT;
const scheme = useHttps ? 'https' : 'http';

if (!useHttps) {
  console.log(formatLanBanner({ frontendPort: Number(PORT), backendPort: BE_PORT, scheme: 'http' }));
} else {
  const preferred = preferredLanIpv4();
  const ips = lanIpv4Addresses();
  console.log('\n[DWES] LAN access (HTTPS) - open on any device on the same network\n');
  if (!preferred) {
    console.log('  No private LAN IPv4 found. Connect to Wi-Fi/Ethernet and retry.\n');
  } else {
    console.log('  Current LAN IP : ' + preferred);
    for (const ip of ips) {
      console.log('  [Wi-Fi/LAN]  ' + scheme + '://' + ip + ':' + PORT);
    }
  }
  console.log('  [hostname] ' + scheme + '://' + DWES_HOSTNAME + ':' + PORT + '  <- fingerprint / WebAuthn');
  console.log('  [local]    ' + scheme + '://localhost:' + PORT);
  console.log('  [local]    http://localhost:' + PORT + '  (auto-redirects to HTTPS)');
  console.log('\n  HTTP redirect: http://<IP>:' + REDIRECT_PORT + '/ -> ' + scheme + '://<hostname>:' + PORT + '/');
}

console.log('\n  Universal LAN (HTTP):  npm run lan');
console.log('  Dev HTTPS:             npm run dev:https');
console.log('  Firewall (elevated):   npm run lan:firewall');
console.log('  Login:       username + password on HTTP LAN (passkeys need npm run dev:https)');
console.log('  Firewall:    allow inbound TCP 5175, 3001 on ALL profiles (works on Public Wi-Fi)');
console.log('  If tablets still fail: Wi-Fi may use AP/client isolation (guest mode) - use a non-guest network or hotspot.\n');
