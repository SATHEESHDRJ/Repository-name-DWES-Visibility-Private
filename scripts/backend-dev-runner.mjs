/**
 * backend-dev-runner.mjs — DWES backend watch supervisor (window-free).
 *
 * ROOT CAUSE THIS REPLACES: `nest start --watch` respawns the application via
 * `spawn(binary, args, { stdio: 'inherit', shell: true })` with no windowsHide
 * (@nestjs/cli/actions/start.action.js). Whenever the watcher itself runs with
 * NO console — the hidden logon launcher, or Codex/CI driving `npm run backend`
 * through pipes — EVERY backend file save made Windows allocate a NEW VISIBLE
 * cmd.exe console for the respawned app.
 *
 * This runner is ONE long-lived supervisor process that:
 *   1. compiles with `nest build --watch` (in-process TypeScript watcher —
 *      spawns no shells; verified: build.action.js contains no child spawn),
 *   2. watches backend/dist for compiled changes,
 *   3. (re)starts `node dist/main.js` itself — shell:false, windowsHide:true,
 *      detached:false — killing ONLY its own tracked child (restart-in-place,
 *      never a second server),
 *   4. guards against duplicate supervisors with a PID lock verified against
 *      the live process command line (never trusts a PID number alone),
 *   5. tears down its children and lock on exit — hot reload behaviour is
 *      preserved (save → recompile → automatic app restart).
 *
 *   node scripts/backend-dev-runner.mjs            # PORT from env, default 3001
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowsProcessCommandLine } from './dwes-process-ownership.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const distDir = path.join(backendDir, 'dist');
const mainJs = path.join(distDir, 'main.js');
const nestJs = path.join(backendDir, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
const logsDir = path.join(root, 'logs');
const PORT = Number(process.env.PORT) || 3001;
const lockPath = path.join(logsDir, `backend-dev-runner.${PORT}.lock.json`);
const isWin = process.platform === 'win32';

const RESTART_DEBOUNCE_MS = 600;
const CRASH_BACKOFF_BASE_MS = 1000;
const CRASH_BACKOFF_MAX_MS = 30_000;
const HEALTHY_RESET_MS = 60_000;

function log(msg, level = 'INFO') {
  const line = `[be-runner] [${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killTree(pid) {
  if (!pid) return;
  if (isWin) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch { /* already gone */ }
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return null; }
}

function writeLock(childPid) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      childPid: childPid ?? null,
      port: PORT,
      root,
      startedAt: new Date().toISOString(),
    }, null, 2));
  } catch { /* lock is best-effort telemetry + duplicate guard */ }
}

function removeLockIfOurs() {
  const lock = readLock();
  if (lock && lock.pid === process.pid) {
    try { fs.unlinkSync(lockPath); } catch { /* ok */ }
  }
}

/**
 * Another live runner for this checkout+port means THIS invocation must not
 * duplicate it. Ownership scoping comes from the lock file living in THIS
 * checkout's logs/ (a different checkout writes its own lock); the command-line
 * check only confirms the PID was not recycled by an unrelated process — the
 * runner may have been started with a relative script path, so the checkout
 * path is not required to appear in the command line.
 */
function existingRunner() {
  const lock = readLock();
  if (!lock || !Number.isInteger(lock.pid) || lock.pid === process.pid) return null;
  if (!pidAlive(lock.pid)) return null;
  if (isWin) {
    const cmd = getWindowsProcessCommandLine(lock.pid).toLowerCase().replace(/\\/g, '/');
    if (!cmd.includes('backend-dev-runner.mjs')) return null;
  }
  return lock;
}

// ── duplicate guard ───────────────────────────────────────────────────────────
const duplicate = existingRunner();
if (duplicate) {
  log(`already running for port ${PORT} (runner PID ${duplicate.pid}) — reusing that instance`);
  process.exit(0);
}
if (!fs.existsSync(nestJs)) {
  log(`Nest CLI not found at ${nestJs} — run: npm --prefix backend install`, 'ERROR');
  process.exit(1);
}
writeLock(null);

