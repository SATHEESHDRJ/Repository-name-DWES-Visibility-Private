# Cut / Strip / Crimp portfolio — Phase 0 decision

Date: 2026-09-19  
Source: [Cut/Strip API exploration](5ccbb176-0182-41f9-8343-ca7587b4b04f)

## Finding

| Layer | Status |
|-------|--------|
| Per-assignment prep projection | **Exists** — `getCrimpingReport` / `summarizeCrimpingKpis` (`backend/src/common/crimping-report.ts`, `crimping.ts`, `prep-events.ts`) |
| APIs | `GET /api/supervisor/crimping/:assignmentId`, `.../crimping-report/:assignmentId` (+ tech mirrors) |
| Supervisor UI | `SupervisorCrimpingDataView` — one assignment at a time |
| Cross-panel / portfolio aggregate API | **Does not exist** |
| Status portfolio strip Cut/Stripped/Crimped/Ready | **Not present** (assignment + wiring buckets only) |

## Decision (locked for this goal)

**PARTIAL — do not display a fake portfolio card.**

- Do not invent totals or estimate from unrelated KPIs.
- Do not add supervisor Cut/Strip/Crimp portfolio chips until a separate backend aggregate slice exists, with tests, reconciled against wire-level reports.
- Per-assignment crimping views remain valid and unchanged.

## If later implemented (out of Phase 0)

1. New supervisor-safe roll-up over assignment universe reusing `summarizeCrimpingKpis`.
2. Backend tests + reconcile vs sum of assignment reports.
3. Then UI strip parallel to `sws-portfolio-strip`.
