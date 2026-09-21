# Rollback — 20260729140000_panel_workflow_director_upgrade

```sql
ALTER TABLE "panel_workflow_stages"
  DROP COLUMN IF EXISTS "terminology_unconfirmed",
  DROP COLUMN IF EXISTS "is_legacy";

ALTER TABLE "panel_workflows"
  DROP COLUMN IF EXISTS "planning_template_version";

ALTER TABLE "panel_workflow_templates"
  DROP COLUMN IF EXISTS "version";
```

Local restore only. Do not apply rollback on production without explicit approval.
