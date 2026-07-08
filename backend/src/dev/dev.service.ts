import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import { MockStore } from '../data/mock-store';
import { FrameStore } from '../frames/frame-store';
import { WebAuthnStoreService } from '../auth/webauthn-store.service';
import { CANONICAL_SEED_PROJECTS } from '../common/seed-projects';
import { clearErrorRingBuffer } from '../admin/admin.service';

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
    const codes = projects.map(p => p.code);

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
      reseed_projects: CANONICAL_SEED_PROJECTS.length,
      backup_note:
        'pg_dump of WiringSchemeDB + uploads/<CODE>/ archive to uploads/backups/ before wipe. User accounts preserved; session log and WebAuthn credentials cleared.',
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

    const uploadBase = this._resolveUploadDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(uploadBase, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const dumpFile = path.join(backupDir, `HARD_RESET_DB_${ts}.dump`);
    const archiveDir = path.join(backupDir, `HARD_RESET_DB_${ts}`);

    const pgDumpExe = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
    const pgHost = process.env.PGHOST || 'localhost';
    const pgPort = process.env.PGPORT || '5432';
    const pgUser = process.env.PGUSER || 'postgres';
    const pgPass = process.env.PGPASSWORD || 'postgres';
    const pgDb = process.env.PGDATABASE || 'WiringSchemeDB';

    const dumpResult = spawnSync(
      pgDumpExe,
      ['-h', pgHost, '-p', pgPort, '-U', pgUser, '-F', 'c', '-f', dumpFile, pgDb],
      { env: { ...process.env, PGPASSWORD: pgPass }, timeout: 120_000 },
    );
    if (dumpResult.status !== 0) {
      const errMsg = dumpResult.stderr?.toString() || dumpResult.error?.message || 'unknown';
      return { error: `pg_dump failed — aborting reset. Details: ${errMsg.slice(0, 300)}` };
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
    let inspDel = { count: 0 };
    let assnDel = { count: 0 };
    let hashDel = { count: 0 };
    let auditDel = { count: 0 };
    let sessionDel = { count: 0 };
    let projDel = { count: 0 };
    let usersReset = { count: 0 };
    let projectsReseeded = 0;

    try {
      [inspDel, assnDel, hashDel, auditDel, sessionDel, projDel] = await this.prisma.$transaction([
        this.prisma.panel_inspections.deleteMany({}),
        this.prisma.tech_assignments.deleteMany({}),
        this.prisma.file_hashes.deleteMany({}),
        this.prisma.tech_audit_log.deleteMany({}),
        this.prisma.session_log.deleteMany({}),
        this.prisma.projects.deleteMany({}),
      ]);

      const userResetResult = await this.prisma.users.updateMany({
        data: {
          ready_for_assignment: false,
          ready_since: null,
        },
      });
      usersReset = { count: userResetResult.count };

      for (const p of CANONICAL_SEED_PROJECTS) {
        await this.prisma.projects.create({
          data: { ...p, is_active: true },
        });
        projectsReseeded++;
      }
    } catch (e: any) {
      fkWarnings.push(e?.message || 'Transaction failed — partial state possible');
      return {
        error: `Database reset failed — no file wipe performed after failed transaction. ${fkWarnings[0]}`,
        fk_warnings: fkWarnings,
      };
    }

    MockStore.frames = [];
    MockStore.drawings = [];
    MockStore.directorReports = [];

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
        projects: projDel.count,
        inspections: inspDel.count,
        assignments: assnDel.count,
        file_hashes: hashDel.count,
        audit_logs: auditDel.count,
        session_logs: sessionDel.count,
        upload_folders: foldersRemoved,
        webauthn_credentials: webauthnCleared,
        mock_store_cleared: true,
      },
      reseeded: {
        projects: projectsReseeded,
        codes: CANONICAL_SEED_PROJECTS.map(p => p.code),
      },
      users_preserved: usersReset.count,
      fk_warnings: fkWarnings,
      message:
        'DWES hard reset complete. All projects, wiring data, uploads, session log, and WebAuthn credentials cleared. Canonical seed projects restored.',
      ts: new Date().toISOString(),
      client_reload_required: true,
    };
  }

  private _resolveUploadDir(): string {
    const raw = process.env.UPLOAD_DIR || 'uploads';
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }
}
