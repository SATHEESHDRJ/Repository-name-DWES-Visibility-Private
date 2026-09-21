import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { runPgDumpCustomFormat, pgDumpFailureDetail } from '../common/pg-dump.util';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { WebAuthnStoreService } from '../auth/webauthn-store.service';
import { clearErrorRingBuffer } from '../admin/admin.service';
import {
  deleteProjectScopedDatabaseRows,
  purgeProjectMemoryStores,
} from '../common/project-delete.util';

const HARD_RESET_PHRASE = 'HARD RESET DB';

@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webauthnStore: WebAuthnStoreService,
  ) {}

  async hardResetPrecheck() {
    const uploadBase = this._resolveUploadDir();
    const projects = await this.prisma.projects.findMany({ select: { code: true } });

    const [
      users,
      assignments,
      inspections,
      sessionLogs,
      auditLogs,
      fileHashes,
      webauthnCredentials,
    ] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.tech_assignments.count(),
      this.prisma.panel_inspections.count(),
      this.prisma.session_log.count(),
      this.prisma.tech_audit_log.count(),
      this.prisma.file_hashes.count(),
      this.webauthnStore.countAll(),
    ]);

    let frameFiles = 0;
    let drawingFiles = 0;
    let reportFiles = 0;
    let projectFolders = 0;

    if (fs.existsSync(uploadBase)) {
      for (const entry of fs.readdirSync(uploadBase, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'backups') continue;
        projectFolders++;
        const codeDir = path.join(uploadBase, entry.name);
        const framesDir = path.join(codeDir, 'frames');
        const drawingsDir = path.join(codeDir, 'drawings');
        const reportsDir = path.join(codeDir, 'director-reports');
        if (fs.existsSync(framesDir)) {
          frameFiles += fs.readdirSync(framesDir).filter(f => f.endsWith('.json')).length;
        }
        if (fs.existsSync(drawingsDir)) {
          drawingFiles += fs.readdirSync(drawingsDir).length;
        }
        if (fs.existsSync(reportsDir)) {
          reportFiles += fs.readdirSync(reportsDir).length;
        }
      }
    }

    return {
      counts: {
        users,
        projects: projects.length,
        assignments,
        inspections,
        session_logs: sessionLogs,
        audit_logs: auditLogs,
        file_hashes: fileHashes,
        webauthn_credentials: webauthnCredentials,
        frames: Math.max(MockStore.frames.length, frameFiles),
        drawings: Math.max(MockStore.drawings.length, drawingFiles),
        director_reports: Math.max(MockStore.directorReports.length, reportFiles),
        upload_project_folders: projectFolders,
        mock_store_frames: MockStore.frames.length,
        mock_store_drawings: MockStore.drawings.length,
      },
      reseed_projects: 0,
      backup_note:
        'Full project backup (Backup/YYYY-MM-DD_HH-mm) + pg_dump of WiringSchemeDB + uploads/<CODE>/ archive to uploads/backups/ before wipe. User accounts preserved; session log and WebAuthn credentials cleared.',
      confirm_phrase: HARD_RESET_PHRASE,
      preserved: ['users (accounts not deleted)', 'uploads/backups/ (existing archives)'],
    };
  }

  async hardReset(confirmedPhrase: string) {
    if ((confirmedPhrase || '').trim() !== HARD_RESET_PHRASE) {
      return {
        error: `Confirmation phrase does not match — type exactly: ${HARD_RESET_PHRASE}`,
      };
    }

    const preOpBackup = this._runPreOperationBackup();
    if (!preOpBackup.ok) {
      return {
        error: `Pre-operation project backup failed — aborting reset. ${preOpBackup.message}`,
      };
    }

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const dumpFile = path.join(backupDir, `HARD_RESET_DB_${ts}.dump`);
    const archiveDir = path.join(backupDir, `HARD_RESET_DB_${ts}`);

    const dumpResult = runPgDumpCustomFormat(dumpFile);
    if (!dumpResult.ok) {
      return { error: `pg_dump failed — aborting reset. Details: ${pgDumpFailureDetail(dumpResult)}` };
    }

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
      return { error: `File archive failed — aborting reset. Details: ${e.message}` };
    }

    const fkWarnings: string[] = [];
    let deleted = {
      projects: 0,
      panel_inspections: 0,
      tech_assignments: 0,
      file_hashes: 0,
      tech_audit_log: 0,
      session_log: 0,
    };
    let usersReset = { count: 0 };

    try {
      const purgeCounts = await deleteProjectScopedDatabaseRows(this.prisma, {
        includeProjectRow: true,
      });
      deleted = {
        projects: purgeCounts.projects,
        panel_inspections: purgeCounts.panel_inspections,
        tech_assignments: purgeCounts.tech_assignments,
        file_hashes: purgeCounts.file_hashes,
        tech_audit_log: purgeCounts.tech_audit_log,
        session_log: purgeCounts.session_log,
      };

      const userResetResult = await this.prisma.users.updateMany({
        data: {
          ready_for_assignment: false,
          ready_since: null,
        },
      });
      usersReset = { count: userResetResult.count };
    } catch (e: any) {
      fkWarnings.push(e?.message || 'Transaction failed — partial state possible');
      return {
        error: `Database reset failed — no file wipe performed after failed transaction. ${fkWarnings[0]}`,
        fk_warnings: fkWarnings,
      };
    }

    purgeProjectMemoryStores();

    const webauthnCleared = this.webauthnStore.clearAll();
    clearErrorRingBuffer();

    let foldersRemoved = 0;
    if (fs.existsSync(uploadBase)) {
      for (const entry of fs.readdirSync(uploadBase, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'backups') continue;
        fs.rmSync(path.join(uploadBase, entry.name), { recursive: true, force: true });
        foldersRemoved++;
      }
    }

    FrameStore.loadAll();

    return {
      success: true,
      backup: { dump: dumpFile, archive: archiveDir },
      deleted: {
        ...deleted,
        engineering_tables_cleared: true,
        upload_folders: foldersRemoved,
        webauthn_credentials: webauthnCleared,
        mock_store_cleared: true,
      },
      reseeded: { projects: 0, codes: [] as string[] },
      users_preserved: usersReset.count,
      fk_warnings: fkWarnings,
      message:
        'DWES hard reset complete. All projects, wiring data, uploads, session log, and WebAuthn credentials cleared. No projects are reseeded — create new projects in the app.',
      ts: new Date().toISOString(),
      client_reload_required: true,
    };
  }

  private _resolveUploadDir(): string {
    const raw = process.env.UPLOAD_DIR || 'uploads';
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }

  /** Full DWES backup via scripts/run-pre-operation-backup.mjs before destructive dev reset. */
  private _runPreOperationBackup(): { ok: boolean; message: string } {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const script = path.join(projectRoot, 'scripts', 'run-pre-operation-backup.mjs');
    if (!fs.existsSync(script)) {
      return { ok: false, message: `Backup script not found: ${script}` };
    }

    const result = spawnSync(process.execPath, [script], {
      cwd: projectRoot,
      env: { ...process.env, DWES_PROJECT_ROOT: projectRoot, DWES_BACKUP_TRIGGER: 'pre-operation' },
      timeout: 600_000,
      encoding: 'utf8',
    });

    if (result.status === 0 || result.status === 2) {
      return { ok: true, message: result.stderr?.slice(0, 200) || 'backup completed' };
    }

    const detail =
      result.stderr?.trim() ||
      result.stdout?.trim() ||
      result.error?.message ||
      `exit code ${result.status ?? 'unknown'}`;
    return { ok: false, message: detail.slice(0, 400) };
  }
}
