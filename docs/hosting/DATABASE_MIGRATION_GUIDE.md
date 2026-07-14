# DWES Database Migration Guide (Local WiringSchemeDB → Cloud)

**Date: 2026-07-13.** Execute only after the approval gate. Governed by the db-guard rules: **the app never migrates WiringSchemeDB's schema** — no `prisma migrate`/`db push`, ever. Migration = dump + restore, then point `DATABASE_URL` at the new home.

## Facts that shape the migration (measured 2026-07-13)
- Source: PostgreSQL **18.3**, database `WiringSchemeDB`, **9.5 MB**, 7 tables (users 36, projects 8, tech_assignments 3, session_log 989, tech_audit_log 15, panel_inspections 0, file_hashes 6). A migration takes seconds, not hours.
- No Prisma migrations exist; the schema travels inside the dump.
- Target of record (Option C): **Neon free tier — Postgres 18 GA** (exact major-version match; no downgrade needed).

## Path A — PG 18 target (Neon, or any self-run postgres:18 container) — preferred

Run from the local PC (has `pg_dump`/`pg_restore` 18 at `C:\Program Files\PostgreSQL\18\bin`):

```powershell
# 1. Fresh dump (custom format), source untouched (read-only operation)
pg_dump.exe "<LOCAL_DATABASE_URL>" -Fc -f WiringSchemeDB.cutover.dump

# 2. Restore into the cloud DB (connection string from the provider dashboard, includes sslmode=require)
#    --no-owner/--no-privileges: cloud providers don't have the local Windows role names
pg_restore.exe --no-owner --no-privileges --clean --if-exists `
  -d "<CLOUD_DATABASE_URL>" WiringSchemeDB.cutover.dump
```

Connection strings are secrets: paste them from the provider dashboard into the command, never into Git, docs, or chat logs.

## Path B — PG 17 target (Supabase, or other lagging managed PG) — fallback only

A v18 **custom-format** dump will not restore into v17. Use plain SQL instead:

```powershell
pg_dump.exe "<LOCAL_DATABASE_URL>" --format=plain --no-owner --no-privileges -f WiringSchemeDB.cutover.sql
psql.exe "<CLOUD_DATABASE_URL>" -f WiringSchemeDB.cutover.sql
```

The 7-table schema uses no PG-18-only features (verified: plain types, JSON columns, standard indexes), so plain SQL restores cleanly into 17. Caveat: review any `SET` header lines psql complains about (safe to ignore `transaction_timeout`-style GUCs absent in 17).

## Verification (mandatory, both paths)

```sql
-- On the CLOUD database — counts must match the pre-migration source exactly
SELECT 'users', count(*) FROM users UNION ALL
SELECT 'projects', count(*) FROM projects UNION ALL
SELECT 'tech_assignments', count(*) FROM tech_assignments UNION ALL
SELECT 'session_log', count(*) FROM session_log UNION ALL
SELECT 'tech_audit_log', count(*) FROM tech_audit_log UNION ALL
SELECT 'panel_inspections', count(*) FROM panel_inspections UNION ALL
SELECT 'file_hashes', count(*) FROM file_hashes;
```
Then an application-level check: point a **staging** API instance's `DATABASE_URL` at the cloud DB, hit `/api/health` (runs `SELECT 1`), log in, open a project, verify a technician's assignment scoping still works.

## Least-privilege app account (do at restore time)
Create a dedicated role for the API with CRUD on the 7 tables and **no DDL** (matches db-guard). On Neon: create a second role/branch-scoped password; the admin connection string stays offline for migrations/backups only.

## Cutover choreography
1. Announce freeze; stop the local backend (prevents writes during dump).
2. Dump → restore → verify counts (above).
3. Update the cloud API's `DATABASE_URL` secret; restart; smoke-test.
4. **Local DB stays untouched and running** — it is the rollback until `FINAL_DEPLOYMENT_CHECKLIST.md` signs off. Rollback = repoint DNS/env back to local; any rows written in the cloud interim are re-migrated by re-running the dump in reverse (cloud→local) — document the decision if writes happened.

## Ongoing
- Nightly `pg_dump` of the **cloud** DB → R2 (see `BACKUP_AND_RESTORE_RUNBOOK.md`).
- Version policy: stay on PG 18 everywhere; when the cloud provider offers 19+, upgrade deliberately (dump/restore or provider upgrade path), never automatically.
- session_log growth (~1–5 MB/yr) is negligible; the admin "Clear Session Log" (backup-first) op remains available.
