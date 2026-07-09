import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import Database = require('better-sqlite3');
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AuthTokenStoreService implements OnModuleInit {
  private db!: InstanceType<typeof Database>;

  onModuleInit() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, 'dwes_auth.sqlite');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash  TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        revoked     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    `);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createRefreshToken(userId: number, expiresDays: number): { token: string; expiresAt: Date } {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO refresh_tokens (token_hash, user_id, expires_at, created_at, revoked)
      VALUES (?, ?, ?, ?, 0)
    `).run(this.hashToken(token), userId, expiresAt.toISOString(), now);

    return { token, expiresAt };
  }

  validateRefreshToken(token: string): number | null {
    const row = this.db.prepare(`
      SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?
    `).get(this.hashToken(token)) as { user_id: number; expires_at: string; revoked: number } | undefined;

    if (!row || row.revoked) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return row.user_id;
  }

  revokeRefreshToken(token: string): void {
    this.db.prepare(`
      UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?
    `).run(this.hashToken(token));
  }

  revokeAllForUser(userId: number): void {
    this.db.prepare(`
      UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0
    `).run(userId);
  }
}
