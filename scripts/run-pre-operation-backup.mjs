/**
 * Runs a full DWES backup before destructive operations (dev hard reset, deploy).
 * Exits non-zero on backup failure so callers can abort the operation.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.DWES_PROJECT_ROOT || path.resolve(scriptDir, '..');
const ps1 = path.join(scriptDir, 'backup.ps1');

const dryRun = process.argv.includes('--dry-run');
const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-PreOperation'];
if (dryRun) psArgs.push('-DryRun');

const result = spawnSync('powershell.exe', psArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    DWES_PROJECT_ROOT: projectRoot,
    DWES_BACKUP_TRIGGER: 'pre-operation',
  },
});

const code = result.status ?? 1;
if (code !== 0 && code !== 2) {
  console.error(`[run-pre-operation-backup] backup failed (exit ${code}) — aborting operation.`);
  process.exit(code);
}

if (code === 2) {
  console.warn('[run-pre-operation-backup] backup completed with warnings (exit 2).');
}

process.exit(0);
