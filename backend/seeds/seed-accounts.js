#!/usr/bin/env node
/**
 * seed-accounts.js — Idempotent demo-user insert for WiringSchemeDB
 *
 * Usage (run from project root or backend/seeds):
 *   node backend/seeds/seed-accounts.js
 *
 * Reads accounts.seed.json in the same directory.
 * Uses bcryptjs cost=10 (same as the app's auth layer).
 * INSERT ... ON CONFLICT (username) DO NOTHING — safe to re-run.
 * NEVER alters schema, NEVER updates/deletes existing rows.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const bcrypt = require(path.join(__dirname, '../node_modules/bcryptjs'));
const { Client } = require(path.join(__dirname, '../node_modules/pg'));

const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';
const MANIFEST     = path.join(__dirname, 'accounts.seed.json');
const COST_FACTOR  = 10;

async function main() {
  const accounts = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('[seed] Connected to WiringSchemeDB\n');

  const results = { inserted: [], skipped: [] };

  for (const acct of accounts) {
    const { username, password, role, full_name } = acct;
    const hashed = await bcrypt.hash(password, COST_FACTOR);

    const res = await client.query(
      `INSERT INTO users (username, hashed_password, role, full_name, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [username, hashed, role, full_name]
    );

    if (res.rowCount > 0) {
      console.log(`  [INSERTED] ${username.padEnd(12)} role=${role}`);
      results.inserted.push(username);
    } else {
      console.log(`  [SKIPPED]  ${username.padEnd(12)} already exists`);
      results.skipped.push(username);
    }
  }

  await client.end();

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`Inserted : ${results.inserted.length} accounts`);
  console.log(`Skipped  : ${results.skipped.length} accounts (already existed)`);
  if (results.skipped.length) {
    console.log(`  Skipped : ${results.skipped.join(', ')}`);
  }
  console.log('No existing rows were modified. No schema changes.');
}

main().catch(err => { console.error('[seed] ERROR:', err.message); process.exit(1); });
