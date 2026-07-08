/**
 * Generate self-signed TLS certificates for LAN HTTPS access.
 * Tries mkcert (trusted locally), then openssl, then Node (selfsigned).
 *
 * Usage: node scripts/generate-certs.mjs [--force]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CERT_DIR, KEY_PATH, CERT_PATH, certsExist } from './certs-config.mjs';
import { DWES_HOSTNAME } from './dwes-hostname.mjs';

const force = process.argv.includes('--force');

function lanIpv4Addresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'which';
  const r = spawnSync(checker, [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

function ensureCertDir() {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

function tryMkcert(hosts) {
  if (!commandExists('mkcert')) return false;

  console.log('[certs] Using mkcert (locally trusted when mkcert -install was run)');
  ensureCertDir();

  const args = [
    '-key-file', KEY_PATH,
    '-cert-file', CERT_PATH,
    ...hosts,
  ];
  const r = spawnSync('mkcert', args, { stdio: 'inherit' });
  return r.status === 0;
}

function tryOpenssl(hosts) {
  if (!commandExists('openssl')) return false;

  console.log('[certs] Using openssl');
  ensureCertDir();

  const sanParts = hosts.flatMap((h, i) => {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return [`IP.${i + 1} = ${h}`];
    return [`DNS.${i + 1} = ${h}`];
  });

  const cnfPath = path.join(CERT_DIR, 'openssl.cnf');
  const cnf = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = DWES LAN

[v3_req]
subjectAltName = @alt_names

[alt_names]
${sanParts.join('\n')}
`;

  fs.writeFileSync(cnfPath, cnf);

  const r = spawnSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', KEY_PATH,
      '-out', CERT_PATH,
      '-days', '825',
      '-nodes',
      '-config', cnfPath,
      '-extensions', 'v3_req',
    ],
    { stdio: 'inherit' },
  );

  try { fs.unlinkSync(cnfPath); } catch { /* ignore */ }
  return r.status === 0;
}

async function tryNodeSelfsigned(hosts) {
  console.log('[certs] Using Node selfsigned (browser will show security warnings)');
  ensureCertDir();

  let generate;
  try {
    ({ generate } = await import('selfsigned'));
  } catch {
    console.error('[certs] Install selfsigned: npm install -D selfsigned');
    return false;
  }

  const altNames = [];
  for (const host of hosts) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      altNames.push({ type: 7, ip: host });
    } else {
      altNames.push({ type: 2, value: host });
    }
  }

  const pems = await generate(null, {
    keySize: 2048,
    days: 825,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: false,
      },
      {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: 'subjectAltName',
        altNames,
      },
    ],
  });

  fs.writeFileSync(KEY_PATH, pems.private);
  fs.writeFileSync(CERT_PATH, pems.cert);
  return true;
}

async function main() {
  if (certsExist() && !force) {
    console.log(`[certs] Certificates already exist in ${CERT_DIR}`);
    console.log('[certs] Re-run with --force to regenerate (e.g. after DHCP IP change)');
    return;
  }

  const lanIps = lanIpv4Addresses();
  const hosts = ['localhost', '127.0.0.1', DWES_HOSTNAME, ...lanIps];
  const uniqueHosts = [...new Set(hosts)];

  console.log('[certs] Subject Alternative Names:', uniqueHosts.join(', '));

  if (tryMkcert(uniqueHosts)) {
    console.log(`[certs] Wrote ${CERT_PATH}`);
    return;
  }
  if (tryOpenssl(uniqueHosts)) {
    console.log(`[certs] Wrote ${CERT_PATH}`);
    return;
  }
  if (await tryNodeSelfsigned(uniqueHosts)) {
    console.log(`[certs] Wrote ${CERT_PATH}`);
    return;
  }

  console.error('[certs] Failed to generate certificates');
  process.exit(1);
}

main();
