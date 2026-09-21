# Rollback — panel_workflow_wa1_planning

Drops **new columns only**. Does not drop W1 tables or rewrite existing stage rows.

```sql
ALTER TABLE "panel_workflow_stages"
  DROP COLUMN IF EXISTS "planned_duration_value",
  DROP COLUMN IF EXISTS "duration_unit",
  DROP COLUMN IF EXISTS "confirmation_required",
  DROP COLUMN IF EXISTS "supervisor_input_required";

ALTER TABLE "panel_workflow_template_stages"
  DROP COLUMN IF EXISTS "default_duration_value",
  DROP COLUMN IF EXISTS "duration_unit",
  DROP COLUMN IF EXISTS "confirmation_required",
  DROP COLUMN IF EXISTS "supervisor_input_required",
  DROP COLUMN IF EXISTS "enabled_by_default";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20260729120000_panel_workflow_wa1_planning';
```