// ── compiler: nest build --watch (in-process tsc watcher, no shells) ─────────
const compiler = spawn(process.execPath, [nestJs, 'build', '--watch'], {
  cwd: backendDir,
  stdio: 'inherit',
  windowsHide: true,
  shell: false,
  env: { ...process.env },
});
compiler.on('exit', (code) => {
  log(`compiler exited (code ${code}) — shutting down`, code === 0 ? 'INFO' : 'ERROR');
  shutdown(code ?? 1);
});
compiler.on('error', (error) => {
  log(`compiler failed to start: ${error.message}`, 'ERROR');
  shutdown(1);
});

// ── app child lifecycle: exactly one, restarted in place ─────────────────────
let app = null;
let restartTimer = null;
let restarting = false;
let shuttingDown = false;
let crashCount = 0;
let lastStartAt = 0;

function startApp() {
  if (shuttingDown || app) return;
  if (!fs.existsSync(mainJs)) return; // first compile not finished yet
  lastStartAt = Date.now();
  // Absolute entry path on purpose: the child's command line must contain the
  // checkout path so ownership checks (isDwesProcessCommand, stale cleanup,
  // launcher port recovery) recognise it as THIS workspace's backend.
  app = spawn(process.execPath, [mainJs], {
    cwd: backendDir,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
    detached: false,
    env: { ...process.env, PORT: String(PORT) },
  });
  writeLock(app.pid);
  log(`backend started (PID ${app.pid}, port ${PORT})`);
  app.on('exit', (code, signal) => {
    const wasRestart = restarting;
    app = null;
    writeLock(null);
    if (shuttingDown || wasRestart) return;
    // Unexpected exit (crash) — restart with backoff so a boot loop cannot spin.
    if (Date.now() - lastStartAt > HEALTHY_RESET_MS) crashCount = 0;
    const delay = Math.min(CRASH_BACKOFF_MAX_MS, CRASH_BACKOFF_BASE_MS * 2 ** crashCount);
    crashCount += 1;
    log(`backend exited unexpectedly (code ${code}${signal ? `, signal ${signal}` : ''}) — restarting in ${delay}ms`, 'WARN');
    setTimeout(() => { if (!shuttingDown) startApp(); }, delay).unref();
  });
  app.on('error', (error) => {
    log(`backend failed to start: ${error.message}`, 'ERROR');
    app = null;
  });
}

async function stopApp() {
  if (!app) return;
  const dying = app;
  restarting = true;
  killTree(dying.pid);
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 5000);
    dying.once('exit', () => { clearTimeout(t); resolve(); });
  });
  restarting = false;
  app = null;
}

async function restartApp(reason) {
  if (shuttingDown) return;
  log(`restarting backend — ${reason}`);
  await stopApp();
  startApp();
}

// ── dist watcher: recompiled output → restart the ONE child (no new processes) ─
fs.mkdirSync(distDir, { recursive: true });
let pendingChange = false;
fs.watch(distDir, { recursive: true }, (_event, filename) => {
  if (shuttingDown) return;
  if (filename && !/\.(js|json)$/i.test(String(filename))) return;
  pendingChange = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!pendingChange) return;
    pendingChange = false;
    if (app) void restartApp('compiled output changed');
    else startApp(); // first successful compile
  }, RESTART_DEBOUNCE_MS);
});

// Compile may already be up to date from a previous session.
startApp();
log(`supervising backend dev stack (compiler PID ${compiler.pid}); lock: ${path.relative(root, lockPath)}`);

// ── teardown: kill only OUR children, clear the lock, exit 0 ─────────────────
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (app?.pid) killTree(app.pid);
  if (compiler?.pid && compiler.exitCode === null) killTree(compiler.pid);
  removeLockIfOurs();
  log('stopped');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGBREAK', () => shutdown(0));
process.on('exit', () => {
  if (!shuttingDown) {
    if (app?.pid) killTree(app.pid);
    if (compiler?.pid && compiler.exitCode === null) killTree(compiler.pid);
    removeLockIfOurs();
  }
});
