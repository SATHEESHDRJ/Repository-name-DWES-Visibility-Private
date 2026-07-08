#!/usr/bin/env node
/**
 * Read-only dry-run: list all users and dependent record counts.
 * Does NOT delete anything.
 */
import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/WiringSchemeDB';

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: users } = await client.query(`
  SELECT id, username, role, full_name, employee_id, is_active, created_at, last_login
  FROM users
  ORDER BY role, username
`);

const summary = { generated_at: new Date().toISOString(), total_users: users.length, users: [] };

for (const u of users) {
  const id = u.id;
  const [
    assignments_as_tech,
    assignments_assigned_by,
    assignments_reviewed_by,
    assignments_approved_by,
    assignments_rework_by,
    audit_logs,
    session_logs,
    inspections_as_qc,
    inspections_via_assignment,
  ] = await Promise.all([
    client.query('SELECT COUNT(*)::int AS c FROM tech_assignments WHERE technician_id = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM tech_assignments WHERE assigned_by = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM tech_assignments WHERE reviewed_by = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM tech_assignments WHERE approved_by = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM tech_assignments WHERE rework_requested_by = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM tech_audit_log WHERE technician_id = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM session_log WHERE user_id = $1', [id]),
    client.query('SELECT COUNT(*)::int AS c FROM panel_inspections WHERE qc_user_id = $1', [id]),
    client.query(`
      SELECT COUNT(*)::int AS c FROM panel_inspections pi
      JOIN tech_assignments ta ON ta.id = pi.assignment_id
      WHERE ta.technician_id = $1
    `, [id]),
  ]);

  const owned = {
    tech_assignments_as_technician: assignments_as_tech.rows[0].c,
    tech_assignments_assigned_by: assignments_assigned_by.rows[0].c,
    tech_assignments_reviewed_by: assignments_reviewed_by.rows[0].c,
    tech_assignments_approved_by: assignments_approved_by.rows[0].c,
    tech_assignments_rework_requested_by: assignments_rework_by.rows[0].c,
    tech_audit_log: audit_logs.rows[0].c,
    session_log: session_logs.rows[0].c,
    panel_inspections_as_qc: inspections_as_qc.rows[0].c,
    panel_inspections_on_owned_assignments: inspections_via_assignment.rows[0].c,
  };

  const cascade_total =
    owned.tech_assignments_as_technician +
    owned.tech_audit_log +
    owned.session_log +
    owned.panel_inspections_as_qc +
    owned.panel_inspections_on_owned_assignments;

  summary.users.push({
    ...u,
    owned,
    cascade_delete_estimate: cascade_total + 1,
    reference_only_counts: {
      assigned_by: owned.tech_assignments_assigned_by,
      reviewed_by: owned.tech_assignments_reviewed_by,
      approved_by: owned.tech_assignments_approved_by,
      rework_requested_by: owned.tech_assignments_rework_requested_by,
    },
  });
}

const byRole = {};
for (const u of summary.users) {
  byRole[u.role] = (byRole[u.role] || 0) + 1;
}
summary.by_role = byRole;

const outDir = path.resolve(__dirname, '../../DEWS_Backups');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `pre_user_purge_dryrun_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
writeFileSync(outFile, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({ outFile, total_users: summary.total_users, by_role: summary.by_role }, null, 2));

// Compact table for users with any owned records
const withData = summary.users.filter(u => u.cascade_delete_estimate > 1);
console.log('\nUsers with owned records (cascade impact > account only):');
for (const u of withData) {
  console.log(`  ${u.username} (${u.role}): assignments=${u.owned.tech_assignments_as_technician} audit=${u.owned.tech_audit_log} sessions=${u.owned.session_log} inspections=${u.owned.panel_inspections_as_qc + u.owned.panel_inspections_on_owned_assignments}`);
}

await client.end();
