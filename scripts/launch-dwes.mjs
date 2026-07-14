/**
 * Unified DWES launcher (Windows-friendly, no visible console when called via VBS).
 *
 * Boot sequence (cold start / after reboot):
 *   1. Wait for PostgreSQL (TCP + SELECT 1)
 *   2. Recover partial stacks (orphan Vite without Nest)
 *   3. Start NestJS backend → wait until /api/health OK
 *   4. Start Vite frontend → wait until stack ready
 *   5. Open browser
 *
 *   node scripts/launch-dwes.mjs --mode=dev    # Vite HMR on :5175 + Nest start:dev
 *   node scripts/launch-dwes.mjs --mode=prod   # vite preview + node dist/main
 *
 * Logs: logs/launcher.log (text), logs/startup-report.json (structured)
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectWindowsPortOwner, isDwesProcessCommand } from './dwes-process-ownership.mjs';
import { waitForPostgres } from './wait-for-postgres.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = path.join(root, 'logs');
const BE_PORT = 3001;
const PG_PORT = 5432;
const HEALTH_PATH = '/api/health';
const WAIT_STACK_SECS = 240;
const PG_WAIT_SECS = 120;
const BE_WAIT_BEFORE_FE_SECS = 120;
const BE_RETRY_EVERY_SECS = 20;
const BE_MAX_SPAWNS = 8;

function parseMode() {
  const args = process.argv.slice(2);
  const fromArg = args.find((a) => a.startsWith('--mode='))?.split('=')[1]
    || (args.includes('--prod') ? 'prod' : null)
    || (args.includes('--dev') ? 'dev' : null);
  const raw = (fromArg || process.env.DWES_MODE || 'dev').toLowerCase();
  return raw === 'prod' || raw === 'production' ? 'prod' : 'dev';
}

const mode = parseMode();
const isProd = mode === 'prod';
const suppressBrowser = process.argv.includes('--no-browser');
const bootId = new Date().toISOString().replace(/[:.]/g, '-');

/** @type {{ bootId: string, mode: string, startedAt: string, status: string, phases: object[], stack: object, error?: string, finishedAt?: string }} */
const report = {
  bootId,
  mode,
  startedAt: new Date().toISOString(),
  status: 'running',
  phases: [],
  stack: {},
};

function ensureLogsDir() {
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch { /* ok */ }
}

function log(msg, level = 'INFO') {
  ensureLogsDir();
  const line = `[${new Date().toISOString()}] [${mode}] [${level}] ${msg}\n`;
  try { fs.appendFileSync(path.join(logsDir, 'launcher.log'), line); } catch { /* ok */ }
}

function writeReport() {
  ensureLogsDir();
  try {
    fs.writeFileSync(path.join(logsDir, 'startup-report.json'), JSON.stringify(report, null, 2));
  } catch { /* ok */ }
}

function showFailureMessage(errorText) {
  if (process.platform !== 'win32') return;
  const lines = (errorText || 'DWES could not start.').split(/\r?\n/).map((line) => line.replace(/'/g, "''"));
  const message = lines.join('\n');
  try {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${message}', 'DWES startup failed', 'OK', 'Error') | Out-Null`,
    ], { stdio: 'ignore', windowsHide: true });
  } catch { /* ignore popup failures */ }
}

async function runPhase(name, fn) {
  const t0 = Date.now();
  log(`PHASE ${name} — begin`);
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    report.phases.push({ name, ok: true, ms, ...(detail && typeof detail === 'object' ? detail : {}) });
    log(`PHASE ${name} — ok (${ms}ms)`);
    writeReport();
    return detail;
  } catch (err) {
    const ms = Date.now() - t0;
    const error = err?.message || String(err);
    report.phases.push({ name, ok: false, ms, error });
    log(`PHASE ${name} — FAILED (${ms}ms): ${error}`, 'ERROR');
    writeReport();
    throw err;
  }
}

function readFePort() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const dev = pkg.scripts?.dev || '';
    const m = dev.match(/--port\s+(\d+)/);
    if (m) return Number(m[1]);
  } catch { /* fallback */ }
  return 5175;
}

const FE_PORT = readFePort();
const RUNTIME_PORT_FILE = path.join(root, 'backend', '.dwes-port');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readRuntimeBePort() {
  try {
    const raw = fs.readFileSync(RUNTIME_PORT_FILE, 'utf8').trim();
    const port = Number(raw);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  } catch { /* default */ }
  return BE_PORT;
}

