/**
 * Hidden DWES launcher — thin wrapper kept for older callers.
 * Prefer scripts/launch-dwes.mjs (--mode=dev|prod).
 * Default: Development Mode (Vite HMR on :5175).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.find((a) => a.startsWith('--mode='))
  || (args.includes('--prod') ? '--mode=prod' : '--mode=dev');

const child = spawn(process.execPath, [path.join(root, 'scripts', 'launch-dwes.mjs'), mode], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
