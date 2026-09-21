import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import Database = require('better-sqlite3');
import * as fs from 'fs';
import * as path from 'path';

export type TeamInstallLinkRow = {
  id: number;
  token_hash: string;
  campaign_label: string;
  organization_name: string;
  status: 'active' | 'disabled';
  created_at: string;
  created_by_user_id: number | null;
  expires_at: string | null;
  disabled_at: string | null;
  visit_count: number;
  last_visit_at: string | null;
};

export type TeamInstallAuditRow = {
  id: number;
  link_id: number | null;
  action: string;
  actor_user_id: number | null;
  ip_hash: string | null;
  detail: string | null;
  created_at: string;
};

@Injectable()
export class TeamInstallLinkStoreService implements OnModuleInit {
  private db!: InstanceType<typeof Database>;

  onModuleInit() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, 'dwes_auth.sqlite');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS team_install_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        campaign_label TEXT NOT NULL DEFAULT 'DWES Team Installation',
        organization_name TEXT NOT NULL DEFAULT 'Ingenious Network FZC',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        created_by_user_id INTEGER,
        expires_at TEXT,
        disabled_at TEXT,
        visit_count INTEGER NOT NULL DEFAULT 0,
        last_visit_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_team_install_status ON team_install_links(status);

      CREATE TABLE IF NOT EXISTS team_install_link_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER,
        action TEXT NOT NULL,
        actor_user_id INTEGER,
        ip_hash TEXT,
        detail TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_team_install_audit_link ON team_install_link_audit(link_id);
    `);
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  hashIp(ip: string): string {
    return createHash('sha256').update(ip, 'utf8').digest('hex').slice(0, 32);
  }

  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  insertLink(params: {
    tokenHash: string;
    campaignLabel: string;
    organizationName: string;
    createdByUserId: number;
    expiresAt: string | null;
  }): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO team_install_links (
        token_hash, campaign_label, organization_name, status,
        created_at, created_by_user_id, expires_at, visit_count
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, 0)
    `).run(
      params.tokenHash,
      params.campaignLabel,
      params.organizationName,
      now,
      params.createdByUserId,
      params.expiresAt,
    );
    return Number(result.lastInsertRowid);
  }

  disableAllActive(): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE team_install_links
      SET status = 'disabled', disabled_at = ?
      WHERE status = 'active'
    `).run(now);
  }

  disableById(id: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE team_install_links
      SET status = 'disabled', disabled_at = ?
      WHERE id = ? AND status = 'active'
    `).run(now, id);
  }

  getActiveLink(): TeamInstallLinkRow | null {
    const row = this.db.prepare(`
      SELECT * FROM team_install_links
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `).get() as TeamInstallLinkRow | undefined;
    return row ?? null;
  }

  findByTokenHash(tokenHash: string): TeamInstallLinkRow | null {
    const row = this.db.prepare(`
      SELECT * FROM team_install_links WHERE token_hash = ?
    `).get(tokenHash) as TeamInstallLinkRow | undefined;
    return row ?? null;
  }

  tokenMatches(storedHash: string, candidateHash: string): boolean {
    try {
      const a = Buffer.from(storedHash, 'hex');
      const b = Buffer.from(candidateHash, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  recordVisit(linkId: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE team_install_links
      SET visit_count = visit_count + 1, last_visit_at = ?
      WHERE id = ?
    `).run(now, linkId);
  }

  audit(entry: {
    linkId: number | null;
    action: string;
    actorUserId?: number | null;
    ipHash?: string | null;
    detail?: string | null;
  }): void {
    this.db.prepare(`
      INSERT INTO team_install_link_audit (link_id, action, actor_user_id, ip_hash, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.linkId,
      entry.action,
      entry.actorUserId ?? null,
      entry.ipHash ?? null,
      entry.detail ?? null,
      new Date().toISOString(),
    );
  }

  /** For tests — wipe link tables in temp DB only. */
  _dangerResetForTests(): void {
    this.db.exec('DELETE FROM team_install_link_audit; DELETE FROM team_install_links;');
  }

  /** For tests — latest audit row. */
  _getLastAuditForTests(): TeamInstallAuditRow | undefined {
    return this.db.prepare(`
      SELECT * FROM team_install_link_audit ORDER BY id DESC LIMIT 1
    `).get() as TeamInstallAuditRow | undefined;
  }
}
