/**
 * benchmark-api.mjs — DWES backend API benchmark harness.
 *
 * Measures latency percentiles (and TTFB for streaming endpoints), status
 * histograms, payload sizes, and backend CPU/memory for the hot API paths:
 * login, project/panel loading, wiring-schedule preview, drawing metadata +
 * PDF streaming, report generation, uploads, and SSE connection startup.
 *
 * Usage:
 *   node scripts/benchmark-api.mjs --spawn --label express-baseline \
 *        --out docs/perf/baseline-express.json [--demo-code DEMO_PROJECT_x]
 *   node scripts/benchmark-api.mjs --compare docs/perf/baseline-express.json \
 *        docs/perf/after-fastify.json [--md docs/perf/comparison.md]
 *
 * --spawn builds nothing; it runs `node dist/main.js` from backend/ on a
 * dedicated port (default 3111) with DWES_THROTTLE_LIMIT raised so the global
 * rate limiter does not shape the measurements. The login endpoint keeps its
 * own 10/min @Throttle; the harness paces logins to stay under it.
 *
 * Credentials come from the private demo-account file via
 * scripts/demo-account-loader.mjs — never from this script or the output JSON.
 * Results contain no secrets and are safe to commit.
 */
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { loadDemoAccounts } from './demo-account-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const hasFlag = name => args.includes(`--${name}`);

const REAL_PROJECT = arg('project', '132KV33KV_KSA_RIYADH_2026_001');
const REAL_FRAME = arg('frame', 'frame_1783583225364_0_xagn2');
const DEMO_CODE = arg('demo-code');
const BENCH_PORT = Number(arg('port', '3111'));
const LABEL = arg('label', 'run');
const OUT = arg('out', `docs/perf/${LABEL}.json`);

// ── stats helpers ───────────────────────────────────────────────────────────
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
function summarize(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length,
    min: +s[0].toFixed(1), mean: +mean.toFixed(1),
    p50: +pct(s, 50).toFixed(1), p90: +pct(s, 90).toFixed(1),
    p95: +pct(s, 95).toFixed(1), p99: +pct(s, 99).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
  };
}

// ── timed fetch: total latency + TTFB (first body chunk) ───────────────────
async function timedFetch(url, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(url, opts);
  let ttfb = null, bytes = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfb === null) ttfb = performance.now() - t0;
      bytes += value.byteLength;
    }
  }
  return { ms: performance.now() - t0, ttfb: ttfb ?? performance.now() - t0, status: res.status, bytes, headers: res.headers };
}

async function runEndpoint(name, fn, { warmup = 10, iterations = 60, expect = 200, gapMs = 0 } = {}) {
  process.stdout.write(`  ${name.padEnd(28)}`);
  for (let i = 0; i < warmup; i++) await fn();
  const lat = [], ttfbs = [], statuses = {};
  let bytes = 0;
  for (let i = 0; i < iterations; i++) {
    const r = await fn();
    lat.push(r.ms); ttfbs.push(r.ttfb); bytes = r.bytes;
    statuses[r.status] = (statuses[r.status] || 0) + 1;
    if (gapMs) await new Promise(x => setTimeout(x, gapMs));
  }
  const bad = Object.keys(statuses).some(s => Number(s) !== expect);
  const out = { latencyMs: summarize(lat), ttfbMs: summarize(ttfbs), statuses, lastBytes: bytes, expect, ok: !bad };
  console.log(`p50 ${out.latencyMs.p50}ms  p95 ${out.latencyMs.p95}ms  (${iterations}x, ${bytes}B)${bad ? '  !! ' + JSON.stringify(statuses) : ''}`);
  return out;
}

async function runBurst(name, fn, { concurrency = 10, rounds = 5 } = {}) {
  process.stdout.write(`  ${name.padEnd(28)}`);
  const lat = []; const statuses = {};
  for (let r = 0; r < rounds; r++) {
    const results = await Promise.all(Array.from({ length: concurrency }, () => fn()));
    for (const res of results) { lat.push(res.ms); statuses[res.status] = (statuses[res.status] || 0) + 1; }
  }
  const out = { latencyMs: summarize(lat), statuses, concurrency, rounds };
  console.log(`burst p50 ${out.latencyMs.p50}ms  p95 ${out.latencyMs.p95}ms  (${concurrency}x${rounds})`);
  return out;
}

