/**
 * Launch an elevated PowerShell window to add 127.0.0.1 dwes.local to the hosts file.
 * Requires user approval in the UAC prompt — cannot run silently.
 *
 * Usage: npm run hosts:install
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DWES_HOSTNAME } from './dwes-hostname.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

if (process.platform !== 'win32') {
  console.log('\n[hosts:install] Add this line to /etc/hosts (sudo):');
  console.log(`  127.0.0.1    ${DWES_HOSTNAME}\n`);
  process.exit(0);
}

const ps1Path = path.join(ROOT, 'scripts', '_hosts-install.ps1');
const ps1 = `# DWES hosts installer — run elevated
$hosts = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"
$line = "127.0.0.1    ${DWES_HOSTNAME}"
$pattern = [regex]::Escape("${DWES_HOSTNAME}")
if (Select-String -Path $hosts -Pattern $pattern -Quiet) {
  Write-Host "[DWES] ${DWES_HOSTNAME} is already in the hosts file." -ForegroundColor Green
} else {
  Add-Content -Path $hosts -Value $line
  Write-Host "[DWES] Added to hosts file:" $line -ForegroundColor Green
}
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. npm run certs:trust"
Write-Host "  2. npm run dev:fingerprint"
Write-Host "  3. Open https://${DWES_HOSTNAME}:5173"
Write-Host ""
Read-Host "Press Enter to close"
`;

fs.writeFileSync(ps1Path, ps1, 'utf8');

console.log('\n[hosts:install] Opening elevated PowerShell — approve the UAC prompt.\n');

const child = spawn(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${ps1Path.replace(/'/g, "''")}'`,
  ],
  { stdio: 'inherit', cwd: ROOT },
);

child.on('exit', (code) => {
  if (code !== 0) {
    console.error('\n[hosts:install] Could not launch elevated prompt.');
    console.error('Add manually (Administrator Notepad):');
    console.error(`  C:\\Windows\\System32\\drivers\\etc\\hosts`);
    console.error(`  127.0.0.1    ${DWES_HOSTNAME}\n`);
    process.exit(code ?? 1);
  }
  console.log('\n[hosts:install] Verify: npm run hosts:help -- --check\n');
});
