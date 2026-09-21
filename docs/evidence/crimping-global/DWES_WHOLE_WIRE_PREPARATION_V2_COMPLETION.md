# DWES Whole-Wire Preparation V2 — Completion Evidence

## Tranche 1 — Staged APIs + UI + Reports + Freeze Tests

**Status:** PASS  
**Date:** 2026-09-18  
**HEAD:** `949b6806377e01f9b12229f9292f37026133b7b3` (dirty — uncommitted)  
**Branch:** `change/technician-single-wire-matrix-2026-07-27`

### Domain Layer (prerequisite — already done)

Domain functions in `backend/src/common/crimping.ts`:
- `markWireCut`, `markBothEndsStripped`, `markWireCrimped`
- `resolveLegacyPartial`, `isReadyForWiring`
- V2 KPI fields in `summarizeCrimpingKpis`: `cut`, `stripped`, `crimped`, `legacyPartial`, `openRework`
- `projectWirePrep` includes V2 stage fields

### A) Tech APIs

Routes added in `tech.controller.ts` / `tech.service.ts`:

| Route | Method | Description |
|-------|--------|-------------|
| `POST /api/tech/crimping/cut` | `cutWire` | V2 Stage 1 — mark wire cut to length |
| `POST /api/tech/crimping/strip-wire` | `stripWire` | V2 Stage 2 — mark both applicable ends stripped |
| `POST /api/tech/crimping/crimp-wire` | `crimpWire` | V2 Stage 3 — mark both applicable ends crimped |

All reuse the shared `_stageWirePrep` helper (ownership, `assertPanelReleased`, soft identity, skip rejection, single JSON write, audit + end fan-out, auto-start).

Existing `POST /api/tech/crimping/prepare-wire` preserved as compat/supervisor escape.

### B) Supervisor resolve-legacy-partial

| Route | Method | Description |
|-------|--------|-------------|
| `POST /api/supervisor/crimping/:id/resolve-legacy-partial` | `resolveLegacyPartialForAssignment` | Clears legacyPartial, maps V2 stages, audits `legacy_partial_resolved` |

### C) Frontend API Client

Added to `src/services/api.ts`:
- `techApi.cutWire(assignmentId, cableIndex, opts)`
- `techApi.stripWire(assignmentId, cableIndex, opts)`
- `techApi.crimpWire(assignmentId, cableIndex, opts)`
- `supervisorApi.resolveLegacyPartial(assignmentId, cableIndex)`

### D) Technician UI

**WiringWorkstation.tsx** — Stripping/Crimping modules:
- Stripping module: **Mark Wire Cut** + **Mark Both Ends Stripped** buttons (staged, gate-aware)
- Crimping module: **Mark Wire Crimped** button
- Stage badges: CUT / STRIPPED / CRIMPED / REWORK / READY / LEGACY PARTIAL
- PREPARE WIRE kept as compat/escape for rework + legacyPartial
- Digital Wiring module: PREPARE WIRE prompt when wiring locked, FINISHED gate unchanged

**PrepareWireDrawer.tsx** — Unchanged; kept as whole-wire compat.

**CrimpingGroupView.tsx** — V2 staged bulk actions:
- CUT SELECTED / STRIP SELECTED / CRIMP SELECTED + PREPARE SELECTED (compat)
- Table has CUT column; READY uses `isReadyForWiring`

**wiring-utils.ts** — `summarizeCrimpingStatus` now returns `cut`, `stripped`, `crimped`, `legacyPartial`, `openRework`; `readyForWiring` uses V2 `isReadyForWiring`.

### E) Reports / KPIs / PDF / Director

| File | Changes |
|------|---------|
| `TechnicianCrimpingReport.tsx` | Summary shows Cut/Stripped/Crimped/Legacy Partial/Open Rework |
| `SupervisorCrimpingDataView.tsx` | Meta line shows Cut/Stripped/Crimped/Legacy Partial |
| `DirectorMonitoringPanel.tsx` | Type extended: `crimping_cut`, `crimping_stripped`, `crimping_crimped`, `crimping_legacy_partial`, `crimping_open_rework` |
| `crimping-report.ts` | `CrimpingReportWireRow` has `cut`, `wireStrip`, `wireCrimp`, `legacyPartial`; `readyForWiring` from projected |
| `crimping-report-pdf.ts` | Summary line includes Cut/Stripped/Crimped/Legacy Partial |

### F) Freeze Tests

```
node --test backend/test/crimping.test.cjs backend/test/technician-module-freeze.test.cjs
ℹ tests 48
ℹ pass 48
ℹ fail 0
```

