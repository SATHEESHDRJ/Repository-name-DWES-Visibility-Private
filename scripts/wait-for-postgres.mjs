/**
 * Wait until PostgreSQL accepts connections AND answers a trivial query.
 * Used by launch-dwes.mjs before Nest bootstrap (TCP :5432 alone is not enough).
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(pathToFileURL(path.join(root, 'backend', 'package.json')));

const DEFAULT_URL = 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();

  const envPath = path.join(root, 'backend', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^DATABASE_URL\s*=\s*("?)(.+?)\1\s*$/);
      if (m) return m[2].trim();
    }
  }
  return DEFAULT_URL;
}

function parseHostPort(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/, 'http:'));
    return {
      host: u.hostname || '127.0.0.1',
      port: Number(u.port) || 5432,
      database: u.pathname?.replace(/^\//, '') || 'WiringSchemeDB',
    };
  } catch {
    return { host: '127.0.0.1', port: 5432, database: 'WiringSchemeDB' };
  }
}

function tcpReady(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

async function queryReady(connectionString) {
  let pg;
  try {
    pg = require('pg');
  } catch {
    return { ok: false, error: 'pg module not found — run npm install in backend/' };
  }

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    await client.query('SELECT 1 AS ok');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try { await client.end(); } catch { /* ok */ }
  }
}

/**
 * @param {object} opts
 * @param {number} [opts.maxSecs=120]
 * @param {(msg: string) => void} [opts.onLog]
 * @returns {Promise<{ ok: boolean, waitedSecs: number, database: string }>}
 */
export async function waitForPostgres(opts = {}) {
  const maxSecs = opts.maxSecs ?? 120;
  const onLog = opts.onLog ?? (() => {});
  const connectionString = loadDatabaseUrl();
  const { host, port, database } = parseHostPort(connectionString);

  onLog(`PostgreSQL wait begin — host=${host} port=${port} db=${database} (up to ${maxSecs}s)`);

  for (let i = 0; i < maxSecs; i += 1) {
    if (!(await tcpReady(host, port))) {
      if (i === 0 || i % 15 === 0) onLog(`PostgreSQL TCP :${port} not open yet (${i}s)`);
      await sleep(1000);
      continue;
    }

    const q = await queryReady(connectionString);
    if (q.ok) {
      onLog(`PostgreSQL ready — accepting queries on ${database} (after ${i}s)`);
      return { ok: true, waitedSecs: i, database };
    }

    if (i === 0 || i % 10 === 0) {
      onLog(`PostgreSQL TCP up but query failed (${i}s): ${q.error}`);
    }
    await sleep(1000);
  }

  onLog(`PostgreSQL NOT ready after ${maxSecs}s — Nest will likely fail`);
  return { ok: false, waitedSecs: maxSecs, database };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const maxSecs = Number(process.argv[2]) || 120;
  waitForPostgres({
    maxSecs,
    onLog: (msg) => console.log(`[postgres] ${msg}`),
  }).then((r) => process.exit(r.ok ? 0 : 1));
}
