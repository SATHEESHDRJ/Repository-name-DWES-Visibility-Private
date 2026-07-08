/**
 * Install a locally-trusted CA (mkcert) and regenerate DWES TLS certificates.
 * Removes NET::ERR_CERT_AUTHORITY_INVALID in Chrome on this PC.
 *
 * Usage: npm run certs:trust
 *
 * Requires mkcert: https://github.com/FiloSottile/mkcert
 *   Windows (choco): choco install mkcert
 *   Or download from GitHub releases.
 */
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { HTTPS_GATEWAY_PORT } from './dwes-ports.mjs';

function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'which';
  const r = spawnSync(checker, [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return r.status === 0;
}

async function main() {
  if (!commandExists('mkcert')) {
    console.error('\n[certs:trust] mkcert is not installed.\n');
    console.error('  Install mkcert to trust local HTTPS certificates on this PC:');
    console.error('  https://github.com/FiloSottile/mkcert#installation\n');
    console.error('  Windows (Chocolatey):  choco install mkcert');
    console.error('  Then re-run:           npm run certs:trust\n');
    console.error('  Without mkcert, click Advanced → Proceed to localhost (unsafe) in Chrome.\n');
    process.exit(1);
  }

  console.log('[certs:trust] Installing local CA (may prompt for admin approval)...');
  if (!run('mkcert', ['-install'])) {
    console.error('[certs:trust] mkcert -install failed. Try running this terminal as Administrator.');
    process.exit(1);
  }

  console.log('[certs:trust] Regenerating certificates with mkcert...');
  const gen = spawn(process.execPath, ['scripts/generate-certs.mjs', '--force'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  gen.on('close', (code) => {
    if (code === 0) {
      console.log(`\n[certs:trust] Done. Restart npm run dev:fingerprint and open https://localhost:${HTTPS_GATEWAY_PORT}`);
      console.log('[certs:trust] The certificate warning should no longer appear on this PC.\n');
    } else {
      process.exit(code ?? 1);
    }
  });
}

main();