Key freeze assertions:
- V2 staged controls present (`Mark Wire Cut` / `Both Ends Stripped` / `Mark Wire Crimped`)
- Stage badges present (CUT / STRIPPED / CRIMPED / REWORK / READY / LEGACY PARTIAL)
- PREPARE WIRE kept as compat (not primary)
- No four per-end tech completion buttons
- V2 API calls (`cutWire` / `stripWire` / `crimpWire`) in WiringWorkstation
- Frontend API client has staged methods
- Backend controller has V2 routes
- Supervisor controller has `resolve-legacy-partial`
- `wiring-utils` `summarizeCrimpingStatus` has V2 fields

### G) Build Verification

```
npx nest build       → exit 0
npm run build         → exit 0 (tsc -b && vite build)
```

### Verification Commands

```sh
cd DWES/backend && npx nest build
cd DWES && npm run build
cd DWES && node --test backend/test/crimping.test.cjs backend/test/technician-module-freeze.test.cjs
```

### Limitations (Tranche 1)

- No Tranche 2 Live Endpoint code (socket, real-time sync)
- No `.plan.md` files edited
- No commits made
- V2 stage sequencing enforced by domain layer (cut → strip → crimp); UI disables buttons accordingly
- Director monitoring type extended but actual backend aggregation (`director-monitoring.helper.ts`) ships V2 fields only when backend crimping-report already includes them

---

## Tranche 2 — LIVE ENDPOINT VIEW (typed mapping)

**Status:** PASS  
**Date:** 2026-09-18  
**Evidence:** [`../live-endpoint/DWES_LIVE_ENDPOINT_HEADER_GROUP_HIGHLIGHT.md`](../live-endpoint/DWES_LIVE_ENDPOINT_HEADER_GROUP_HIGHLIGHT.md)  
Browser screenshots: Wire 021/D1 red SRC + blue DST header groups on `E01_R1.pdf` (manual INTERNAL_VIEW maps; no BOM highlight).

### 2A — Typed endpoint classification

- `EndpointKind`: `TB_TERMINAL` | `EQUIPMENT_CONNECTOR` | `EQUIPMENT_TERMINAL` | `UNKNOWN`
- FE: `classifyEndpointV2()` / `parseConnectorTerminal()` / `endpointKindBadgeLabel()` in `wiring-utils.ts`
- BE mirror: `backend/src/tb-markers/terminal-range.ts`
- UI rename: **LIVE ENDPOINT VIEW** with mode badges

### 2B–2E — Match, manual maps, diagnostics

- Header-group-only paint; unique-or-fail → `Header group not found`
- Manual maps JSON sidecar (no DDL); Wire 021/D1 PASS with red/blue screenshots

### Tranche 2 tests

```
npm run test:endpoint-v2
ℹ tests 29  pass 29
```

---

## Tranche 1 browser acceptance — STRIPPING + CRIMPING

**Status:** PASS  
**Date:** 2026-09-18  
**Panel:** `=E01_R1` / assignment `66` / tech `tech3`  
**Wire under test:** S.No **202** (index 201), preparation required

### Corrections applied (post-audit)

- Out-of-order stages → **HTTP 409** (`STAGE_ORDER_VIOLATION`)
- `prepare-wire` rejects incomplete stages (`STAGED_PREPARATION_REQUIRED` → 409); not a one-click bypass
- FE/BE `isReadyForWiring` parity (cut + both strip + both crimp, no rework, no legacyPartial, no qaHold)
- UI: Mark Wire Cut / Mark Both Ends Stripped / Mark Both Ends Crimped; staging gates; attribution; inline loader; no auto-advance; “Wire preparation pending.” + GO TO STRIPPING
- Group: CUT/STRIP/CRIMP SELECTED with failed counts; wire-level columns
- Rework `affected_end` SOURCE|DESTINATION|BOTH|GENERAL; re-crimp clears rework **preserving** original by/at
- KPIs: Preparation Required, Cut, Both Ends Stripped, Both Ends Crimped, Ready for Wiring, Open Rework, QA Hold, Legacy Partial
- Supervisor `POST .../qa-hold`

### Browser + API evidence (`v2-browser/`)

| Step | Result | Artifact |
|------|--------|----------|
| DIGITAL WIRING blocked | “Wire preparation pending.”; FINISHED disabled | `01-preparation-pending.png` |
| STRIPPING staging | Cut enabled; Strip disabled until Cut | CDP + UI |
| Cut → Strip → Crimp | Whole-wire badges CUT/STRIPPED/CRIMPED/READY | `05-ready-for-wiring.png` |
| Wiring enabled | FINISHED enabled; pending cleared | same |
| Rework BOTH | REWORK REQUIRED; wiring locked again | `06-rework-blocking.png`, `api-rework-both-wire-201.json` |
| Rework resolved | re-crimp clears; original `crimpedBy=42` kept; unlocked | `api-rework-resolved-wire-201.json` |
| Strip before Cut | **409** | `api-409-strip-before-cut.json` |
| Other tech | **400** Not your assignment | `api-other-tech-blocked.json` |
| Crimping Report KPIs | Whole-wire cards incl. QA Hold / Legacy Partial | `07-crimping-report-kpis.png` |

