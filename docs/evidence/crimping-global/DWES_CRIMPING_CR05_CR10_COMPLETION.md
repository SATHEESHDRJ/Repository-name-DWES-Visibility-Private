# DWES Crimping CR-05 → CR-10 Completion

**Date:** 2026-09-04  
**Stack:** OCI local restore — UI http://localhost:5275 · API http://127.0.0.1:3101  
**Scope:** Global (all projects / panels / technicians). E01+R1 fixture-only.

## Architecture

```
CANONICAL WIRE (Frame Cable + mapping)
        +
cable_status[i].crimping (nested strip/crimp + optional reworkHistory)
        ↓
getCrimpingReport (backend/src/common/crimping-report.ts)
        ├── Technician Crimping Report
        ├── Supervisor Crimping Data View
        ├── Director monitoring KPIs
        ├── QA/QC rework (same JSON)
        └── Formal PDF (crimping-report-pdf.ts)
```

Technician modules remain **frozen**: DIGITAL WIRING | STRIPPING | CRIMPING | CRIMPING REPORT.

## Routes

| Method | Path | Role |
|---|---|---|
| GET | `/api/tech/crimping-report/:id` | owning technician |
| GET | `/api/supervisor/crimping-report/:assignmentId` | supervisor/QA/director |
| GET | `/api/supervisor/crimping-report/:assignmentId/pdf` | supervisor/QA/director |
| POST | `/api/supervisor/crimping/:assignmentId/required` | supervisor |
| POST | `/api/supervisor/crimping/:assignmentId/rework` | supervisor/QA |
| GET | `/api/director/monitoring` | includes crimping_* KPIs per panel |

## RBAC

- Technician report: `ForbiddenException` if `technician_id !== actor`
- Supervisor/Director/QA: existing `@Roles` on supervisor/director controllers
- Rework: supervisor + qaqc_engineer + system_admin only
- Director: read-only (no mark strip/crimp/required/rework)

## KPIs

Centralized in `summarizeCrimpingKpis`:

- Denominator = **Crimping Required** (never total wires unless all required)
- End counts: source/destination stripped & crimped (labeled separately)
- Added: `rework`, `openSource`, `openDestination`

## Rework (no DDL)

- `markPrepReworkRequired` sets end status `REWORK_REQUIRED`
- Appends `reworkHistory[]` (previousStatus, reason, setBy, setAt, role)
- Preserves original strippedBy/At / crimpedBy/At
- `deriveOverall` → REWORK_REQUIRED → READY FOR WIRING false
- `legacyWiringCompleted` not rewritten
- Audit via existing `tech_audit_log` action `crimp_rework`

## PDF

- Landscape A4 via PDFKit + existing branding
- Summary + wide table + per-required-wire detail pages
- SRC/DST columns never collapsed; missing legs → NOT AVAILABLE

## SSE / Pause

- Existing assignment SSE + `emitWorkflowChanged` after prep mutations
- Module/view restored from `sessionStorage` (`dwes_tech_workspace_module`)
- No WebSockets; no full page reload required for refetch patterns

## Tests / verification commands

```bash
cd backend
npx nest build
node --test test/crimping.test.cjs test/crimping-report.test.cjs test/technician-module-freeze.test.cjs

cd ..
npm run build
```

API health: `GET http://127.0.0.1:3101/api/health`

## Limitations

- Live cross-technician Forbidden probe still requires two auth tokens in CR-10 manual matrix
- Supervisor Status crimping KPI strip uses report/summary on open; director monitoring carries panel rollups including `crimping_rework`
- No WiringSchemeDB DDL introduced

## 2026-09-18 finish (CR-07 UI)

- Supervisor + QA Crimping Data: Mark Strip/Crimp Rework with reason; reworkHistory shown in detail
- Report projection includes `reworkHistory`; Rework filters on supervisor + technician reports
- Tech KPI strip + Director consolidated table surface rework counts
- QA entry: Inspection Form → Crimping Data (`allowSetRequired=false`)

## Final status

CR-05 → CR-10 implemented on restore codebase with freeze guards, multi-project T1–T5 retained, PDF + rework (API **and** Supervisor/QA UI) + director KPIs + Supervisor Data View.

## Follow-on (2026-09-18)

Whole-wire technician interaction: see `DWES_WHOLE_WIRE_PREPARATION_COMPLETION.md` (PREPARE WIRE replaces four per-end clicks; per-end data model unchanged).
