/**
 * e2e-backend.mjs — managed TEMPORARY backend for live E2E/verification runs.
 *
 * Replaces the ad-hoc pattern of starting `node dist/main.js` from a throwaway
 * shell (which previously left teardown to killing by port — terminating the
 * hosting shell and surfacing bogus exit codes like 127). This harness:
 *   • starts the server SILENTLY (windowsHide + file-based stdio → logs/),
 *   • isolates uploads into a temp dir (real backend/uploads is never touched),
 *   • records the exact child PID in a lock file,
 *   • stop kills ONLY that PID after re-verifying its command line still is
 *     THIS checkout's backend/dist/main.js (never a bare kill-by-port),
 *   • is idempotent: start twice reuses the healthy instance; stop twice is a
 *     no-op; exit codes are always meaningful (0 ok / 1 failure).
 *
 *   node scripts/e2e-backend.mjs start   [--port=3199] [--upload-dir=PATH]
 *   node scripts/e2e-backend.mjs stop    [--port=3199]
 *   node scripts/e2e-backend.mjs status  [--port=3199]
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowsProcessCommandLine } from './dwes-process-ownership.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const mainJs = path.join(backendDir, 'dist', 'main.js');
const logsDir = path.join(root, 'logs');
const isWin = process.platform === 'win32';

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) || 'status';
const argValue = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const PORT = Number(argValue('port', process.env.DWES_E2E_PORT || 3199));
const uploadDir = path.resolve(argValue('upload-dir', path.join(os.tmpdir(), `dwes-e2e-uploads-${PORT}`)));
const lockPath = path.join(logsDir, `e2e-backend.${PORT}.lock.json`);
const logPath = path.join(logsDir, `e2e-backend.${PORT}.log`);
const HEALTH_WAIT_SECS = 60;

function log(msg) { console.log(`[e2e-backend] ${msg}`); }
function fail(msg) { console.error(`[e2e-backend] ERROR: ${msg}`); process.exit(1); }

function readLock() {
  try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return null; }
}
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** True only when the PID is still OUR temp backend (this checkout's dist/main.js). */
function pidIsOurBackend(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !pidAlive(pid)) return false;
  if (!isWin) return true; // POSIX: trust the lock; kill is non-tree SIGTERM anyway
  const cmd = getWindowsProcessCommandLine(pid).toLowerCase().replace(/\\/g, '/');
  if (!cmd) return false;
  const rootToken = root.toLowerCase().replace(/\\/g, '/');
  return cmd.includes(rootToken) && /backend\/dist\/main(\.js)?/.test(cmd);
}

function health(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).status === 'ok'); }
        catch { resolve(false); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  if (!fs.existsSync(mainJs)) {
    fail(`backend/dist/main.js missing — run: npm --prefix backend run build`);
  }
  const lock = readLock();
  if (lock && pidIsOurBackend(lock.pid)) {
    if (await health(PORT)) {
      log(`already running and healthy (PID ${lock.pid}, port ${PORT}) — reusing`);
      return;
    }
    log(`stale instance (PID ${lock.pid}) is not healthy — stopping it first`);
    stopPid(lock.pid);
  } else if (lock) {
    try { fs.unlinkSync(lockPath); } catch { /* ok */ }
  }
  if (await health(PORT)) {
    fail(`port ${PORT} already serves a healthy /api/health that this harness does not own — refusing to touch it`);
  }

  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(logPath, `\n===== ${new Date().toISOString()} e2e-backend start (port ${PORT}) =====\n`);
  const outFd = fs.openSync(logPath, 'a');
  // Absolute entry path: the ownership re-check in stop() matches the checkout
  // path in the live command line before any kill.
  const child = spawn(process.execPath, [mainJs], {
    cwd: backendDir,
    detached: true,                 // survives this CLI exiting…
    stdio: ['ignore', outFd, outFd],
    windowsHide: true,              // …but never gets a visible console
    shell: false,
    env: {
      ...process.env,
      PORT: String(PORT),
      UPLOAD_DIR: uploadDir,
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
  });
  child.unref();
  fs.closeSync(outFd);
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: child.pid, port: PORT, root, uploadDir, log: logPath, startedAt: new Date().toISOString(),
  }, null, 2));

  for (let i = 0; i < HEALTH_WAIT_SECS; i++) {
    if (await health(PORT)) {
      log(`READY — PID ${child.pid}, http://127.0.0.1:${PORT}/api/health ok, uploads → ${uploadDir}`);
      return;
    }
    if (!pidAlive(child.pid)) {
      try { fs.unlinkSync(lockPath); } catch { /* ok */ }
      fail(`backend exited during startup — see ${logPath}`);
    }
    await sleep(1000);
  }
  stopPid(child.pid);
  try { fs.unlinkSync(lockPath); } catch { /* ok */ }
  fail(`backend did not become healthy within ${HEALTH_WAIT_SECS}s — see ${logPath}`);
}

function stopPid(pid) {
  if (isWin) {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ }
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
  }
}

async function stop() {
  const lock = readLock();
  if (!lock) { log(`not running (no lock for port ${PORT})`); return; }
  if (!pidAlive(lock.pid)) {
    log(`not running (stale lock, PID ${lock.pid} gone) — lock removed`);
    try { fs.unlinkSync(lockPath); } catch { /* ok */ }
    return;
  }
  if (!pidIsOurBackend(lock.pid)) {
    try { fs.unlinkSync(lockPath); } catch { /* ok */ }
    fail(`PID ${lock.pid} no longer matches this checkout's backend — lock cleared, nothing killed`);
  }
  stopPid(lock.pid);
  for (let i = 0; i < 20 && pidAlive(lock.pid); i++) await sleep(250);
  if (pidAlive(lock.pid)) fail(`PID ${lock.pid} did not exit`);
  try { fs.unlinkSync(lockPath); } catch { /* ok */ }
  log(`stopped (PID ${lock.pid}, port ${PORT})`);
}

async function status() {
  const lock = readLock();
  const healthy = await health(PORT);
  log(JSON.stringify({
    port: PORT,
    lock: lock ? { pid: lock.pid, startedAt: lock.startedAt, uploadDir: lock.uploadDir } : null,
    pidAlive: lock ? pidAlive(lock.pid) : false,
    owned: lock ? pidIsOurBackend(lock.pid) : false,
    healthy,
  }, null, 2));
  if (lock && !pidAlive(lock.pid)) process.exitCode = 1;
}

if (command === 'start') await start();
else if (command === 'stop') await stop();
else if (command === 'status') await status();
else fail(`unknown command "${command}" — use start | stop | status`);
