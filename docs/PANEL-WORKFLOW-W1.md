# Panel Workflow — Phase W1

Additive foundation for panel-level production workflow planning.
Does **not** change technician wiring, `tech_assignments`, corrections, uploads, or reports.

## A–M summary

See plan `panel_workflow_w1`. W1 delivers domain models, migration, Nest APIs, permissions, audit history, and tests only (no Supervisor UI / W2–W5).

## Entities (new tables only)

| Table | Purpose |
|-------|---------|
| `panel_workflows` | One optional workflow per `(project_code, frame_id)` |
| `panel_workflow_stages` | Ordered stages for a workflow |
| `panel_workflow_stage_deps` | Prerequisite edges (cycle-checked) |
| `panel_workflow_stage_assignees` | Stage assignee links to `users` |
| `panel_workflow_history` | Append-only audit events |
| `panel_workflow_templates` / `_template_stages` | Reusable templates (copy-on-apply in W2) |
| `panel_workflow_productivity_defaults` | Editable planning targets (global or per project) |

Soft link to panels: `(project_code, frame_id)` — no requirement that a workflow exists for assignment.

## Migration

- Folder: `prisma/migrations/20260728141500_panel_workflow_w1/`
- SQL: CREATE TABLE / INDEX / FK only
- Rollback: `ROLLBACK.md` (DROP new tables only)
- Pre-migration backup: `backend/backups/WiringSchemeDB_pre_panel_workflow_w1_*.dump`
- **No seed rows** — planning defaults come from code (`PLANNING_DEFAULTS`) until Supervisor saves a DB row

### Applied locally

```
prisma migrate resolve --applied 20260717121500_live_3d_twin_phase1
prisma migrate deploy   # applied 0_init (empty) + panel_workflow_w1
```

Host URL used for migrate: `127.0.0.1:55432` (OCI restore Postgres port map).

## APIs (`/api/panel-workflow`)

| Method | Path | Roles |
|--------|------|-------|
| GET | `/by-panel?project_code&frame_id` | admin, supervisor, director, QA |
| POST | `/` create workflow | admin, supervisor |
| GET | `/:id` | read roles |
| PUT | `/:id` | write roles |
| DELETE | `/:id` | soft-archive (`ARCHIVED`) |
| GET | `/:id/history` | read |
| POST | `/:id/stages` | write |
| PUT | `/stages/:stageId` | write |
| DELETE | `/stages/:stageId` | write |
| POST | `/:id/dependencies` | write |
| DELETE | `/dependencies/:depId` | write |
| POST | `/stages/:stageId/assignees` | write |
| DELETE | `/assignees/:assigneeId` | write |
| GET/POST/DELETE | `/templates`… | read/write |
| GET/PUT | `/productivity-defaults` | read/write |

On create, service copies **8 in-memory standard stages** + recommended deps (durations left null).

## Configurable planning defaults (code)

| Field | Default |
|-------|---------|
| regular_hours_per_day | 10 |
| target_wires_per_day | 220 |
| target_wires_per_hour | 22 |
| wire_delay_warning_minutes | 15 |

Unclear handwritten stage durations are **not** hardcoded.

## Verification

- Prisma schema validate: OK
- Migration SQL reviewed: additive only
- Existing `tech_assignments` count unchanged after migrate
- Unit tests: `backend/test/panel-workflow.w1.test.cjs`
- Frontend: thin `panelWorkflowApi` in `src/services/api.ts` only — no Workflow UI change

## Rollback

See `prisma/migrations/20260728141500_panel_workflow_w1/ROLLBACK.md` or restore the `pg_dump -Fc` backup.
