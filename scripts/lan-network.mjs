/**
 * Shared LAN IPv4 detection for Universal Local Network Mode.
 * Prefer RFC1918 private addresses; skip loopback and link-local (169.254.x.x).
 */
import os from 'os';

export function isPrivateLanIpv4(ip) {
  if (!ip || ip === '127.0.0.1') return false;
  if (ip.startsWith('169.254.')) return false;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('10.')) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

export function lanIpv4Addresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && isPrivateLanIpv4(iface.address)) {
        addrs.push(iface.address);
      }
    }
  }
  return [...new Set(addrs)];
}

export function preferredLanIpv4() {
  const ips = lanIpv4Addresses();
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    return 2;
  };
  return [...ips].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function formatLanBanner({ frontendPort, backendPort, scheme = 'http' }) {
  const ips = lanIpv4Addresses();
  const preferred = preferredLanIpv4();
  const lines = [];
  lines.push('');
  lines.push('[DWES] Universal Local Network Mode');
  lines.push('  Same Wi-Fi/LAN as this PC -> open the Frontend URL on any tablet/phone/laptop.');
  lines.push('  API calls use relative /api (Vite proxy) - no hardcoded host in the app.');
  lines.push('');
  if (!preferred) {
    lines.push('  No private LAN IPv4 detected. Connect to Wi-Fi / Ethernet / hotspot and restart.');
    lines.push('  Local only: ' + scheme + '://localhost:' + frontendPort);
  } else {
    lines.push('  Current LAN IP : ' + preferred);
    lines.push('  Frontend URL   : ' + scheme + '://' + preferred + ':' + frontendPort);
    lines.push('  Backend URL    : ' + scheme + '://' + preferred + ':' + backendPort);
    lines.push('  Health         : ' + scheme + '://' + preferred + ':' + backendPort + '/api/health');
    lines.push('  On this PC     : ' + scheme + '://localhost:' + frontendPort);
    if (ips.length > 1) {
      lines.push('  Other adapters:');
      for (const ip of ips.filter((a) => a !== preferred)) {
        lines.push('    ' + scheme + '://' + ip + ':' + frontendPort);
      }
    }
  }
  lines.push('');
  lines.push('  Tip: IP changes when you switch Wi-Fi - restart npm run lan to reprint the URL.');
  lines.push('  Password login works on HTTP LAN. Passkeys need HTTPS + hostname (npm run dev:https).');
  lines.push('');
  return lines.join('\n');
}
