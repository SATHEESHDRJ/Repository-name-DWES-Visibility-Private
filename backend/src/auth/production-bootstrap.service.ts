import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Database = require('better-sqlite3');
import * as fs from 'fs';
import * as path from 'path';

const BOOTSTRAP_ROLES = new Set(['system_admin']);
// ops_director: password-only for now — fingerprint enrollment will be required later.
const DEMO_USERNAMES = new Set([
  'sysadmin', 'director1', 'ops_director1', 'supervisor1', 'qa1', 'qa2', 'tech1',
]);

export interface BootstrapStatus {
  required: boolean;
  needs_password_rotation: boolean;
  needs_webauthn_enrollment: boolean;
}

@Injectable()
export class ProductionBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(ProductionBootstrapService.name);
  private db!: InstanceType<typeof Database>;

  onModuleInit() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'dwes_auth.sqlite');
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS production_bootstrap (
        user_id INTEGER PRIMARY KEY,
        password_rotated_at TEXT,
        webauthn_enrolled_at TEXT
      );
    `);
    this.logger.log(`Production bootstrap store: ${dbPath}`);
  }

  isProduction(): boolean {
    return process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true';
  }

  markPending(userId: number): void {
    this.db.prepare(
      `INSERT INTO production_bootstrap (user_id) VALUES (?)
       ON CONFLICT(user_id) DO NOTHING`,
    ).run(userId);
  }

  markAllAdminsPending(userIds: number[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO production_bootstrap (user_id) VALUES (?)
       ON CONFLICT(user_id) DO NOTHING`,
    );
    for (const id of userIds) stmt.run(id);
  }

  recordPasswordRotation(userId: number): void {
    this.db.prepare(
      `INSERT INTO production_bootstrap (user_id, password_rotated_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET password_rotated_at = datetime('now')`,
    ).run(userId);
  }

  recordWebAuthnEnrollment(userId: number): void {
    this.db.prepare(
      `INSERT INTO production_bootstrap (user_id, webauthn_enrolled_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET webauthn_enrolled_at = datetime('now')`,
    ).run(userId);
  }

  /** Password-only continuation until the user enrolls WebAuthn later. */
  deferWebAuthnEnrollment(userId: number): void {
    this.db.prepare(
      `INSERT INTO production_bootstrap (user_id, webauthn_enrolled_at)
       VALUES (?, 'deferred')
       ON CONFLICT(user_id) DO UPDATE SET webauthn_enrolled_at = 'deferred'`,
    ).run(userId);
  }

  statusForUser(userId: number, role: string | null | undefined, hasWebAuthn: boolean): BootstrapStatus {
    if (!this.isProduction() || !BOOTSTRAP_ROLES.has(role || '')) {
      return { required: false, needs_password_rotation: false, needs_webauthn_enrollment: false };
    }
    const row = this.db.prepare(
      'SELECT password_rotated_at, webauthn_enrolled_at FROM production_bootstrap WHERE user_id = ?',
    ).get(userId) as { password_rotated_at?: string; webauthn_enrolled_at?: string } | undefined;

    const needsPassword = !row?.password_rotated_at;
    // Fingerprint enrollment is optional for now — password-only access for admin/director.
    // Re-enable by restoring: !row?.webauthn_enrolled_at && !hasWebAuthn
    void hasWebAuthn;
    const needsWebAuthn = false;
    return {
      required: needsPassword || needsWebAuthn,
      needs_password_rotation: needsPassword,
      needs_webauthn_enrollment: needsWebAuthn,
    };
  }

  isDemoUsername(username: string): boolean {
    return DEMO_USERNAMES.has(username);
  }
}
