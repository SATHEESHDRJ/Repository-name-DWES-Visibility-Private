/**
 * One-shot checklist for enabling fingerprint on local / LAN dev.
 * Called by npm run fingerprint:setup and npm run dev:fingerprint.
 */
import { spawnSync } from 'node:child_process';
import { DWES_HOSTNAME } from './dwes-hostname.mjs';
import { HTTPS_GATEWAY_PORT, webauthnOrigin } from './dwes-ports.mjs';

const entryUrl = webauthnOrigin(DWES_HOSTNAME);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  DWES — Enable fingerprint (local / LAN)');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('  1. Trust HTTPS cert on this PC (may prompt for Admin):');
console.log('       npm run certs:trust\n');

console.log('  2. Add hosts entry (Admin required — see npm run hosts:help):');
console.log(`       127.0.0.1    ${DWES_HOSTNAME}     ← this laptop`);
console.log('       <LAN-IP>     dwes.local           ← each tablet/phone\n');

console.log('  3. Confirm backend/.env WebAuthn settings:');
console.log(`       RP_ID=${DWES_HOSTNAME}`);
console.log(`       RP_ORIGIN=${entryUrl},https://localhost:${HTTPS_GATEWAY_PORT}\n`);

console.log('  4. Start HTTPS dev stack:');
console.log('       npm run dev:fingerprint   (or npm run dev:https)\n');

console.log('  5. Open this URL (not http://IP:5175):');
console.log(`       ${entryUrl}\n`);

console.log('  6. Sign in with password → top bar → Enable fingerprint.');
console.log('     Windows Hello must be set up in Windows Settings → Sign-in options.\n');

console.log('  On other tablets: trust the dev cert (mkcert root or accept warning)');
console.log('  and add the same hosts line with this PC\'s LAN IP.\n');

console.log('══════════════════════════════════════════════════════════════\n');

// Quick hosts resolution check (non-fatal)
spawnSync(process.execPath, ['scripts/dwes-hosts.mjs', '--check'], { stdio: 'inherit' });
