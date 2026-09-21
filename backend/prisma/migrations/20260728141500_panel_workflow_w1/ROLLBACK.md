# Rollback — panel_workflow_w1

Reversible by dropping **new tables only** (reverse dependency order).
Does not touch `tech_assignments`, `projects`, `users` data, or any pre-W1 tables.

```sql
DROP TABLE IF EXISTS "panel_workflow_history" CASCADE;
DROP TABLE IF EXISTS "panel_workflow_stage_assignees" CASCADE;
DROP TABLE IF EXISTS "panel_workflow_stage_deps" CASCADE;
DROP TABLE IF EXISTS "panel_workflow_stages" CASCADE;
DROP TABLE IF EXISTS "panel_workflows" CASCADE;
DROP TABLE IF EXISTS "panel_workflow_template_stages" CASCADE;
DROP TABLE IF EXISTS "panel_workflow_templates" CASCADE;
DROP TABLE IF EXISTS "panel_workflow_productivity_defaults" CASCADE;

DELETE FROM "_prisma_migrations" WHERE migration_name = '20260728141500_panel_workflow_w1';
```

Restore full DB from:
`backend/backups/WiringSchemeDB_pre_panel_workflow_w1_*.dump`
