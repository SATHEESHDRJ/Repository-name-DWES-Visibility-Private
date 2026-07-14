-- DWES performance indexes — 2026-07 Fastify/perf migration.
--
-- APPLY RULES (dwes-db-guard):
--   * NEVER apply via `prisma migrate` or `prisma db push` — WiringSchemeDB has
--     no migrations baseline and Prisma would offer a destructive reset.
--   * Apply ONLY with explicit user approval, via:  psql -d WiringSchemeDB -f this-file
--   * Afterwards run `prisma db pull` + `prisma generate` in backend/ and verify
--     the schema.prisma diff contains only new @@index lines.
--   * Plain CREATE INDEX takes a brief write lock — fine on the local single-user
--     DB; use CREATE INDEX CONCURRENTLY on any shared environment.
--
-- Selection rationale: covers the measured hot filters (supervisor/director
-- status scans, activity feeds ordered by created_at, duplicate-hash preflight
-- by project+type). Standalone boolean-column indexes (is_hidden,
-- report_submitted) were deliberately excluded as too low-selectivity to earn
-- their write cost. Existing indexes already cover tech_assignments
-- (project_code), (technician_id), session_log (user_id), tech_audit_log
-- (technician_id), file_hashes (file_hash).

CREATE INDEX IF NOT EXISTS idx_tech_assignments_status        ON tech_assignments (status);
CREATE INDEX IF NOT EXISTS idx_tech_assignments_proj_status   ON tech_assignments (project_code, status);
CREATE INDEX IF NOT EXISTS idx_tech_assignments_completed_at  ON tech_assignments (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_assignments_assigned_at   ON tech_assignments (assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_log_created_at         ON session_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_log_project            ON session_log (project_code);
CREATE INDEX IF NOT EXISTS idx_tech_audit_proj_created        ON tech_audit_log (project_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_audit_created_at          ON tech_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_hashes_project_type       ON file_hashes (project_code, file_type);
CREATE INDEX IF NOT EXISTS idx_file_hashes_type               ON file_hashes (file_type);

-- ROLLBACK (same approval rule applies):
-- DROP INDEX IF EXISTS idx_tech_assignments_status;
-- DROP INDEX IF EXISTS idx_tech_assignments_proj_status;
-- DROP INDEX IF EXISTS idx_tech_assignments_completed_at;
-- DROP INDEX IF EXISTS idx_tech_assignments_assigned_at;
-- DROP INDEX IF EXISTS idx_session_log_created_at;
-- DROP INDEX IF EXISTS idx_session_log_project;
-- DROP INDEX IF EXISTS idx_tech_audit_proj_created;
-- DROP INDEX IF EXISTS idx_tech_audit_created_at;
-- DROP INDEX IF EXISTS idx_file_hashes_project_type;
-- DROP INDEX IF EXISTS idx_file_hashes_type;
