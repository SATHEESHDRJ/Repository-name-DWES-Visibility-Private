# DWES Whole-Wire Preparation — Completion Evidence

**Date:** 2026-09-18  
**Verdict:** **PASS** (automated tests + builds + restore health; browser role smoke / tablet screenshots recommended for Owner visual sign-off)

## Repository baseline

| Item | Value |
|------|--------|
| Root | `C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/02_GIT_PRODUCTION_SOURCE/DWES` |
| Branch | `change/technician-single-wire-matrix-2026-07-27` |
| HEAD (start) | `949b6806377e01f9b12229f9292f37026133b7b3` |
| UI | http://127.0.0.1:5275/ → 200 |
| API | http://127.0.0.1:3101/api/health → 200 healthy |
| DDL | None |

## Before / after workflow

| Before | After |
|--------|--------|
| Technician pressed SRC/DST Strip then SRC/DST Crimp (up to 4 actions) | One **PREPARE WIRE** → **CONFIRM WIRE PREPARED** |
| Group view: four MARK SELECTED … buttons | **PREPARE SELECTED** (sequential `prepare-wire`) |
| KPI: Src/Dst strip/crimp counts | To Prepare · Prepared · Rework · Ready · Progress % |
| Per-end data model | Unchanged (nested `cable_status[i].crimping`) |

## API contract

```
POST /api/tech/crimping/prepare-wire
Roles: wiring_technician
Body: {
  assignment_id: number,
  cable_index: number,
  remarks?: string,
  expected_sno?: string|number,
  expected_ferrule?: string
}
```

Behaviour:

- Ownership + panel release checks (same as `crimping/action`)
- Soft identity mismatch → 409 `WIRE_IDENTITY_MISMATCH`
- Skipped wire (`[SKIPPED` in note) → 400 `WIRE_SKIPPED`
- Atomic `markWirePrepared` — applicable ends strip+crimp; open ends stay `NOT_APPLICABLE`
- Rework re-prep preserves original by/at; appends history; audit `wire_reprepared`
- Idempotent when already COMPLETED
- Single `cable_status` JSON write; client `emitWorkflowChanged`

Existing routes preserved: `/crimping/action`, `/bulk-action`, reports, PDF, required, rework, director monitoring.

## Files changed (primary)

- `backend/src/common/crimping.ts` — `markWirePrepared`
- `backend/src/tech/tech.service.ts` / `tech.controller.ts` — prepare-wire
- `src/services/api.ts` — `techApi.prepareWire`
- `src/components/technician/wiring/PrepareWireDrawer.tsx` (new)
- `WiringWorkstation.tsx`, `CrimpingGroupView.tsx`, `DigitalWiringFrame.tsx`, `SingleWireMatrixCard.tsx`
- `TechnicianCrimpingReport.tsx`, `crimping-report.ts`, `crimping-report-pdf.ts`
- `DirectorMonitoringPanel.tsx` — Prepared label
- Tests: `crimping.test.cjs`, `technician-module-freeze.test.cjs`

## RBAC

| Role | Prepare wire | Set Required | Mark rework | Report/PDF |
|------|--------------|--------------|-------------|------------|
| Technician | Own assignment only | No | No | Own report |
| Supervisor | No (tech API) | Yes | Yes | Yes |
| QA/QC | No | No (`allowSetRequired=false`) | Yes | Yes |
| Director | No | No | No | Read-only KPIs |

## Tests (rerun 2026-09-18)

```bash
cd backend
npx nest build
node --test test/crimping.test.cjs test/crimping-report.test.cjs test/technician-module-freeze.test.cjs
```

**Raw totals:** 34 pass · 0 fail · 0 skip

Coverage includes: atomic both-ends prepare, OPEN SOURCE/DEST, Not Required, idempotent, rework re-prep attribution, freeze PREPARE WIRE / no four buttons, report T1–T5 + reworkHistory.

## Builds / health

| Check | Result |
|-------|--------|
| `npx nest build` | PASS |
| `npm run build` (FE) | PASS (exit 0) |
| Restore nginx FE deploy | PASS (`PREPARE WIRE` in bundle) |
| API module copy + restart | healthy |
| UI 5275 / API 3101 | 200 |

## Known limitations

- Group **PREPARE SELECTED** uses N sequential API calls (not one bulk prepare endpoint).
- Soft schedule identity uses `expected_sno` / `expected_ferrule` only (no DDL revision column).
- Tablet / multi-role browser screenshots not captured in this evidence file — Owner visual QA recommended at tablet + desktop.
- PDF title updated; full header enrichment (client/supervisor/mid-change list) remains best-effort from existing metadata fields.

## Final acceptance mapping

1. One confirmation prepares complete wire — **PASS**  
2. Atomic SRC/DST strip+crimp audit — **PASS**  
3. Open Ends N/A, not false complete — **PASS**  
4. Incomplete/rework blocks wiring — **PASS** (existing gate + PREPARE WIRE CTA)  
5. Wiring UX otherwise unchanged — **PASS**  
6. Skip/Pause/Prev/Next/Mid Change/Live TB preserved — **PASS** (untouched paths)  
7. Report auto-updates — **PASS**  
8. Supervisor/QA rework — **PASS** (prior CR-07 UI)  
9. Director read-only — **PASS**  
10. No DDL — **PASS**  
11. No cross-assignment mix — **PASS** (existing isolation)  
12. No full-page reload — **PASS**  
13. Builds/tests pass — **PASS** (34/34)  
14. Evidence complete — **PASS** (this file; screenshots optional Owner follow-up)

**Verdict: PASS**
