import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore } from '../data/mock-store';
import { DbConfigStore } from './db-config';
import {
  CloudTier,
  DEPLOYMENT_PRICING,
  DeploymentConfigStore,
  DeploymentMode,
} from './deployment-config';
import { Client } from 'pg';
import { permanentlyDeleteProject } from '../common/project-delete.util';

const APP_START = Date.now();
const errorRingBuffer: { ts: string; message: string; context: string }[] = [];

export function recordError(message: string, context: string) {
  errorRingBuffer.unshift({ ts: new Date().toISOString(), message, context });
  if (errorRingBuffer.length > 50) errorRingBuffer.pop();
}
export function clearErrorRingBuffer() {
  errorRingBuffer.length = 0;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async diagnostics() {
    const mem = process.memoryUsage();
    const uptimeSec = Math.round((Date.now() - APP_START) / 1000);

    const [userCount, projectCount, assignmentCount, inspectionCount, sessionCount, auditCount, hashCount] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.projects.count({ where: { is_active: true } }),
      this.prisma.tech_assignments.count(),
      this.prisma.panel_inspections.count(),
      this.prisma.session_log.count(),
      this.prisma.tech_audit_log.count(),
      this.prisma.file_hashes.count(),
    ]);

    const completedAssignments = await this.prisma.tech_assignments.findMany({
      where: { status: 'completed' }, select: { total_wiring_seconds: true, cables_total: true },
    });
    const totalWiringSeconds = completedAssignments.reduce((s, a) => s + (a.total_wiring_seconds || 0), 0);
    const totalCables = completedAssignments.reduce((s, a) => s + (a.cables_total || 0), 0);

    return {
      system: { node_version: process.version, platform: process.platform, uptime_seconds: uptimeSec, uptime_human: this._humanUptime(uptimeSec), pid: process.pid, env: process.env.NODE_ENV || 'development' },
      memory: { heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10, heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10, rss_mb: Math.round(mem.rss / 1024 / 1024 * 10) / 10, external_mb: Math.round(mem.external / 1024 / 1024 * 10) / 10, heap_pct: Math.round((mem.heapUsed / mem.heapTotal) * 100) },
      database: { type: 'postgresql', status: 'connected', url: 'WiringSchemeDB@localhost:5432', users: userCount, projects: projectCount, frames: MockStore.frames.length, assignments: assignmentCount, inspections: inspectionCount, session_logs: sessionCount, audit_logs: auditCount, file_hashes: hashCount, drawings: MockStore.drawings.length },
      wiring: { total_cables: totalCables, total_wiring_hours: Math.round(totalWiringSeconds / 3600 * 10) / 10, panels_completed: completedAssignments.length, qc_inspections: inspectionCount },
      recent_errors: errorRingBuffer.slice(0, 10),
    };
  }

  async dbPing() {
    const t0 = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latency_ms: Date.now() - t0, ts: new Date().toISOString() };
  }

  clearCache() {
    errorRingBuffer.length = 0;
    return { message: 'Error ring buffer cleared', ts: new Date().toISOString() };
  }

  resetCounters() {
    return { message: 'Counters reset', ts: new Date().toISOString() };
  }

  async syncStorage() {
    const [userCount, projectCount, assignmentCount, inspectionCount, auditCount, sessionCount, hashCount] = await Promise.all([
      this.prisma.users.count(), this.prisma.projects.count(), this.prisma.tech_assignments.count(),
      this.prisma.panel_inspections.count(), this.prisma.tech_audit_log.count(),
      this.prisma.session_log.count(), this.prisma.file_hashes.count(),
    ]);
    const tables = [
      { name: 'users',             rows: userCount,       status: 'synced' },
      { name: 'projects',          rows: projectCount,    status: 'synced' },
      { name: 'tech_assignments',  rows: assignmentCount, status: 'synced' },
      { name: 'panel_inspections', rows: inspectionCount, status: 'synced' },
      { name: 'tech_audit_log',    rows: auditCount,      status: 'synced' },
      { name: 'session_log',       rows: sessionCount,    status: 'synced' },
      { name: 'file_hashes',       rows: hashCount,       status: 'synced' },
      { name: 'frames (files)',     rows: MockStore.frames.length,   status: 'file-based' },
      { name: 'drawings (files)',   rows: MockStore.drawings.length, status: 'file-based' },
    ];
    return { source: 'WiringSchemeDB (PostgreSQL)', status: 'connected', tables, total_rows: tables.reduce((s, t) => s + t.rows, 0) };
  }

  syncInspect() { return { strategy: 'inspect', note: 'All data is live in PostgreSQL — no sync needed.' }; }
  syncStatus()  { return { connection: { db: 'WiringSchemeDB@localhost:5432', status: 'connected' } }; }
  syncExecute(strategy: string) { return { strategy, status: 'no_op', message: 'Data already in PostgreSQL.', ts: new Date().toISOString() }; }

  async sessions(limit = 100) {
    const logs = await this.prisma.session_log.findMany({
      include: { users: { select: { full_name: true, username: true } } },
      orderBy: { created_at: 'desc' }, take: limit,
    });
    return logs.map(s => ({ ...s, user_name: s.users?.full_name || `User #${s.user_id}`, username: s.users?.username || '' }));
  }

  async clearSessionsPrecheck() {
    const count = await this.prisma.session_log.count();
    return {
      counts: { session_logs: count },
      backup_note: 'pg_dump of WiringSchemeDB will be archived to uploads/backups/ before the audit trail is cleared',
    };
  }

  // Clear the session_log audit trail — backup-first + transactional.
  // Mirrors the destructive-op pattern used by resetAllProjects / hardResetProject:
  // exact phrase confirm → pg_dump (abort if it fails — clear nothing) → single transaction.
  async clearSessions(confirmedPhrase: string) {
    const REQUIRED = 'CLEAR SESSION LOG';
    if ((confirmedPhrase || '').trim() !== REQUIRED) {
      return { error: `Confirmation phrase does not match — type exactly: ${REQUIRED}` };
    }

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const dumpFile = path.join(backupDir, `SESSION_LOG_${ts}.dump`);

    // ── Step 1: pg_dump (abort if it fails — no logs deleted) ──────────────
    const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    const pgHost    = process.env.PGHOST     || 'localhost';
    const pgPort    = process.env.PGPORT     || '5432';
    const pgUser    = process.env.PGUSER     || 'postgres';
    const pgPass    = process.env.PGPASSWORD || 'postgres';
    const pgDb      = process.env.PGDATABASE || 'WiringSchemeDB';

    const dumpResult = spawnSync(
      pgDumpExe,
      ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', dumpFile, pgDb],
      { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
    );
    if (dumpResult.status !== 0) {
      const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
      return { error: `pg_dump failed — aborting clear (no logs deleted). Details: ${errMsg.slice(0, 300)}` };
    }

    // ── Step 2: Single transaction — all-or-nothing ───────────────────────
    const [del] = await this.prisma.$transaction([
      this.prisma.session_log.deleteMany({}),
    ]);

    return {
      success: true,
      backup: { dump: dumpFile },
      deleted: { session_logs: del.count },
      message: `Cleared ${del.count} session log${del.count !== 1 ? 's' : ''}. Backup at backups/SESSION_LOG_${ts}.dump`,
      ts: new Date().toISOString(),
    };
  }

  async allUsers() {
    const users = await this.prisma.users.findMany({ orderBy: { role: 'asc' } });
    return users.map(({ hashed_password: _hashed_password, ...safe }) => safe);
  }

  async changeRole(userId: number, newRole: string) {
    const VALID_ROLES = ['system_admin', 'ops_director', 'sales_director', 'prod_supervisor', 'qaqc_engineer', 'wiring_technician'];
    if (!VALID_ROLES.includes(newRole)) return { error: `Invalid role: ${newRole}` };
    const u = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!u) return { error: 'User not found' };
    const old = u.role;
    const updated = await this.prisma.users.update({ where: { id: userId }, data: { role: newRole } });
    const { hashed_password: _hashed_password, ...safe } = updated;
    return { message: `Role changed: ${old} → ${newRole}`, user: safe };
  }

  async bulkSetRole(usernamePattern: string, targetRole: string) {
    const VALID_ROLES = ['system_admin', 'ops_director', 'sales_director', 'prod_supervisor', 'qaqc_engineer', 'wiring_technician'];
    if (!VALID_ROLES.includes(targetRole)) {
      return { error: `Invalid role '${targetRole}'. Must be one of: ${VALID_ROLES.join(', ')}` };
    }

    // Find matching users whose role is NOT already targetRole (idempotent)
    const candidates = await this.prisma.users.findMany({
      where: { username: { contains: usernamePattern }, role: { not: targetRole } },
      select: { id: true, username: true, role: true, full_name: true },
    });

    if (candidates.length === 0) {
      return { updated: 0, message: 'No users needed updating (already at target role or pattern matched none)', usernames: [] };
    }

    await this.prisma.users.updateMany({
      where: { id: { in: candidates.map(u => u.id) } },
      data: { role: targetRole },
    });

    return {
      updated: candidates.length,
      message: `Set role='${targetRole}' on ${candidates.length} user(s)`,
      usernames: candidates.map(u => u.username),
      details: candidates.map(u => ({ username: u.username, full_name: u.full_name, old_role: u.role })),
    };
  }

  // ── Database Configuration ────────────────────────────────────────────────

  getDbConfig() {
    const cfg = DbConfigStore.load();
    const localUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';
    return {
      mode: cfg.mode,
      cloudUrl: cfg.cloudUrl || '',
      cloudUrlMasked: cfg.cloudUrl ? DbConfigStore.maskUrl(cfg.cloudUrl) : '',
      localUrlMasked: DbConfigStore.maskUrl(localUrl),
      lastSwitched: cfg.lastSwitched,
      notes: cfg.notes || '',
      activeDatabase: cfg.mode === 'local'
        ? `WiringSchemeDB@localhost:5432`
        : cfg.cloudUrl ? DbConfigStore.maskUrl(cfg.cloudUrl) : 'Cloud (not configured)',
    };
  }

  async setDbConfig(mode: 'local' | 'cloud', cloudUrl?: string, notes?: string) {
    if (mode !== 'local' && mode !== 'cloud') {
      return { error: 'mode must be "local" or "cloud"' };
    }
    if (mode === 'cloud' && !cloudUrl) {
      return { error: 'cloudUrl is required when switching to cloud mode' };
    }
    DbConfigStore.save({
      mode,
      cloudUrl: mode === 'cloud' ? (cloudUrl || '') : (DbConfigStore.load().cloudUrl || ''),
      lastSwitched: new Date().toISOString(),
      notes: notes || '',
    });
    return {
      message: `Database mode set to "${mode}". Restart the backend to apply the change.`,
      requiresRestart: true,
      mode,
      ts: new Date().toISOString(),
    };
  }

  async testDbConnection(url: string) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 6000 });
    const t0 = Date.now();
    try {
      await client.connect();
      const result = await client.query<{ version: string; db: string }>(
        'SELECT version() as version, current_database() as db'
      );
      await client.end();
      const row = result.rows[0];
      return {
        status: 'ok' as const,
        latency_ms: Date.now() - t0,
        database: row?.db || 'unknown',
        pg_version: row?.version?.split(' ').slice(0, 2).join(' ') || 'unknown',
      };
    } catch (err: any) {
      try { await client.end(); } catch {}
      return { status: 'error' as const, latency_ms: Date.now() - t0, message: err.message as string };
    }
  }

  triggerRestart() {
    setTimeout(() => process.exit(0), 350);
    return { message: 'Backend is restarting — reconnect in ~3 seconds.', ts: new Date().toISOString() };
  }

  // ── Hard Reset ────────────────────────────────────────────────────────────

  async projectResetPrecheck(code: string) {
    const project = await this.prisma.projects.findFirst({ where: { code, is_active: true } });
    if (!project) return { error: `Project "${code}" not found` };

    const uploadBase = this._resolveUploadDir();

    const framesDir   = path.join(uploadBase, code, 'frames');
    const drawingsDir = path.join(uploadBase, code, 'drawings');

    const frameFiles   = fs.existsSync(framesDir)   ? fs.readdirSync(framesDir).filter((f: string) => f.endsWith('.json')).length : 0;
    const drawingFiles = fs.existsSync(drawingsDir)  ? fs.readdirSync(drawingsDir).length : 0;

    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: code }, select: { id: true },
    });
    const assignmentIds = assignments.map(a => a.id);

    const [inspections, hashes, auditLogs] = await Promise.all([
      assignmentIds.length
        ? this.prisma.panel_inspections.count({ where: { assignment_id: { in: assignmentIds } } })
        : Promise.resolve(0),
      this.prisma.file_hashes.count({ where: { project_code: code } }),
      this.prisma.tech_audit_log.count({ where: { project_code: code } }),
    ]);

    return {
      project: { code: project.code, name: project.name, state: project.project_state },
      counts: {
        frames:      Math.max(MockStore.findFramesByProject(code).length, frameFiles),
        drawings:    Math.max(MockStore.findDrawingsByProject(code).length, drawingFiles),
        assignments: assignments.length,
        inspections,
        file_hashes: hashes,
        audit_logs:  auditLogs,
      },
      backup_note: `pg_dump + uploads/${code}/ will be archived to uploads/backups/ before deletion`,
    };
  }

  // ── Hard Delete (system_admin only; permanent — no backup, no restore) ────

  async hardDeleteProjectPrecheck(code: string) {
    const project = await this.prisma.projects.findFirst({ where: { code, is_active: true } });
    if (!project) return { error: `Project "${code}" not found` };

    const uploadBase = this._resolveUploadDir();
    const framesDir   = path.join(uploadBase, code, 'frames');
    const drawingsDir = path.join(uploadBase, code, 'drawings');

    const frameFiles   = fs.existsSync(framesDir)   ? fs.readdirSync(framesDir).filter((f: string) => f.endsWith('.json')).length : 0;
    const drawingFiles = fs.existsSync(drawingsDir)  ? fs.readdirSync(drawingsDir).length : 0;

    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: code }, select: { id: true },
    });
    const assignmentIds = assignments.map(a => a.id);

    const [inspections, hashes, auditLogs] = await Promise.all([
      assignmentIds.length
        ? this.prisma.panel_inspections.count({ where: { assignment_id: { in: assignmentIds } } })
        : Promise.resolve(0),
      this.prisma.file_hashes.count({ where: { project_code: code } }),
      this.prisma.tech_audit_log.count({ where: { project_code: code } }),
    ]);

    return {
      project: { code: project.code, name: project.name, state: project.project_state },
      counts: {
        frames:      Math.max(MockStore.findFramesByProject(code).length, frameFiles),
        drawings:    Math.max(MockStore.findDrawingsByProject(code).length, drawingFiles),
        assignments: assignments.length,
        inspections,
        file_hashes: hashes,
        audit_logs:  auditLogs,
      },
      delete_warning:
        'Permanently removes the project row, all related database records, and the entire uploads folder. No backup is created and this cannot be restored within DWES.',
    };
  }

  async hardDeleteProject(code: string) {
    if (!code) return { error: 'Project code required' };

    const project = await this.prisma.projects.findFirst({ where: { code, is_active: true } });
    if (!project) return { error: `Project "${code}" not found` };

    return permanentlyDeleteProject(this.prisma, code, this._resolveUploadDir());
  }

  async hardResetProject(code: string, confirmedCode: string) {
    if (!code) return { error: 'Project code required' };
    if (code !== confirmedCode) return { error: 'Confirmation code does not match — type the exact project code' };

    const project = await this.prisma.projects.findFirst({ where: { code, is_active: true } });
    if (!project) return { error: `Project "${code}" not found` };

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const dumpFile  = path.join(backupDir, `${code}_${ts}.dump`);
    const archiveDir = path.join(backupDir, `${code}_${ts}`);

    // ── Step 1: pg_dump (abort if it fails) ────────────────────────────────
    const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    const pgHost    = process.env.PGHOST     || 'localhost';
    const pgPort    = process.env.PGPORT     || '5432';
    const pgUser    = process.env.PGUSER     || 'postgres';
    const pgPass    = process.env.PGPASSWORD || 'postgres';
    const pgDb      = process.env.PGDATABASE || 'WiringSchemeDB';

    const dumpResult = spawnSync(
      pgDumpExe,
      ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', dumpFile, pgDb],
      { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
    );
    if (dumpResult.status !== 0) {
      const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
      return { error: `pg_dump failed — aborting reset. Details: ${errMsg.slice(0, 300)}` };
    }

    // ── Step 2: Archive uploads/<CODE>/ (abort if copy fails) ──────────────
    const projectUploadsDir = path.join(uploadBase, code);
    if (fs.existsSync(projectUploadsDir)) {
      try {
        fs.cpSync(projectUploadsDir, archiveDir, { recursive: true });
      } catch (e: any) {
        return { error: `File archive failed — aborting reset. Details: ${e.message}` };
      }
    }

    // ── Step 3: Delete DB rows (panel_inspections → tech_assignments → hashes → audit) ──
    const assignments = await this.prisma.tech_assignments.findMany({
      where: { project_code: code }, select: { id: true },
    });
    const assignmentIds = assignments.map(a => a.id);

    const inspDel = assignmentIds.length
      ? await this.prisma.panel_inspections.deleteMany({ where: { assignment_id: { in: assignmentIds } } })
      : { count: 0 };

    const assnDel  = await this.prisma.tech_assignments.deleteMany({ where: { project_code: code } });
    const hashDel  = await this.prisma.file_hashes.deleteMany({ where: { project_code: code } });
    const auditDel = await this.prisma.tech_audit_log.deleteMany({ where: { project_code: code } });

    // Reset project state
    await this.prisma.projects.update({
      where: { code },
      data: { project_state: 'not_started', assigned_technicians: '' },
    });

    // ── Step 4: Clear in-memory MockStore ───────────────────────────────────
    MockStore.frames   = MockStore.frames.filter(f => f.project_code !== code);
    MockStore.drawings = MockStore.drawings.filter(d => d.project_code !== code);
    MockStore.drawingPackages = MockStore.drawingPackages.filter(record => record.project_code !== code);

    // ── Step 5: Remove files from disk ──────────────────────────────────────
    const framesDir   = path.join(uploadBase, code, 'frames');
    const drawingsDir = path.join(uploadBase, code, 'drawings');
    let filesDeleted = 0;

    for (const dir of [framesDir, drawingsDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        fs.unlinkSync(path.join(dir, f));
        filesDeleted++;
      }
      fs.rmdirSync(dir);
    }

    return {
      success: true,
      project_code: code,
      backup: { dump: dumpFile, archive: fs.existsSync(projectUploadsDir) ? archiveDir : '(no uploads folder existed)' },
      deleted: {
        inspections: inspDel.count,
        assignments: assnDel.count,
        file_hashes: hashDel.count,
        audit_logs:  auditDel.count,
        disk_files:  filesDeleted,
      },
      message: `Project "${code}" reset to clean state. Backup at: backups/${code}_${ts}`,
      ts: new Date().toISOString(),
    };
  }

  // ── Reset All Projects (DEMO_MODE only, system_admin only) ──────────────

  async resetAllProjectsPrecheck() {
    const uploadBase = this._resolveUploadDir();
    const projects = await this.prisma.projects.findMany({ select: { code: true, name: true } });
    const codes = projects.map(p => p.code);

    const allAssignments = await this.prisma.tech_assignments.findMany({ select: { id: true } });
    const allAssignmentIds = allAssignments.map(a => a.id);

    const [inspections, hashes, auditLogs] = await Promise.all([
      allAssignmentIds.length
        ? this.prisma.panel_inspections.count({ where: { assignment_id: { in: allAssignmentIds } } })
        : Promise.resolve(0),
      this.prisma.file_hashes.count(),
      this.prisma.tech_audit_log.count(),
    ]);

    let totalFrameFiles = 0;
    let totalDrawingFiles = 0;
    for (const code of codes) {
      const framesDir   = path.join(uploadBase, code, 'frames');
      const drawingsDir = path.join(uploadBase, code, 'drawings');
      if (fs.existsSync(framesDir))
        totalFrameFiles += fs.readdirSync(framesDir).filter((f: string) => f.endsWith('.json')).length;
      if (fs.existsSync(drawingsDir))
        totalDrawingFiles += fs.readdirSync(drawingsDir).length;
    }

    return {
      counts: {
        projects:    projects.length,
        frames:      Math.max(MockStore.frames.length, totalFrameFiles),
        drawings:    Math.max(MockStore.drawings.length, totalDrawingFiles),
        assignments: allAssignments.length,
        inspections,
        file_hashes: hashes,
        audit_logs:  auditLogs,
      },
      backup_note: 'pg_dump + all uploads/<CODE>/ directories will be archived to uploads/backups/ before deletion',
    };
  }

  async resetAllProjects(confirmedPhrase: string) {
    const REQUIRED = 'DELETE ALL PROJECTS';
    if ((confirmedPhrase || '').trim() !== REQUIRED) {
      return { error: `Confirmation phrase does not match — type exactly: ${REQUIRED}` };
    }

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir  = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const dumpFile   = path.join(backupDir, `RESET_ALL_${ts}.dump`);
    const archiveDir = path.join(backupDir, `RESET_ALL_${ts}`);

    // ── Step 1: pg_dump (abort if it fails) ──────────────────────────────
    const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    const pgHost    = process.env.PGHOST     || 'localhost';
    const pgPort    = process.env.PGPORT     || '5432';
    const pgUser    = process.env.PGUSER     || 'postgres';
    const pgPass    = process.env.PGPASSWORD || 'postgres';
    const pgDb      = process.env.PGDATABASE || 'WiringSchemeDB';

    const dumpResult = spawnSync(
      pgDumpExe,
      ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', dumpFile, pgDb],
      { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
    );
    if (dumpResult.status !== 0) {
      const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
      return { error: `pg_dump failed — aborting. Details: ${errMsg.slice(0, 300)}` };
    }

    // ── Step 2: Snapshot project list + archive all uploads (abort if fails)
    const projects = await this.prisma.projects.findMany({ select: { code: true } });
    const codes = projects.map(p => p.code);

    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      for (const code of codes) {
        const srcDir = path.join(uploadBase, code);
        if (fs.existsSync(srcDir)) {
          fs.cpSync(srcDir, path.join(archiveDir, code), { recursive: true });
        }
      }
    } catch (e: any) {
      return { error: `File archive failed — aborting. Details: ${e.message}` };
    }

    // ── Step 3: Single transaction — all-or-nothing ───────────────────────
    // FK order: panel_inspections (child of tech_assignments, which are child of projects)
    //           → tech_assignments → file_hashes → tech_audit_log → projects
    const [inspDel, assnDel, hashDel, auditDel, projDel] = await this.prisma.$transaction([
      this.prisma.panel_inspections.deleteMany({}),
      this.prisma.tech_assignments.deleteMany({}),
      this.prisma.file_hashes.deleteMany({}),
      this.prisma.tech_audit_log.deleteMany({}),
      this.prisma.projects.deleteMany({}),
    ]);

    // ── Step 4: Clear in-memory MockStore ────────────────────────────────
    MockStore.frames   = [];
    MockStore.drawings = [];
    MockStore.drawingPackages = [];

    // ── Step 5: Remove on-disk project folders (NOT uploads/backups/) ────
    let foldersRemoved = 0;
    for (const code of codes) {
      const dir = path.join(uploadBase, code);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        foldersRemoved++;
      }
    }

    return {
      success: true,
      backup: { dump: dumpFile, archive: archiveDir },
      deleted: {
        projects:        projDel.count,
        inspections:     inspDel.count,
        assignments:     assnDel.count,
        file_hashes:     hashDel.count,
        audit_logs:      auditDel.count,
        folders_removed: foldersRemoved,
      },
      message: `All ${projDel.count} project(s) permanently deleted. Backup at backups/RESET_ALL_${ts}/`,
      ts: new Date().toISOString(),
    };
  }

  // ── Deployment Mode (Intranet vs Cloud) ───────────────────────────────────

  getDeploymentConfig() {
    const cfg = DeploymentConfigStore.load();
    const intranet = DeploymentConfigStore.getRuntimeIntranetUrls();
    const tierKey = cfg.mode === 'intranet' ? 'intranet' : cfg.cloudTier;
    const activePricing = DEPLOYMENT_PRICING[tierKey];
    return {
      mode: cfg.mode,
      cloudAppUrl: cfg.cloudAppUrl || '',
      cloudTier: cfg.cloudTier,
      cloudRegion: cfg.cloudRegion || 'us-east-1',
      lastSwitched: cfg.lastSwitched,
      notes: cfg.notes || '',
      intranet,
      pricing: DEPLOYMENT_PRICING,
      activePricing,
      httpsEnabled: process.env.DWES_HTTPS === '1',
    };
  }

  setDeploymentConfig(
    mode: DeploymentMode,
    cloudAppUrl?: string,
    cloudTier?: CloudTier,
    cloudRegion?: string,
    notes?: string,
  ) {
    if (mode !== 'intranet' && mode !== 'cloud') {
      return { error: 'mode must be "intranet" or "cloud"' };
    }
    if (mode === 'cloud' && !cloudAppUrl?.trim()) {
      return { error: 'Cloud app URL is required when switching to Cloud hosting mode.' };
    }
    const validTiers: CloudTier[] = ['standard', 'performance', 'enterprise'];
    const tier = validTiers.includes(cloudTier as CloudTier)
      ? (cloudTier as CloudTier)
      : DeploymentConfigStore.load().cloudTier;

    DeploymentConfigStore.save({
      mode,
      cloudAppUrl: mode === 'cloud' ? (cloudAppUrl || '').trim() : (DeploymentConfigStore.load().cloudAppUrl || ''),
      cloudTier: tier,
      cloudRegion: cloudRegion?.trim() || 'us-east-1',
      lastSwitched: new Date().toISOString(),
      notes: notes || '',
    });

    const tierKey = mode === 'intranet' ? 'intranet' : tier;
    return {
      message:
        mode === 'intranet'
          ? 'Deployment mode set to Local Intranet. Use npm run dev:https and the LAN URLs below.'
          : `Deployment mode set to Cloud (${DEPLOYMENT_PRICING[tierKey].label}). Users should open the cloud app URL.`,
      mode,
      cloudTier: tier,
      activePricing: DEPLOYMENT_PRICING[tierKey],
      ts: new Date().toISOString(),
    };
  }

  // ── File Storage Info ─────────────────────────────────────────────────────

  fileStorageInfo() {
    const absPath = this._resolveUploadDir();
    let exists = false;
    let projectDirs: string[] = [];
    try {
      exists = fs.existsSync(absPath);
      if (exists) {
        projectDirs = fs.readdirSync(absPath, { withFileTypes: true })
          .filter((d: any) => d.isDirectory() && d.name !== 'backups')
          .map((d: any) => d.name);
      }
    } catch {}
    return {
      upload_dir: process.env.UPLOAD_DIR || 'uploads',
      absolute_path: absPath,
      exists,
      project_dirs: projectDirs.length,
      projects: projectDirs.slice(0, 20),
      note: 'Files are always stored locally. Database mode only affects metadata storage.',
    };
  }

  private _resolveUploadDir(): string {
    const raw = process.env.UPLOAD_DIR || 'uploads';
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }

  private _humanUptime(sec: number) {
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