### Automated tests

```
node --test backend/test/crimping.test.cjs backend/test/rework-clear-stages.test.cjs backend/test/technician-module-freeze.test.cjs
ℹ tests 64  pass 64  fail 0
npx nest build → 0
npm run build → 0
```

---

## Tranche 1 retest — Wire 361 + QA-hold endpoint

**Status:** PASS  
**Date:** 2026-09-18 (session 2)  
**HEAD:** `949b6806` (dirty — qa-hold endpoint added)  
**Wire under test:** S.No **361** (index 360), fresh `crimping.required=true` via supervisor API  

### New endpoint: supervisor QA-hold

```
POST /api/supervisor/crimping/:assignmentId/qa-hold
Body: { cable_indexes: number[], qa_hold: boolean }
Roles: prod_supervisor, qaqc_engineer, system_admin
```
- Added `setQaHoldForAssignment` in `tech.service.ts` (mirrors `setCrimpingRequiredForAssignment`)
- Controller route in `supervisor.controller.ts`
- Sets additive `crimping.qaHold` boolean on `cable_status` JSON; no DDL
- `isReadyForWiring` already returns `false` when `qaHold=true`

### Build + deploy

```
npx nest build       → exit 0
npm run build        → exit 0
docker cp backend/dist → dwes_oci_restore_api_20260725_082028:/app/dist/
docker restart dwes_oci_restore_api_20260725_082028
docker cp dist/. → dwes_oci_restore_nginx_20260725_082028:/usr/share/nginx/html/
```

### Browser + API evidence (`v2-browser/`)

| # | Step | Result | Artifact |
|---|------|--------|----------|
| 1 | DIGITAL WIRING blocked | FINISHED disabled; "Wire preparation pending." + GO TO STRIPPING | `01-digital-wiring-blocked-preparation-pending.png` |
| 2 | STRIPPING staging | Mark Wire Cut enabled; Mark Both Ends Stripped disabled | `02-stripping-cut-stripped-crimped-status.png` |
| 3 | Mark Cut + persist | Cut COMPLETED; after module switch Mark Wire Cut disabled, Mark Both Ends Stripped enabled | API 200 |
| 4 | Mark Both Ends Stripped | `wireStrip.status=COMPLETED`, `overall=PARTIAL`, `wiring_locked=true` | API 200 |
| 5 | Mark Both Ends Crimped | `wireCrimp.status=COMPLETED`, `overall=COMPLETED`, `wiring_locked=false`, `readyForWiring=true` | API 200 |
| 6 | FINISHED enabled | Green FINISHED button; no preparation warning | `06-finished-enabled-after-crimp.png` |
| 7 | Rework BOTH (supervisor) | FINISHED disabled again; preparation pending returned; RE-PREPARE WIRE visible | `07-finished-disabled-after-rework.png` |
| 8 | Re-prepare wire | FINISHED re-enabled; `cleared_rework=true`; reworkHistory preserved | `08-finished-re-enabled-after-reprepare.png` |
| 9 | Crimping Report KPIs | Req=3, Cut=3, Stripped=2, Crimped=2, Ready=2, Rework=0, Progress=66.7% | `09-crimping-report-kpi-final.png` |

### API JSON evidence (inline)

**409 strip-before-cut:** `{"code":"STAGE_ORDER_VIOLATION","message":"Wire must be cut before stripping","cable_index":360}`

**Rework BOTH:** `overall=REWORK_REQUIRED, ready_for_wiring=false, reworkHistory[].role=prod_supervisor`

**Re-prepare:** `overall=COMPLETED, wiring_locked=false, readyForWiring=true, cleared_rework=true`

### Limitations (session 2)

- Step 10 cross-tech 403 not re-run (already verified in session 1 for Wire 201)
- QA-hold endpoint added (backend) but not browser-exercised (no UI trigger yet)
- Session expired once during testing; re-login with `EvidenceCapture1!` succeeded

---

### Final verdict

| Tranche | Verdict |
|---------|---------|
| Tranche 1 staged prep + reports + **browser workflow** (Wire 202 + Wire 361) | **PASS** |
| Tranche 2 Live Endpoint + header-group browser | **PASS** |
| **Overall V2** | **PASS** |
