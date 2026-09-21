#!/usr/bin/env node
/**
 * One-time controlled project data reset for DWES.
 * - Full pre-operation backup + inventory snapshot
 * - pg_dump + uploads archive under backend/uploads/backups/
 * - Purge all project-scoped DB rows and upload folders
 * - Verify zero counts; users preserved
 * - Create/remove temporary smoke project
 *
 * Usage: node backend/scripts/project-data-reset.mjs [--skip-test] [--dry-run]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const backendRoot = path.join(projectRoot, 'backend');
const uploadBase = process.env.UPLOAD_DIR
  ? (path.isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : path.join(backendRoot, process.env.UPLOAD_DIR))
  : path.join(backendRoot, 'uploads');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';
const skipTest = process.argv.includes('--skip-test');
const dryRun = process.argv.includes('--dry-run');
const TEST_PROJECT_CODE = 'RESET-SMOKE-TEST';

const PROJECT_TABLES = [
  'ga_finalization_decisions',
  'ga_correlation_results',
  'ga_faces',
  'ga_asset_sets',
  'background_jobs',
  'mapping_issues',
  'cable_route_mappings',
  'terminal_geometries',
  'duct_segments',
  'duct_nodes',
  'device_geometries',
  'panel_models',
  'drawing_assets',
  'panel_inspections',
  'tech_assignments',
  'file_hashes',
  'tech_audit_log',
  'session_log',
  'projects',
];

function tsSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function listProjectFolders() {
  if (!fs.existsSync(uploadBase)) return [];
  return fs
    .readdirSync(uploadBase, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'backups')
    .map(entry => entry.name);
}

async function inventory(client) {
  const counts = { users: 0, upload_project_folders: listProjectFolders().length, ts: new Date().toISOString() };
  counts.users = (await client.query('SELECT COUNT(*)::int AS c FROM users')).rows[0].c;
  for (const table of PROJECT_TABLES) {
    counts[table] = (await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`)).rows[0].c;
  }
  return counts;
}

function runPreOperationBackup() {
  const script = path.join(projectRoot, 'scripts', 'run-pre-operation-backup.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, DWES_PROJECT_ROOT: projectRoot, DWES_BACKUP_TRIGGER: 'pre-operation' },
  });
  if (result.status !== 0 && result.status !== 2) {
    throw new Error(`Pre-operation backup failed (exit ${result.status ?? 'unknown'})`);
  }
}

function runPgDump(targetFile) {
  const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
  const pgHost = process.env.PGHOST || 'localhost';
  const pgPort = process.env.PGPORT || '5432';
  const pgUser = process.env.PGUSER || 'postgres';
  const pgPass = process.env.PGPASSWORD || 'postgres';
  const pgDb = process.env.PGDATABASE || 'WiringSchemeDB';
  const result = spawnSync(
    pgDumpExe,
    ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', targetFile, pgDb],
    { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
  );
  if (result.status !== 0) {
    const errMsg = result.stderr?.toString() || result.error?.message || 'unknown';
    throw new Error(`pg_dump failed: ${errMsg.slice(0, 300)}`);
  }
}

async function purgeProjectData(client) {
  const deleted = {};
  await client.query('BEGIN');
  try {
    for (const table of PROJECT_TABLES) {
      const result = await client.query(`DELETE FROM ${table}`);
      deleted[table] = result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return deleted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function removeUploadFolders(codes) {
  let removed = 0;
  for (const code of codes) {
    const dir = path.join(uploadBase, code);
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
  }
  return removed;
}

async function verifyZero(client) {
  const post = await inventory(client);
  const issues = [];
  if (post.users < 1) issues.push('users table is empty');
  for (const table of PROJECT_TABLES) {
    if (post[table] !== 0) issues.push(`${table}=${post[table]}`);
  }
  if (listProjectFolders().length !== 0) {
    issues.push(`upload_folders=${listProjectFolders().join(',')}`);
  }
  return { post, issues, ok: issues.length === 0 };
}

async function smokeTest(client) {
  const testDir = path.join(uploadBase, TEST_PROJECT_CODE);
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO projects (code, client, name, description, sequence, is_active, created_at, project_state, assigned_technicians)
       VALUES ($1, $2, $3, $4, 1, true, NOW(), 'not_started', '')`,
      [TEST_PROJECT_CODE, 'Smoke Client', 'Reset Smoke Test', 'Temporary verification project'],
    );
    const framesDir = path.join(testDir, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });
    fs.writeFileSync(
      path.join(framesDir, 'panel-1.json'),
      JSON.stringify({
        id: 'panel-1',
        project_code: TEST_PROJECT_CODE,
        panel_name: 'Panel 1',
        cables: [],
        cable_count: 0,
        uploaded_at: new Date().toISOString(),
        compare_status: 'none',
        original_filename: 'smoke.xlsx',
        mapping: {},
        sheet_name: 'Sheet1',
      }),
    );
    fs.mkdirSync(path.join(testDir, 'drawings'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'drawings', 'smoke.pdf'), '%PDF-1.4 smoke');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const mid = await inventory(client);
  if (mid.projects !== 1 || !fs.existsSync(testDir)) {
    throw new Error('Smoke test create failed');
  }

  await client.query('DELETE FROM projects WHERE code = $1', [TEST_PROJECT_CODE]);
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

  const after = await inventory(client);
  if (after.projects !== 0 || fs.existsSync(testDir)) {
    throw new Error('Smoke test cleanup failed');
  }
  return { created: true, cleaned: true, project_code: TEST_PROJECT_CODE };
}

async function main() {
  const report = {
    executed_at: new Date().toISOString(),
    dry_run: dryRun,
    backup_paths: {},
    inventory_before: null,
    deleted: null,
    inventory_after: null,
    verification: null,
    smoke_test: null,
    errors: [],
  };

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    report.inventory_before = await inventory(client);

    const backupRoot = path.join(projectRoot, 'Backup');
    const inventoryFile = path.join(backupRoot, `project-reset-inventory-${tsSlug()}.json`);
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.writeFileSync(inventoryFile, JSON.stringify(report.inventory_before, null, 2));
    report.backup_paths.inventory = inventoryFile;

    if (dryRun) {
      console.log(JSON.stringify({ ...report, message: 'Dry run — no data deleted' }, null, 2));
      return;
    }

    runPreOperationBackup();
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = tsSlug();
    const dumpFile = path.join(backupDir, `PROJECT_RESET_${stamp}.dump`);
    const archiveDir = path.join(backupDir, `PROJECT_RESET_${stamp}`);
    runPgDump(dumpFile);
    report.backup_paths.pg_dump = dumpFile;

    const codes = [
      ...new Set([
        ...(await client.query('SELECT code FROM projects')).rows.map(r => r.code),
        ...listProjectFolders(),
      ]),
    ];
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const code of codes) {
      const src = path.join(uploadBase, code);
      if (fs.existsSync(src)) {
        fs.cpSync(src, path.join(archiveDir, code), { recursive: true });
      }
    }
    report.backup_paths.uploads_archive = archiveDir;

    report.deleted = await purgeProjectData(client);
    report.deleted.folders_removed = removeUploadFolders(codes);

    report.verification = await verifyZero(client);
    if (!report.verification.ok) {
      throw new Error(`Verification failed: ${report.verification.issues.join('; ')}`);
    }

    if (!skipTest) {
      report.smoke_test = await smokeTest(client);
      const recheck = await verifyZero(client);
      if (!recheck.ok) throw new Error(`Post-smoke verification failed: ${recheck.issues.join('; ')}`);
      report.inventory_after = recheck.post;
    } else {
      report.inventory_after = report.verification.post;
    }

    const reportFile = path.join(backupRoot, `project-reset-report-${stamp}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    report.backup_paths.report = reportFile;

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.errors.push(error.message);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
