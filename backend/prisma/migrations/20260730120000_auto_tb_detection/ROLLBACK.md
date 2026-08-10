# Rollback auto TB detection additive schema

DROP INDEX IF EXISTS "idx_tb_analysis_runs_status";
DROP INDEX IF EXISTS "idx_tb_analysis_runs_panel";
DROP TABLE IF EXISTS "drawing_tb_analysis_runs";

DROP INDEX IF EXISTS "idx_tb_markers_active_rev";

ALTER TABLE "tb_markers"
  DROP COLUMN IF EXISTS "analysis_run_id",
  DROP COLUMN IF EXISTS "marker_status",
  DROP COLUMN IF EXISTS "created_automatically",
  DROP COLUMN IF EXISTS "confidence_score",
  DROP COLUMN IF EXISTS "detection_method",
  DROP COLUMN IF EXISTS "drawing_checksum",
  DROP COLUMN IF EXISTS "drawing_revision";
