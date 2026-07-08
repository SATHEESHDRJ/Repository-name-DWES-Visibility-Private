/**
 * One-click DWES launcher (console-visible fallback for terminals).
 * On Windows, prefer Start DWES (Hidden).vbs for zero console windows.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

if (isWin) {
  const { spawn } = await import('node:child_process');
  const vbs = path.join(root, 'Start DWES (Hidden).vbs');
  spawn('wscript.exe', [vbs], { stdio: 'inherit', windowsHide: true });
} else {
  await import('./launch-hidden.mjs');
}