function portReady(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.setTimeout(1000);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

function httpGet(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function backendHealthy() {
  const ports = [...new Set([readRuntimeBePort(), BE_PORT])];
  for (const port of ports) {
    const res = await httpGet(`http://127.0.0.1:${port}${HEALTH_PATH}`);
    if (!res?.ok) continue;
    try {
      const json = JSON.parse(res.body);
      if (json?.status === 'ok') {
        report.stack.backendPort = port;
        return true;
      }
    } catch { /* try next port */ }
  }
  return false;
}

async function isViteDevServer() {
  const res = await httpGet(`http://127.0.0.1:${FE_PORT}/`);
  if (!res?.ok) return false;
  return res.body.includes('/@vite/client');
}

async function frontendReadyForMode() {
  if (!(await portReady(FE_PORT))) return false;
  const isDevServer = await isViteDevServer();
  return isProd ? !isDevServer : isDevServer;
}

async function stackReady() {
  const [fe, be] = await Promise.all([frontendReadyForMode(), backendHealthy()]);
  report.stack = {
    ...report.stack,
    frontendPort: FE_PORT,
    frontendReady: fe,
    backendReady: be,
    mode: isProd ? 'preview' : 'vite-hmr',
  };
  writeReport();
  return fe && be;
}

function findBrowser() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function appUrl() {
  if (!isProd) return `http://localhost:${FE_PORT}/?dwes_dev=${Date.now()}`;
  return `http://localhost:${FE_PORT}/`;
}

function openBrowser(url) {
  if (suppressBrowser) {
    log(`browser open suppressed for watchdog recovery → ${url}`);
    return;
  }
  const browser = findBrowser();
  // Open DWES as a standalone, chromeless "app" window (no tabs / address bar) so
  // only the application UI is visible — a seamless desktop-app experience.
  //   • DWES_APP_ID set → launch the installed Chrome PWA (exact icon/identity).
  //   • otherwise → open the URL via --app=<url> (ad-hoc chromeless window).
  const appId = (process.env.DWES_APP_ID || '').trim();
  if (browser) {
    const args = appId
      ? ['--profile-directory=Default', `--app-id=${appId}`]
      : [`--app=${url}`];
    if (!isProd) args.push('--disable-http-cache');
    log(`opening app window → ${appId ? `app-id ${appId}` : url}`);
    const child = spawn(browser, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return;
  }
  // No Chrome/Edge located — fall back to the default browser (normal window).
  log(`opening browser (default) → ${url}`);
  spawn('cmd', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

function resolveNpmRunner() {
  const nodeDir = path.dirname(process.execPath);
  const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(npmCli)) return { command: process.execPath, prefixArgs: [npmCli] };
  const npmCmd = path.join(nodeDir, 'npm.cmd');
  if (fs.existsSync(npmCmd)) return { command: npmCmd, prefixArgs: [] };
  return { command: 'npm', prefixArgs: [] };
}

const npmRunner = resolveNpmRunner();
let backendSpawnCount = 0;

function runHiddenLogged(command, args, cwd, logName) {
  ensureLogsDir();
  const logPath = path.join(logsDir, logName);
  let outFd;
  try {
    fs.appendFileSync(logPath, `\n===== ${new Date().toISOString()} boot=${bootId} =====\n`);
    outFd = fs.openSync(logPath, 'a');
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: ['ignore', outFd, outFd],
      windowsHide: true,
      env: { ...process.env, DWES_MODE: mode },
    });
    child.on('error', (error) => {
      try {
        fs.appendFileSync(logPath, `[launcher] spawn error: ${error?.message || String(error)}\n`);
      } catch { /* ok */ }
    });
    child.unref();
    return child;
  } catch (error) {
    try {
      fs.appendFileSync(logPath, `[launcher] failed to start: ${error?.message || String(error)}\n`);
    } catch { /* ok */ }
    return null;
  } finally {
    if (typeof outFd === 'number') {
      try { fs.closeSync(outFd); } catch { /* ok */ }
    }
  }
}

function runHiddenNpm(npmArgs, cwd, logName) {
  return runHiddenLogged(npmRunner.command, [...npmRunner.prefixArgs, ...npmArgs], cwd, logName);
}

/**
 * Resolve a local CLI's JS entry (under node_modules) so the dev servers can be
 * started by running node.exe directly — bypassing the `npm → cmd.exe → <cli>`
 * shell chain. Because node.exe is spawned with windowsHide + file stdio +
 * detached, no console window ever appears. Returns null if the entry is absent
 * (callers fall back to the npm script).
 */
function resolveCliJs(...segmentsFromRoot) {
  const p = path.join(root, ...segmentsFromRoot);
  return fs.existsSync(p) ? p : null;
}

function writeLock() {
  ensureLogsDir();
  const lock = {
    bootId,
    mode,
    pid: process.pid,
    fePort: FE_PORT,
    bePort: readRuntimeBePort(),
    startedAt: report.startedAt,
    readyAt: new Date().toISOString(),
  };
  try { fs.writeFileSync(path.join(logsDir, 'dwes.lock'), JSON.stringify(lock, null, 2)); } catch { /* ok */ }
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(path.join(logsDir, 'dwes.lock'), 'utf8')); } catch { return null; }
}

