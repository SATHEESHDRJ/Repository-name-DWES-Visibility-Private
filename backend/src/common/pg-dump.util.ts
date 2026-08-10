import { spawnSync } from 'child_process';

export type PgDumpConnection = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

export type PgDumpRunResult =
  | { ok: true; dumpPath: string }
  | { ok: false; error: string };

/** Resolve pg_dump executable (Windows dev vs Linux/OCI container). Override with PG_DUMP_PATH. */
export function resolvePgDumpExecutable(): string {
  if (process.env.PG_DUMP_PATH?.trim()) return process.env.PG_DUMP_PATH.trim();
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
  }
  return 'pg_dump';
}

/** Connection params for pg_dump (Docker Compose: host postgres). */
export function resolvePgDumpConnection(): PgDumpConnection {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || 'localhost',
        port: parsed.port || '5432',
        user: decodeURIComponent(parsed.username || 'postgres'),
        password: decodeURIComponent(parsed.password || ''),
        database: (parsed.pathname || '/WiringSchemeDB').replace(/^\//, '') || 'WiringSchemeDB',
      };
    } catch {
      /* fall through */
    }
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || '5432',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'WiringSchemeDB',
  };
}

export function runPgDumpCustomFormat(dumpFile: string): PgDumpRunResult {
  const pgDumpExe = resolvePgDumpExecutable();
  const conn = resolvePgDumpConnection();
  const dumpResult = spawnSync(
    pgDumpExe,
    ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-F', 'c', '-f', dumpFile, conn.database],
    {
      env: { ...process.env, PGPASSWORD: conn.password },
      timeout: 120_000,
    },
  );
  if (dumpResult.status !== 0) {
    const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
    return { ok: false, error: errMsg.slice(0, 500) };
  }
  return { ok: true, dumpPath: dumpFile };
}

export function pgDumpFailureDetail(result: PgDumpRunResult, maxLen = 300): string {
  if ('error' in result) return result.error.slice(0, maxLen);
  return '';
}