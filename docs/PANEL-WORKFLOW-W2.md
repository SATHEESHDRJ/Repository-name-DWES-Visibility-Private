# Panel Workflow — Phase W2 (Supervisor Planning UI)

## Scope

W2 upgrades the Production Supervisor **Workflow** action from the Assign Technician popup into a panel-level planning workspace.

- **Does not** change technician wiring execution, `tech_assignments` KPI formulas, Mid Change, Correction Centre, or reports.
- **Does not** enforce dependency start blockers (W3) or alert engine (W4).
- **Does not** seed unclear handwritten stage durations as permanent rules.

## Entry point

- [`TechnicianWorkflowModal.tsx`](../src/components/supervisor/TechnicianWorkflowModal.tsx) now exports [`PanelWorkflowWorkspaceModal.tsx`](../src/components/supervisor/PanelWorkflowWorkspaceModal.tsx).
- Assign Technician remains available as the **Assignments** tab via embedded [`PanelAssignmentModal.tsx`](../src/components/supervisor/PanelAssignmentModal.tsx) (`embedded` prop). Schedule-missing warning is unchanged.

## Tabs

1. Workflow Plan — stage cards, enable/rename/add/reorder, planned duration/dates, template apply
2. Assignments — wiring assign + stage-scoped assignees
3. Time & Productivity — editable planning defaults + wiring estimate
4. Dependencies — list + simple diagram
5. Actual Progress — read-only wiring snapshot + stage actual placeholders
6. Delays & Alerts — stage delay list; W4 alert engine placeholder
7. History — `panel_workflow_history`

## API additions (no schema migration)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/panel-workflow/ensure` | Create workflow if missing; return existing |
| GET | `/api/panel-workflow/estimate` | Planning estimate only (no DB write) |
| POST | `/api/panel-workflow/:id/apply-template` | Copy template into panel workflow (`replace` / `merge`) |

Estimate formula:

```
estimated_hours = total_wires ÷ (target_wires_per_hour × efficiency_factor) ÷ technician_count
estimated_working_days = estimated_hours ÷ productive_hours_per_day
```

## Planning defaults

Code defaults (editable): regular hours/day 10, wires/day 220, wires/hour 22, wire-delay warning 15 minutes. UI labels them as configurable planning values.

## Verification

```bash
cd backend && npx tsc -p tsconfig.build.json
node --test test/panel-workflow.w1.test.cjs test/panel-workflow.w2.test.cjs
cd .. && npm run build
```

Manual: open Supervisor → Projects → select panel → **Workflow** → confirm tabbed workspace (not bare Assign-only title). Assignments tab still blocks assign without schedule.

## Rollback

W2 is additive UI + API methods. Revert FE entry to `PanelAssignmentModal` and remove ensure/estimate/apply-template routes if needed. No W2 Prisma migration.
