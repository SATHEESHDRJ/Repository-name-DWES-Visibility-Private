#!/usr/bin/env node
/**
 * seed-accounts.js — Idempotent demo-user insert for WiringSchemeDB
 *
 * Usage (run from project root or backend/seeds):
 *   node backend/seeds/seed-accounts.js
 *
 * Reads the ignored demo-accounts.local.json file, or DWES_DEMO_ACCOUNTS_FILE.
 * Uses bcryptjs cost=10 (same as the app's auth layer).
 * INSERT ... ON CONFLICT (username) DO NOTHING — safe to re-run.
 * NEVER alters schema, NEVER updates/deletes existing rows.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const bcrypt = require(path.join(__dirname, '../node_modules/bcryptjs'));
const { Client } = require(path.join(__dirname, '../node_modules/pg'));

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const MANIFEST     = process.env.DWES_DEMO_ACCOUNTS_FILE?.trim()
  ? path.resolve(process.env.DWES_DEMO_ACCOUNTS_FILE)
  : path.join(__dirname, 'demo-accounts.local.json');
const COST_FACTOR  = 10;

function loadAccounts() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required; no database password fallback is provided');
  }
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      'Private demo account file not found. Copy demo-accounts.example.json to ' +
      'demo-accounts.local.json or set DWES_DEMO_ACCOUNTS_FILE.',
    );
  }
  const accounts = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('Private demo account file must contain at least one account');
  }
  for (const [index, account] of accounts.entries()) {
    for (const field of ['username', 'password', 'role', 'full_name']) {
      if (typeof account?.[field] !== 'string' || !account[field].trim()) {
        throw new Error(`Account ${index + 1} has an invalid ${field}`);
      }
      if (/^<.*>$/.test(account[field].trim())) {
        throw new Error(`Account ${index + 1} still contains the ${field} example placeholder`);
      }
    }
  }
  return accounts;
}

async function main() {
  const accounts = loadAccounts();

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
