import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ps1 = path.join(scriptDir, 'backup.ps1');

const extraArgs = process.argv.slice(2).flatMap((arg) => {
  if (arg === '--dry-run' || arg === '-DryRun') return ['-DryRun'];
  return [arg];
});

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...extraArgs],
  { stdio: 'inherit', windowsHide: true },
);

process.exit(result.status ?? 1);
