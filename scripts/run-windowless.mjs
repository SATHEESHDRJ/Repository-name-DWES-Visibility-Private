/**
 * run-windowless.mjs — run a command whose whole process tree can never open a
 * visible console window.
 *
 *   node scripts/run-windowless.mjs <command> [args...]
 *
 * WHY: on Windows a console-subsystem child allocates a NEW visible console
 * whenever its parent has none (hidden launchers, Codex/CI pipes) and
 * CREATE_NO_WINDOW is not set. Tools we cannot patch (Nest CLI `shell: true`
 * respawns, `node --test` per-file children) inherit whatever console the top
 * process owns — so this wrapper starts the top process with `windowsHide: true`
 * (CREATE_NO_WINDOW): it receives a windowless console that all descendants
 * inherit. Output still flows through the current stdio; the exit code is
 * forwarded faithfully (never a shell-artifact 127).
 *
 * Ctrl+C: the child tree lives in its own (windowless) console, so the caller's
 * Ctrl+C cannot reach it — this wrapper traps SIGINT/SIGTERM and tree-kills the
 * child instead.
 */
import { spawn, execFileSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/run-windowless.mjs <command> [args...]');
  process.exit(2);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  windowsHide: true,
  shell: false,
});

let stopping = false;
function stopTree() {
  if (stopping || child.exitCode !== null || !child.pid) return;
  stopping = true;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch { /* already gone */ }
  } else {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

process.on('SIGINT', stopTree);
process.on('SIGTERM', stopTree);
process.on('SIGBREAK', stopTree);
process.on('exit', stopTree);

child.on('error', (error) => {
  console.error(`[run-windowless] failed to start "${command}": ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
