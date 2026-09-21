/**
 * Durable stack readiness probe for the OCI local restore.
 *
 * IMPORTANT: Nest API health is GET /api/health — never bare /health (404 = false negative).
 * Drawing/OCR correctly uses /health on :8092.
 *
 * Redis-absent / degraded:true is PASS with a note (expected on this restore).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FE = process.env.DWES_FE || 'http://127.0.0.1:5280/';
/** Correct Nest health path — do not use /health on the API port. */
const API_HEALTH = process.env.DWES_API_HEALTH || 'http://127.0.0.1:3101/api/health';
const OCR_HEALTH = process.env.DWES_OCR_HEALTH || 'http://127.0.0.1:8092/health';
const PG_CONTAINER =
  process.env.DWES_PG_CONTAINER || 'dwes_oci_restore_postgres_20260725_082028';
const API_CONTAINER =
  process.env.DWES_API_CONTAINER || 'dwes_oci_restore_api_20260725_082028';
const MAX_ATTEMPTS = Number(process.env.DWES_READY_ATTEMPTS || 20);
const DELAY_MS = Number(process.env.DWES_READY_DELAY_MS || 2000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT =
  process.env.HEALTH_OUT ||
  path.join(ROOT, 'backend', 'tmp_health_readiness.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function fetchStatus(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

function pgReady() {
  try {
    const out = execFileSync(
      'docker',
      ['exec', PG_CONTAINER, 'pg_isready', '-U', 'postgres'],
      { encoding: 'utf8', timeout: 8000 },
    );
    return { ok: /accepting/i.test(out), detail: out.trim() };
  } catch (err) {
    return {
      ok: false,
      detail: String(err?.stderr || err?.message || err).trim().slice(0, 300),
    };
  }
}

function apiEnvHonesty() {
  try {
    const out = execFileSync(
      'docker',
      ['exec', API_CONTAINER, 'printenv'],
      { encoding: 'utf8', timeout: 8000 },
    );
    const map = {};
    for (const line of out.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
    }
    return {
      DEMO_MODE: map.DEMO_MODE ?? null,
      DWES_LIVE_TB_BASELINE: map.DWES_LIVE_TB_BASELINE ?? null,
      LOCATEANYTHING_REQUIRED: map.LOCATEANYTHING_REQUIRED ?? null,
    };
  } catch (err) {
    return { error: String(err?.message || err).slice(0, 200) };
  }
}

function apiStatusOk(body) {
  return body && typeof body === 'object' && body.status === 'ok';
}

async function main() {
  const attempts = [];
  let ready = false;
  let last = null;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const fe = await fetchStatus(FE);
    const api = await fetchJson(API_HEALTH);
    const ocr = await fetchJson(OCR_HEALTH);
    const pg = pgReady();

    const apiOk = api.ok && apiStatusOk(api.body);
    const feOk = fe.ok && fe.status === 200;
    const ocrOk = ocr.ok && ocr.status === 200;
    const pgOk = pg.ok;

    const sample = {
      attempt: i,
      fe: { ok: feOk, status: fe.status },
      api: {
        url: API_HEALTH,
        ok: apiOk,
        status: api.status,
        statusField: api.body?.status ?? null,
        degraded: api.body?.degraded ?? null,
        redisConfigured: api.body?.cache?.redisConfigured ?? api.body?.queue?.redisConfigured ?? null,
        sseMode: api.body?.sse_events?.mode ?? null,
      },
      ocr: { ok: ocrOk, status: ocr.status },
      pg: { ok: pgOk, detail: pg.detail },
    };
    attempts.push(sample);
    last = sample;

    console.log(
      `attempt=${i} fe=${feOk ? fe.status : 'FAIL'} api=${apiOk ? 'ok' : 'FAIL'} pg=${pgOk ? 'accepting' : 'FAIL'} ocr=${ocrOk ? ocr.status : 'FAIL'}`,
    );

    if (feOk && apiOk && ocrOk && pgOk) {
      ready = true;
      console.log('READY');
      break;
    }
    if (i < MAX_ATTEMPTS) await sleep(DELAY_MS);
  }

  const env = apiEnvHonesty();
  const degradedNote =
    last?.api?.degraded === true || last?.api?.redisConfigured === false
      ? 'Redis-unconfigured / degraded:true is expected PASS on this restore (SSE via Postgres).'
      : null;

  const report = {
    ready,
    fe: FE,
    apiHealth: API_HEALTH,
    ocrHealth: OCR_HEALTH,
    note:
      'API must be probed at /api/health. Bare /health on :3101 returns 404 (false negative). OCR correctly uses /health.',
    degradedNote,
    env,
    last,
    attempts,
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ready, out: OUT, env, degradedNote }, null, 2));

  if (!ready) {
    console.error('NOT READY after bounded retries');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