function prodArtifactsOk() {
  return fs.existsSync(path.join(root, 'backend', 'dist', 'main.js'))
    && fs.existsSync(path.join(root, 'dist', 'index.html'));
}

function inspectPortOwner(port) {
  return inspectWindowsPortOwner(port);
}

function isDwesPortOwner(owner) {
  return Boolean(owner && isDwesProcessCommand(owner.commandLine, root));
}

function stopDwesPortOwner(expectedOwner) {
  // Re-read the listener immediately before taskkill. This prevents a process
  // that acquired the port after inspection from being terminated by PID race.
  const currentOwner = inspectPortOwner(expectedOwner.port);
  if (!currentOwner || currentOwner.pid !== expectedOwner.pid || !isDwesPortOwner(currentOwner)) return false;
  try {
    execFileSync('taskkill', ['/PID', String(currentOwner.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function freePorts(ports) {
  log(`checking ports: ${ports.join(', ')}`);
  const blocked = [];
  for (const port of ports) {
    const owner = inspectPortOwner(port);
    if (!owner) continue;
    if (isDwesPortOwner(owner)) {
      const stopped = stopDwesPortOwner(owner);
      log(`cleared DWES-owned listener on ${port} (PID ${owner.pid}) -> ${stopped ? 'stopped' : 'not stopped'}`, stopped ? 'WARN' : 'ERROR');
      if (stopped) continue;
    }
    blocked.push(`${port} (${owner.processName || 'unknown'} PID ${owner.pid})`);
  }
  if (blocked.length) {
    throw new Error(`port(s) already occupied by non-DWES processes: ${blocked.join(', ')}`);
  }
}

function stopStaleBackendProcesses() {
  if (process.platform !== 'win32') return;
  const cleanupScript = path.join(root, 'scripts', 'stop-stale-dwes-backend.ps1');
  if (!fs.existsSync(cleanupScript)) return;

  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', cleanupScript,
      '-RootPath', root,
    ], { cwd: root, stdio: 'pipe', windowsHide: true }).toString().trim();
    if (output) log(`stopped stale backend process(es): ${output}`, 'WARN');
  } catch (err) {
    log(`stale backend cleanup failed: ${err?.message || String(err)}`, 'WARN');
  }
}

function spawnBackend() {
  if (backendSpawnCount >= BE_MAX_SPAWNS) {
    log(`backend spawn limit (${BE_MAX_SPAWNS}) reached`, 'ERROR');
    return false;
  }
  backendSpawnCount += 1;
  log(`backend spawn attempt ${backendSpawnCount}/${BE_MAX_SPAWNS}`);

  if (isProd) {
    if (!fs.existsSync(path.join(root, 'backend', 'dist', 'main.js'))) {
      log('ERROR: backend/dist/main.js missing — run: npm --prefix backend run build', 'ERROR');
      return false;
    }
    log('starting backend (production node dist/main)');
    runHiddenLogged(process.execPath, ['dist/main.js'], path.join(root, 'backend'), 'backend.log');
    return true;
  }
  // Dev watch runs through the runner, NOT `nest start --watch`: the Nest CLI
  // respawns the app with `shell: true` and no windowsHide, which allocates a
  // visible cmd.exe console on EVERY backend file save when the watcher itself
  // is console-less (this hidden launcher). The runner owns one app child and
  // restarts it in place with windowsHide (its PID lock also makes repeated
  // launcher retries reuse the same supervisor instead of stacking watchers).
  log('starting backend (dev watch supervisor: scripts/backend-dev-runner.mjs)');
  const runnerJs = path.join(root, 'scripts', 'backend-dev-runner.mjs');
  if (fs.existsSync(runnerJs)) {
    runHiddenLogged(process.execPath, [runnerJs], root, 'backend.log');
  } else {
    log('backend-dev-runner.mjs not found — falling back to npm run start:dev', 'WARN');
    runHiddenNpm(['run', 'start:dev'], path.join(root, 'backend'), 'backend.log');
  }
  return true;
}

async function ensureBackend() {
  if (await backendHealthy()) {
    log('backend already healthy');
    return { alreadyRunning: true };
  }

  await freePorts([BE_PORT]);
  stopStaleBackendProcesses();
  await sleep(500);

  if (await backendHealthy()) {
    log('backend healthy after port cleanup');
    return { recovered: true };
  }

  if (await portReady(BE_PORT)) {
    log('backend port open but /api/health failing — waiting / retry', 'WARN');
    return { waiting: true };
  }

  spawnBackend();
  return { spawned: true };
}

async function ensureFrontend() {
  if (await frontendReadyForMode()) {
    log(`frontend already ready (${isProd ? 'preview' : 'vite HMR'})`);
    return { alreadyRunning: true };
  }

  if (await portReady(FE_PORT)) {
    log(`wrong server on :${FE_PORT} — freeing`, 'WARN');
    await freePorts([FE_PORT]);
    await sleep(500);
  }

  if (isProd) {
    if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
      log('ERROR: dist/index.html missing — run: npm run build', 'ERROR');
      return { error: 'missing dist' };
    }
    log('starting frontend (vite preview)');
    const viteJs = resolveCliJs('node_modules', 'vite', 'bin', 'vite.js');
    if (viteJs) {
      runHiddenLogged(process.execPath, [viteJs, 'preview', '--host'], root, 'frontend.log');
    } else {
      runHiddenNpm(['run', 'preview:lan'], root, 'frontend.log');
    }
  } else {
    log(`starting frontend (vite :${FE_PORT})`);
    const viteJs = resolveCliJs('node_modules', 'vite', 'bin', 'vite.js');
    if (viteJs) {
      runHiddenLogged(process.execPath, [viteJs, '--host', '--port', String(FE_PORT)], root, 'frontend.log');
    } else {
      runHiddenNpm(['run', 'dev'], root, 'frontend.log');
    }
  }
  return { spawned: true };
}

async function waitForBackendHealthy(maxSecs, label) {
  log(`waiting for backend health — ${label} (up to ${maxSecs}s)`);
  for (let i = 0; i < maxSecs; i += 1) {
    await retryBackendIfNeeded(i);
    if (await backendHealthy()) {
      log(`backend healthy after ${i}s`);
      return true;
    }
    if (i > 0 && i % 30 === 0) log(`still waiting for backend (${i}/${maxSecs}s)`, 'WARN');
    await sleep(1000);
  }
  return false;
}

async function retryBackendIfNeeded(tick) {
  if (await backendHealthy()) return;
  if (tick === 0 || tick % BE_RETRY_EVERY_SECS !== 0) return;

  log('backend retry — clear :3001 and re-spawn', 'WARN');
  await freePorts([BE_PORT]);
  stopStaleBackendProcesses();
  await sleep(500);

  if (await backendHealthy()) return;
  if (await portReady(BE_PORT)) {
    log('backend port busy after cleanup — waiting for health', 'WARN');
    return;
  }
  spawnBackend();
}

async function recoverPartialStack() {
  const feUp = await frontendReadyForMode();
  const beUp = await backendHealthy();

  report.stack.partialDetected = feUp && !beUp;
  writeReport();

  if (feUp && !beUp) {
    log('RECOVERY: partial stack — frontend up, backend down; stopping orphan frontend', 'WARN');
    await freePorts([FE_PORT]);
    await sleep(600);
    return { recovered: true, stoppedFrontend: true };
  }

  if (!feUp && (await portReady(FE_PORT))) {
    log('RECOVERY: stale listener on frontend port — freeing', 'WARN');
    await freePorts([FE_PORT]);
    await sleep(400);
    return { recovered: true, freedFrontendPort: true };
  }

  if (!beUp && (await portReady(BE_PORT))) {
    log('RECOVERY: stale listener on backend port without health — freeing', 'WARN');
    await freePorts([BE_PORT]);
    await sleep(400);
    return { recovered: true, freedBackendPort: true };
  }

  return { recovered: false };
}

async function main() {
  ensureLogsDir();
  log(`========== DWES BOOT ${bootId} ==========`);
  log(`launch start mode=${mode} FE:${FE_PORT} BE:${BE_PORT} PG:${PG_PORT}`);
  writeReport();

  if (isProd && !prodArtifactsOk()) {
    report.status = 'failed';
    report.error = 'production artifacts missing';
    writeReport();
    log('ERROR: production artifacts missing', 'ERROR');
    process.exit(1);
  }

  await runPhase('preflight-ports', async () => {
    const checks = await Promise.all([
      portReady(PG_PORT),
      portReady(BE_PORT),
      portReady(FE_PORT),
    ]);
    return {
      postgresPort: checks[0],
      backendPort: checks[1],
      frontendPort: checks[2],
      expectedPorts: [PG_PORT, BE_PORT, FE_PORT],
    };
  });

  await runPhase('postgres', async () => {
    const pg = await waitForPostgres({
      maxSecs: PG_WAIT_SECS,
      onLog: (msg) => log(`postgres: ${msg}`),
    });
    if (!pg.ok) {
      throw new Error(`PostgreSQL is not reachable on port ${PG_PORT} (${pg.database || 'default'}). Start PostgreSQL and try again.`);
    }
    return { postgresOk: true, waitedSecs: pg.waitedSecs, database: pg.database };
  });

  if (await stackReady()) {
    const lock = readLock();
    log('full stack already running — opening browser');
    if (lock?.mode && lock.mode !== mode) {
      log(`WARNING: lock mode was ${lock.mode}, requested ${mode}`, 'WARN');
    }
    report.status = 'ready';
    report.finishedAt = new Date().toISOString();
    writeReport();
    writeLock();
    openBrowser(appUrl());
    return;
  }

  await runPhase('recover-partial', recoverPartialStack);

  await runPhase('backend-start', ensureBackend);

  await runPhase('backend-health', async () => {
    const ok = await waitForBackendHealthy(BE_WAIT_BEFORE_FE_SECS, 'before frontend');
    if (!ok) throw new Error(`backend not healthy within ${BE_WAIT_BEFORE_FE_SECS}s`);
    return { healthy: true };
  });

  await runPhase('frontend-start', ensureFrontend);

  await runPhase('stack-ready', async () => {
    log(`waiting for full stack (up to ${WAIT_STACK_SECS}s)`);
    for (let i = 0; i < WAIT_STACK_SECS; i += 1) {
      await retryBackendIfNeeded(i);
      if (await stackReady()) {
        log(`full stack ready after ${i}s`);
        return { ready: true, waitedSecs: i };
      }
      if (i > 0 && i % 30 === 0) log(`stack not ready yet (${i}/${WAIT_STACK_SECS}s)`, 'WARN');
      await sleep(1000);
    }
    throw new Error(`stack not ready within ${WAIT_STACK_SECS}s`);
  });

  report.status = 'ready';
  report.finishedAt = new Date().toISOString();
  writeReport();
  writeLock();

  log(`BOOT SUCCESS — total ${Date.now() - new Date(report.startedAt).getTime()}ms`);
  log(`ready — opening ${appUrl()}`);
  openBrowser(appUrl());
}

main().catch((e) => {
  report.status = 'failed';
  report.error = e?.message || String(e);
  report.finishedAt = new Date().toISOString();
  writeReport();
  log(`BOOT FAILED: ${report.error}`, 'ERROR');
  log('see logs/backend.log logs/frontend.log logs/startup-report.json', 'ERROR');
  const details = [
    'DWES could not start.',
    `Reason: ${report.error}`,
    '',
    'Logs:',
    '- logs/launcher.log',
    '- logs/startup-report.json',
    '- logs/backend.log',
    '- logs/frontend.log',
  ].join('\n');
  showFailureMessage(details);
  process.exit(1);
});