// ── synthetic payloads (generated in-memory, never committed) ───────────────
import { createRequire } from 'node:module';
const requireBackend = createRequire(path.join(backendDir, 'package.json'));
function syntheticXlsx(rowCount) {
  const XLSX = requireBackend('xlsx');
  const header = ['CABLE NUMBER', 'FROM', 'TO', 'SRC TERMINAL', 'DST TERMINAL', 'WIRE TYPE', 'COLOR', 'LENGTH(m)'];
  const rows = [header];
  for (let i = 1; i <= rowCount; i++) {
    rows.push([`W${String(i).padStart(4, '0')}`, `=X${i}:A`, `=Y${i}:B`, `${i}a`, `${i}b`, 'H07V-K 1.5', i % 2 ? 'GREEN' : 'YELLOW', (i % 40) + 1]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'WRING_FRAME');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
function syntheticPdf(totalBytes) {
  const head = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n', 'ascii');
  const tail = Buffer.from('\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'ascii');
  const pad = Buffer.alloc(Math.max(0, totalBytes - head.length - tail.length - 12), 0x20);
  return Buffer.concat([head, Buffer.from('%'), pad, Buffer.from('\n'), tail]);
}
function multipart(fields, fileField, filename, contentType, buffer) {
  const boundary = '----dwesbench' + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  parts.push(buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ── backend process management (--spawn) ────────────────────────────────────
async function waitForHealth(base, timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return;
    } catch { /* keep waiting */ }
    if (Date.now() - t0 > timeoutMs) throw new Error('backend did not become healthy in time');
    await new Promise(x => setTimeout(x, 750));
  }
}

function sampleProcess(pid) {
  return new Promise(resolve => {
    execFile('powershell', ['-NoProfile', '-Command',
      `Get-Process -Id ${pid} | Select-Object @{n='cpu';e={$_.TotalProcessorTime.TotalSeconds}},WorkingSet64 | ConvertTo-Json`],
      { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null);
        try { const j = JSON.parse(stdout); resolve({ cpu: j.cpu, ws: j.WorkingSet64 }); } catch { resolve(null); }
      });
  });
}

// ── comparison mode ─────────────────────────────────────────────────────────
if (hasFlag('compare')) {
  const i = args.indexOf('--compare');
  const a = JSON.parse(fs.readFileSync(path.resolve(root, args[i + 1]), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.resolve(root, args[i + 2]), 'utf8'));
  const names = [...new Set([...Object.keys(a.endpoints), ...Object.keys(b.endpoints)])];
  const rows = [['endpoint', `${a.label} p50`, `${b.label} p50`, 'Δp50', `${a.label} p95`, `${b.label} p95`, 'Δp95']];
  for (const n of names) {
    const ea = a.endpoints[n]?.latencyMs, eb = b.endpoints[n]?.latencyMs;
    if (!ea || !eb) { rows.push([n, ea?.p50 ?? '—', eb?.p50 ?? '—', '—', ea?.p95 ?? '—', eb?.p95 ?? '—', '—']); continue; }
    const d = (x, y) => `${y <= x ? '' : '+'}${(((y - x) / x) * 100).toFixed(0)}%`;
    rows.push([n, ea.p50, eb.p50, d(ea.p50, eb.p50), ea.p95, eb.p95, d(ea.p95, eb.p95)]);
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map(r => String(r[c]).length)));
  const line = r => '| ' + r.map((v, c) => String(v).padEnd(widths[c])).join(' | ') + ' |';
  const md = [line(rows[0]), '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|', ...rows.slice(1).map(line)].join('\n');
  console.log(md);
  const cpuA = a.resources?.cpuSeconds, cpuB = b.resources?.cpuSeconds;
  const memA = a.resources?.workingSetPeakMB, memB = b.resources?.workingSetPeakMB;
  const resLine = `\nResources: CPU ${cpuA ?? '—'}s → ${cpuB ?? '—'}s; peak RSS ${memA ?? '—'}MB → ${memB ?? '—'}MB`;
  console.log(resLine);
  const mdOut = arg('md');
  if (mdOut) {
    const doc = `# DWES API benchmark comparison\n\n- **A:** ${a.label} (${a.timestamp}, ${a.git?.commit ?? '?'})\n- **B:** ${b.label} (${b.timestamp}, ${b.git?.commit ?? '?'})\n- Same-data fingerprints match: **${JSON.stringify(a.fingerprint) === JSON.stringify(b.fingerprint)}**\n\nLatencies in ms.\n\n${md}\n${resLine}\n`;
    fs.writeFileSync(path.resolve(root, mdOut), doc);
    console.log(`written ${mdOut}`);
  }
  if (JSON.stringify(a.fingerprint) !== JSON.stringify(b.fingerprint)) {
    console.error('\nWARNING: dataset fingerprints differ — comparison is not like-for-like.');
    process.exitCode = 2;
  }
  process.exit();
}

// ── main benchmark run ──────────────────────────────────────────────────────
const BASE = arg('base', `http://127.0.0.1:${BENCH_PORT}`);
let child = null;
let portFileBackup = null;
const portFile = path.join(backendDir, '.dwes-port');

async function main() {
  if (hasFlag('spawn')) {
    if (fs.existsSync(portFile)) portFileBackup = fs.readFileSync(portFile);
    console.log(`Spawning backend (node dist/main.js) on :${BENCH_PORT} ...`);
    child = spawn(process.execPath, ['dist/main.js'], {
      cwd: backendDir,
      env: { ...process.env, PORT: String(BENCH_PORT), DWES_THROTTLE_LIMIT: '100000' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const log = fs.createWriteStream(path.join(root, 'logs', `bench-backend-${LABEL}.log`), { flags: 'w' });
    child.stdout.pipe(log); child.stderr.pipe(log);
    await waitForHealth(BASE);
    console.log('Backend healthy.');
  }

  // Resource sampler (only meaningful with --spawn; otherwise pass --pid)
  const pid = child?.pid ?? (arg('pid') ? Number(arg('pid')) : null);
  const resourceSamples = [];
  const sampler = pid ? setInterval(async () => {
    const s = await sampleProcess(pid);
    if (s) resourceSamples.push(s);
  }, 2000) : null;

  // ── logins (paced: login endpoint keeps its own 10/min throttle) ──────────
  console.log('\nLogin benchmark + role tokens (paced under the 10/min login throttle):');
  const loginOnce = async creds => {
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    });
    const body = await res.json().catch(() => null);
    return { ms: performance.now() - t0, ttfb: performance.now() - t0, status: res.status, bytes: 0, token: body?.access_token };
  };
  // Accounts in the private file may be disabled — take the first of each role
  // that actually logs in. Every attempt spends login-throttle budget, so the
  // measured-login loop is sized to leave room for up to 4 token attempts.
  const accountsByRole = role => loadDemoAccounts().filter(a => a.role === role);
  const loginRole = async role => {
    for (const account of accountsByRole(role)) {
      const r = await loginOnce(account);
      if (r.token) return r.token;
    }
    throw new Error(`no usable ${role} account (all disabled or throttled)`);
  };
  const sup = accountsByRole('prod_supervisor')[0];

  const endpoints = {};
  {
    const lat = [], statuses = {};
    for (let i = 0; i < 5; i++) {
      const r = await loginOnce(sup);
      lat.push(r.ms); statuses[r.status] = (statuses[r.status] || 0) + 1;
      await new Promise(x => setTimeout(x, 400));
    }
    endpoints['auth-login'] = { latencyMs: summarize(lat), ttfbMs: summarize(lat), statuses, expect: 200, ok: !statuses[429] };
    console.log(`  auth-login                  p50 ${endpoints['auth-login'].latencyMs.p50}ms  p95 ${endpoints['auth-login'].latencyMs.p95}ms  (5x paced)`);
  }
  const supToken = await loginRole('prod_supervisor');
  const techToken = await loginRole('wiring_technician');
  const dirToken = await loginRole('ops_director');
  const H = t => ({ Authorization: `Bearer ${t}` });
  const P = encodeURIComponent(REAL_PROJECT);

  // ── read endpoints (real data, read-only) ─────────────────────────────────
  console.log('\nRead endpoints (real project, read-only):');
  const get = (url, token) => () => timedFetch(`${BASE}${url}`, { headers: H(token) });
  endpoints['health'] = await runEndpoint('health', get('/api/health', supToken), { iterations: 100 });
  endpoints['projects-list'] = await runEndpoint('projects-list', get('/api/projects', supToken), { iterations: 100 });
  endpoints['frames-list'] = await runEndpoint('frames-list', get(`/api/projects/${P}/frames`, supToken), { iterations: 100 });
  endpoints['schedule-preview'] = await runEndpoint('schedule-preview', get(`/api/projects/${P}/frames/${REAL_FRAME}/verify-data`, supToken), { iterations: 60 });
  endpoints['drawing-meta'] = await runEndpoint('drawing-meta', get(`/api/projects/${P}/frames/${REAL_FRAME}/drawing`, supToken), { iterations: 60 });

  // Drawing id discovered live (register endpoint list stays generic)
  const drawings = await (await fetch(`${BASE}/api/projects/${P}/drawings`, { headers: H(supToken) })).json();
  const drawingId = drawings?.[0]?.id;
  if (drawingId) {
    endpoints['drawing-file-pdf'] = await runEndpoint('drawing-file-pdf', get(`/api/projects/${P}/drawings/${drawingId}/file`, supToken), { warmup: 3, iterations: 25 });
  }
  endpoints['report-pdf'] = await runEndpoint('report-pdf', get(`/api/projects/${P}/frames/${REAL_FRAME}/report-pdf`, supToken), { warmup: 2, iterations: 12 });
  endpoints['panel-report-xlsx'] = await runEndpoint('panel-report-xlsx', get(`/api/supervisor/panel-report/${P}/${REAL_FRAME}/xlsx`, supToken), { warmup: 2, iterations: 12 });
  endpoints['supervisor-all-panels'] = await runEndpoint('supervisor-all-panels', get('/api/supervisor/all-panels', supToken), { iterations: 60 });
  endpoints['tech-my-panels'] = await runEndpoint('tech-my-panels', get('/api/tech/my-panels', techToken), { iterations: 60 });
  endpoints['director-stats'] = await runEndpoint('director-stats', get('/api/director/stats', dirToken), { iterations: 60 });
  endpoints['director-projects'] = await runEndpoint('director-projects', get('/api/director/projects', dirToken), { iterations: 60 });

  // ── SSE: time to first heartbeat frame ────────────────────────────────────
  console.log('\nSSE stream startup:');
  const sseOnce = async () => {
    const ctrl = new AbortController();
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/events/stream`, {
      headers: { ...H(supToken), Accept: 'text/event-stream' }, signal: ctrl.signal,
    });
    let ttfb = performance.now() - t0;
    if (res.body) {
      const reader = res.body.getReader();
      const { value } = await reader.read();
      ttfb = performance.now() - t0;
      ctrl.abort();
      void value;
    }
    return { ms: ttfb, ttfb, status: res.status, bytes: 0 };
  };
  endpoints['sse-first-frame'] = await runEndpoint('sse-first-frame', sseOnce, { warmup: 2, iterations: 15 });

  // ── uploads (parse-only endpoint; no project data written) ───────────────
  console.log('\nUploads:');
  const smallXlsx = syntheticXlsx(50);
  const bigXlsx = syntheticXlsx(5000);
  const uploadTo = (url, fields, filename, type, buf, token) => () => {
    const m = multipart(fields, 'file', filename, type, buf);
    return timedFetch(`${BASE}${url}`, { method: 'POST', headers: { ...H(token), 'Content-Type': m.contentType }, body: m.body });
  };
  endpoints['upload-extract-meta-small'] = await runEndpoint('upload-extract-meta-small',
    uploadTo('/api/upload/extract-metadata', {}, 'bench-small.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', smallXlsx, supToken),
    { warmup: 3, iterations: 20, expect: 201 });
  endpoints['upload-extract-meta-large'] = await runEndpoint('upload-extract-meta-large',
    uploadTo('/api/upload/extract-metadata', {}, 'bench-large.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bigXlsx, supToken),
    { warmup: 1, iterations: 8, expect: 201 });

  if (DEMO_CODE) {
    const pdf5 = syntheticPdf(5 * 1024 * 1024);
    endpoints['upload-drawing-5mb'] = await runEndpoint('upload-drawing-5mb',
      uploadTo(`/api/upload/drawing/${encodeURIComponent(DEMO_CODE)}`, {}, `bench-${Date.now()}.pdf`, 'application/pdf', pdf5, supToken),
      { warmup: 0, iterations: 5, expect: 201 });
  } else {
    console.log('  upload-drawing-5mb          skipped (no --demo-code)');
  }

  // ── concurrency bursts ────────────────────────────────────────────────────
  console.log('\nConcurrency bursts (10-way):');
  endpoints['burst-projects'] = await runBurst('burst-projects', get('/api/projects', supToken));
  endpoints['burst-schedule'] = await runBurst('burst-schedule', get(`/api/projects/${P}/frames/${REAL_FRAME}/verify-data`, supToken));
  if (drawingId) {
    endpoints['burst-drawing-pdf'] = await runBurst('burst-drawing-pdf', get(`/api/projects/${P}/drawings/${drawingId}/file`, supToken), { concurrency: 5, rounds: 3 });
  }

  // ── dataset fingerprint (read-only; demo project excluded by design) ──────
  const frames = await (await fetch(`${BASE}/api/projects/${P}/frames`, { headers: H(supToken) })).json();
  const vd = await (await fetch(`${BASE}/api/projects/${P}/frames/${REAL_FRAME}/verify-data`, { headers: H(supToken) })).json();
  const fingerprint = {
    project: REAL_PROJECT,
    frames: frames.length,
    cables: vd.cable_count ?? vd.cables?.length,
    drawings: drawings?.length ?? 0,
    drawingBytes: endpoints['drawing-file-pdf']?.lastBytes ?? null,
  };

  if (sampler) clearInterval(sampler);
  const resources = resourceSamples.length >= 2 ? {
    cpuSeconds: +(resourceSamples.at(-1).cpu - resourceSamples[0].cpu).toFixed(1),
    workingSetPeakMB: +(Math.max(...resourceSamples.map(s => s.ws)) / 1048576).toFixed(0),
    workingSetMeanMB: +((resourceSamples.reduce((a, s) => a + s.ws, 0) / resourceSamples.length) / 1048576).toFixed(0),
    samples: resourceSamples.length,
  } : null;

  const result = {
    label: LABEL,
    timestamp: new Date().toISOString(),
    base: BASE,
    node: process.version,
    git: {
      branch: execSync('git branch --show-current', { cwd: root }).toString().trim(),
      commit: execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(),
    },
    throttle: { global: 100000, loginPerMin: 10 },
    fingerprint,
    resources,
    endpoints,
  };
  const outPath = path.resolve(root, OUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nSaved ${OUT}`);
  const failed = Object.entries(endpoints).filter(([, e]) => e.ok === false);
  if (failed.length) {
    console.error(`WARNING: unexpected statuses on: ${failed.map(([n]) => n).join(', ')}`);
    process.exitCode = 1;
  }
}

function cleanup() {
  if (child && !child.killed) { try { child.kill(); } catch { /* already gone */ } }
  if (portFileBackup) { try { fs.writeFileSync(portFile, portFileBackup); } catch { /* best effort */ } }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

await main().finally(cleanup);
