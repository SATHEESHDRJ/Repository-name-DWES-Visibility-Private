import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Database = require('better-sqlite3');
import * as fs from 'fs';
import * as path from 'path';

export interface CredentialRow {
  credential_id: string;
  user_id: number;
  public_key: Buffer;
  counter: number;
  transports: string | null;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

@Injectable()
export class WebAuthnStoreService implements OnModuleInit {
  private readonly logger = new Logger(WebAuthnStoreService.name);
  private db!: InstanceType<typeof Database>;

  onModuleInit() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, 'dwes_auth.sqlite');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        credential_id TEXT    PRIMARY KEY,
        user_id       INTEGER NOT NULL,
        public_key    BLOB    NOT NULL,
        counter       INTEGER NOT NULL DEFAULT 0,
        transports    TEXT,
        device_label  TEXT,
        created_at    TEXT    NOT NULL,
        last_used_at  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_wa_user ON webauthn_credentials(user_id);
    `);

    this.logger.log(`WebAuthn SQLite store: ${dbPath}`);
  }

  insert(params: {
    credentialId: string;
    userId: number;
    publicKey: Buffer;
    counter: number;
    transports?: string[];
    deviceLabel?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO webauthn_credentials
           (credential_id, user_id, public_key, counter, transports, device_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.credentialId,
        params.userId,
        params.publicKey,
        params.counter,
        params.transports ? JSON.stringify(params.transports) : null,
        params.deviceLabel ?? null,
        new Date().toISOString(),
      );
  }

  byUserId(userId: number): CredentialRow[] {
    return this.db
      .prepare(
        'SELECT * FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at',
      )
      .all(userId) as CredentialRow[];
  }

  byId(credentialId: string): CredentialRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
        .get(credentialId) as CredentialRow) ?? null
    );
  }

  updateCounter(credentialId: string, counter: number): void {
    this.db
      .prepare(
        'UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?',
      )
      .run(counter, new Date().toISOString(), credentialId);
  }

  remove(credentialId: string, userId: number): void {
    this.db
      .prepare(
        'DELETE FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?',
      )
      .run(credentialId, userId);
  }

  count(userId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM webauthn_credentials WHERE user_id = ?')
      .get(userId) as { n: number };
    return row.n;
  }
}
