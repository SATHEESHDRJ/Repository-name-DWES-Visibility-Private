# Digital Twin Revision Workflow

## The Golden Rule of Revisions

**A new revision of any single source file requires a new incremented package manifest.**

DWES relies on strict immutability for the Digital Twin. If a device moves physically in the panel, or if the 2D Approved GA drawing is updated, the entire `model_revision` must increment.

## Workflow

1. **Initial Release**: Package `M01` is created. Manifest contains `modelRevision: "M01"`.
2. **Review & Rejection**: If DWES integration teams reject `M01` due to validation failures, Chennai must correct the errors and resubmit as `M02`.
3. **Physical Change**: If the panel is modified mid-production, the schedule increments to `R02`. Chennai must update `device-geometry.csv` and `panel-metadata.csv` to reflect `R02`, and submit the package as `M03`.

## Concurrency
Do not submit multiple model revisions simultaneously for the same panel.
DWES will always bind the active Technician Dashboard to the *latest approved* model revision for that specific panel.
