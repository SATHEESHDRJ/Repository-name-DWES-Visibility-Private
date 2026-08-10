/**
 * Preflight for the DWES dev/deploy stacks: make sure the dev ports are free
 * BEFORE the servers try to bind them.
 *
 * The common failure this solves: a previous dev session's Node processes are
 * still alive (closing the terminal, or `concurrently --kill-others-on-fail`,
 * does not always reap detached grandchild `node.exe` on Windows). The stale
 * process keeps holding 5173 / 5174 / 8080 / 3001, so the next launch dies with
 * EADDRINUSE and "the server won't start".
 *
 * Instead of just aborting, this script AUTO-FREES each port by killing the
 * lingering process that owns it — but ONLY when that process is Node (our dev
 * server). Anything else holding the port (most importantly Postgres on 5432,
 * which is never in this list anyway) is left untouched and reported instead.
 *
 * Detection uses the OS listener table (netstat/Get-NetTCPConnection / lsof),
 * NOT a trial bind: on Windows a trial IPv6 bind does not collide with an
 * IPv4-only listener (e.g. the backend on 0.0.0.0:3001), so a bind test would
 * silently miss exactly the stale process we need to clear.
 *
 * Ports may be passed as CLI args; otherwise the HTTPS stack set is used:
 *   node scripts/check-dev-ports.mjs                 -> 5173 5174 8080 3001
 *   node scripts/check-dev-ports.mjs 5175 3001       -> plain-HTTP dev stack
 */
import { execFileSync } from 'node:child_process';

const LABELS = {
  5173: 'public HTTPS gateway',
  5174: 'Vite internal HTTPS',
  5175: 'Vite dev server',
  4173: 'Vite preview',
  8080: 'HTTP→HTTPS redirect',
  3001: 'backend API',
};

const DEFAULT_PORTS = [5173, 5174, 8080, 3001];

const isWin = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNode = (name) => name.toLowerCase().includes('node');
const labelFor = (port) => LABELS[port] ?? `port ${port}`;

const argPorts = process.argv
  .slice(2)
  .map((a) => Number(a))
  .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);

const PORTS = argPorts.length ? argPorts : DEFAULT_PORTS;

/**
 * One snapshot of every listener on the given ports.
 * Returns Map<port, Array<{ pid, name }>>. `name` is lower-cased image name.
 */
function snapshotListeners(ports) {
  const map = new Map(ports.map((p) => [p, []]));
  try {
    if (isWin) {
      const list = ports.join(',');
      const ps =
        `$ports = @(${list}); ` +
        `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ` +
        `Where-Object { $ports -contains $_.LocalPort } | ForEach-Object { ` +
        `$p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; ` +
        `"$($_.LocalPort) $($_.OwningProcess) $(if ($p) { $p.ProcessName } else { 'unknown' })" }`;
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', ps],
        { encoding: 'utf8', windowsHide: true },
      ).trim();
      for (const line of out ? out.split(/\r?\n/) : []) {
        const [portStr, pid, ...rest] = line.trim().split(/\s+/);
        const port = Number(portStr);
        if (!map.has(port) || !pid) continue;
        const rows = map.get(port);
        if (rows.some((r) => r.pid === pid)) continue; // dedupe v4/v6 rows
        rows.push({ pid, name: rest.join(' ').toLowerCase() });
      }
    } else {
      for (const port of ports) {
        let pids = [];
        try {
          pids = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
            encoding: 'utf8',
          })
            .split(/\s+/)
            .filter(Boolean);
        } catch { /* no listener on this port */ }
        const rows = map.get(port);
        for (const pid of pids) {
          if (rows.some((r) => r.pid === pid)) continue;
          let name = '';
          try {
            name = execFileSync('ps', ['-o', 'comm=', '-p', pid], { encoding: 'utf8' })
              .trim()
              .toLowerCase();
          } catch { /* process gone */ }
          rows.push({ pid, name });
        }
      }
    }
  } catch {
    // Query tooling failed entirely — return the empty map (best effort).
  }
  return map;
}

function killPid(pid) {
  try {
    if (isWin) {
      // /T also terminates the child tree (nest/vite spawn helpers).
      execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      execFileSync('kill', ['-9', pid], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

// ── 1. Snapshot, then reclaim Node-held ports ───────────────────────────────
const snapshot = snapshotListeners(PORTS);

const freed = [];
const blocked = [];

for (const port of PORTS) {
  const listeners = snapshot.get(port) ?? [];
  for (const l of listeners) {
    if (isNode(l.name)) {
      if (killPid(l.pid)) freed.push({ port, pid: l.pid });
    } else {
      // Never touch non-Node holders (Postgres, IIS, …).
      blocked.push({ port, pid: l.pid, name: l.name || 'unknown' });
    }
  }
}

for (const { port, pid } of freed) {
  console.log(`[ports] Freed ${port} (${labelFor(port)}) — stopped stale node PID ${pid}`);
}

// ── 2. Verify the freed ports actually released (poll up to ~3s) ─────────────
if (freed.length) {
  const freedPorts = [...new Set(freed.map((f) => f.port))];
  for (let attempt = 0; attempt < 15; attempt++) {
    const still = snapshotListeners(freedPorts);
    const busy = freedPorts.filter((p) => (still.get(p) ?? []).length > 0);
    if (busy.length === 0) break;
    await sleep(200);
  }
}

// ── 3. Final check: any port still held is fatal (better than a later crash) ─
const finalSnap = snapshotListeners(PORTS);
const stillBusy = [];
for (const port of PORTS) {
  const rows = finalSnap.get(port) ?? [];
  for (const r of rows) stillBusy.push({ port, pid: r.pid, name: r.name || 'unknown' });
}

if (stillBusy.length) {
  console.error('\n[ports] Cannot start — port(s) still in use:\n');
  for (const { port, pid, name } of stillBusy) {
    const note = isNode(name)
      ? 'node process would not stop'
      : `held by ${name} (not a DWES server — left running)`;
    console.error(`  • ${port} (${labelFor(port)}) — PID ${pid}: ${note}`);
  }
  console.error('\n  Close the process bound to the port above, then retry.\n');
  process.exit(1);
}

console.log(
  freed.length
    ? `[ports] All dev ports free (${freed.length} stale server${freed.length > 1 ? 's' : ''} cleared).`
    : '[ports] All dev ports free.',
);
