#!/usr/bin/env node
/**
 * CASCADE user purge — runs ONLY after backup + explicit keep-list approval.
 * Deletes non-canonical users and their owned records; reassigns supervisor refs.
 */
import pg from 'pg';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';

const KEEP_USERNAMES = new Set([
  'sysadmin',
  'ops_director1', 'director1',
  'supervisor1',
  'qa1', 'qa2',
  ...Array.from({ length: 24 }, (_, i) => `tech${i + 1}`),
  'tech01', 'tech02', 'tech03', 'tech04', 'tech05',
]);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: allUsers } = await client.query('SELECT id, username, role FROM users ORDER BY id');
const keep = allUsers.filter(u => KEEP_USERNAMES.has(u.username));
const del = allUsers.filter(u => !KEEP_USERNAMES.has(u.username));

if (keep.length !== KEEP_USERNAMES.size) {
  const missing = [...KEEP_USERNAMES].filter(u => !keep.find(r => r.username === u));
  throw new Error(`Keep-list users missing from DB: ${missing.join(', ')}`);
}

const keepIds = keep.map(u => u.id);
const delIds = del.map(u => u.id);
const supervisor1 = keep.find(u => u.username === 'supervisor1');

const report = {
  executed_at: new Date().toISOString(),
  keep: keep.map(u => u.username),
  delete: [],
};

await client.query('BEGIN');
try {
  for (const u of del) {
    const id = u.id;
    const counts = {};

    // Reassign assignments this user assigned (not owned as technician)
    if (supervisor1 && u.username === 'supervisor2') {
      const r = await client.query(
        'UPDATE tech_assignments SET assigned_by = $1 WHERE assigned_by = $2',
        [supervisor1.id, id],
      );
      counts.reassigned_assigned_by = r.rowCount;
    }

    // Null out optional supervisor refs on surviving assignments
    for (const col of ['reviewed_by', 'approved_by', 'rework_requested_by', 'handover_from_id', 'handover_to_id']) {
      const r = await client.query(
        `UPDATE tech_assignments SET ${col} = NULL WHERE ${col} = $1`,
        [id],
      );
      if (r.rowCount) counts[`nulled_${col}`] = r.rowCount;
    }

    // Owned: inspections on assignments where user is technician
    const inspOnAssign = await client.query(`
      DELETE FROM panel_inspections pi
      USING tech_assignments ta
      WHERE pi.assignment_id = ta.id AND ta.technician_id = $1
      RETURNING pi.id
    `, [id]);
    counts.panel_inspections_on_assignments = inspOnAssign.rowCount;

    // Owned: inspections as QC user
    const inspQc = await client.query(
      'DELETE FROM panel_inspections WHERE qc_user_id = $1 RETURNING id',
      [id],
    );
    counts.panel_inspections_as_qc = inspQc.rowCount;

    // Owned: assignments as technician
    const assn = await client.query(
      'DELETE FROM tech_assignments WHERE technician_id = $1 RETURNING id',
      [id],
    );
    counts.tech_assignments = assn.rowCount;

    // Owned: audit log rows
    const audit = await client.query(
      'DELETE FROM tech_audit_log WHERE technician_id = $1 RETURNING id',
      [id],
    );
    counts.tech_audit_log = audit.rowCount;

    // Owned: session log
    const sess = await client.query(
      'DELETE FROM session_log WHERE user_id = $1 RETURNING id',
      [id],
    );
    counts.session_log = sess.rowCount;

    // Delete user account
    const userDel = await client.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
    counts.user = userDel.rowCount;

    report.delete.push({ username: u.username, role: u.role, id, removed: counts });
  }

  // Orphan check: no FK rows pointing at deleted ids
  const orphanChecks = [];
  for (const table of [
    ['session_log', 'user_id'],
    ['panel_inspections', 'qc_user_id'],
    ['tech_assignments', 'technician_id'],
    ['tech_assignments', 'assigned_by'],
    ['tech_audit_log', 'technician_id'],
  ]) {
    const [tbl, col] = table;
    const r = await client.query(
      `SELECT COUNT(*)::int AS c FROM ${tbl} WHERE ${col} = ANY($1::int[])`,
      [delIds],
    );
    orphanChecks.push({ table: tbl, column: col, dangling: r.rows[0].c });
  }
  report.orphan_checks = orphanChecks;

  const dangling = orphanChecks.some(o => o.dangling > 0);
  if (dangling) {
    throw new Error(`Orphan references remain: ${JSON.stringify(orphanChecks.filter(o => o.dangling > 0))}`);
  }

  const { rows: remaining } = await client.query('SELECT username, role FROM users ORDER BY role, username');
  report.remaining_users = remaining;
  report.remaining_count = remaining.length;

  await client.query('COMMIT');
  console.log(JSON.stringify(report, null, 2));

  const outFile = path.resolve(__dirname, '../../DEWS_Backups/pre_user_purge_executed.json');
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.error('Report written:', outFile);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
