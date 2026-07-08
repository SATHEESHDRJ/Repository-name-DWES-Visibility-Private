/**
 * Hidden DWES launcher — starts backend + frontend with no visible console,
 * waits for ports, opens browser. Used by Start DWES (Hidden).vbs.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logFile = path.join(root, 'dwes-launch.log');
const BE_PORT = 3001;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* ok */ }
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
const APP_URL = `http://localhost:${FE_PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portReady(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.setTimeout(1000);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

function openBrowser(url) {
  spawn('cmd', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

/** Run a command in a fully hidden child process (no console flash). */
function runHidden(command, cwd) {
  const child = spawn('cmd.exe', ['/c', command], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return child;
}

async function allReady() {
  const [fe, be] = await Promise.all([portReady(FE_PORT), portReady(BE_PORT)]);
  return fe && be;
}

async function main() {
  log(`launch-hidden start (FE:${FE_PORT} BE:${BE_PORT})`);

  if (await allReady()) {
    log('already running — opening browser');
    openBrowser(APP_URL);
    return;
  }

  try {
    execFileSync('node', [
      path.join(root, 'scripts', 'check-dev-ports.mjs'),
      String(FE_PORT),
      String(BE_PORT),
    ], { cwd: root, stdio: 'ignore', windowsHide: true });
  } catch { /* port conflict — continue and let wait loop surface it */ }

  if (!(await portReady(BE_PORT))) {
    log('starting backend');
    runHidden('npm run start:dev', path.join(root, 'backend'));
  }

  if (!(await portReady(FE_PORT))) {
    log('starting frontend');
    runHidden(`npm run dev`, root);
  }

  log('waiting for servers (up to 120s)');
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (await allReady()) { ready = true; break; }
    await sleep(1000);
  }

  if (!ready) {
    log('ERROR: servers did not become ready — see dwes-launch.log');
    process.exit(1);
  }

  log(`ready — opening ${APP_URL}`);
  openBrowser(APP_URL);
}

main().catch((e) => {
  log(`ERROR: ${e?.message || e}`);
  process.exit(1);
});
