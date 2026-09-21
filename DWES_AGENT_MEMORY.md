# DWES AGENT MEMORY

**Last Updated:** 2026-08-10 (afternoon, Asia/Dubai)  
**Repository:** `C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/02_GIT_PRODUCTION_SOURCE/DWES`  
**Branch:** `change/technician-single-wire-matrix-2026-07-27`  
**HEAD:** `949b6806377e01f9b12229f9292f37026133b7b3`  
**Working tree:** Dirty — **~161** short-status lines (modified + untracked). **Preserve all uncommitted work.**

This file is the durable shared memory for Cursor, GitHub Copilot, ChatGPT, Codex, Cline, and other coding agents.

---

## 1. How Every Agent Must Start

1. Read **this file** (`DWES_AGENT_MEMORY.md`) first.
2. Verify: `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse HEAD`, `git status --short`.
3. Work **only** in the authoritative DWES path above.
4. Preserve all existing uncommitted work — no `reset` / `clean` / `stash` / force checkout unless the human explicitly orders it.
5. Host ports are locked in `C:\dev\PROJECT_PORT_REGISTRY.md` (until 10-Feb-2027). Read that file; do not renumber or auto-fallback. Only re-check a port on conflict.
6. API health path is **`/api/health`** (not bare `/health`).
7. No commit / push / merge / tag / OCI deploy / DB wipe without explicit human approval.
8. After significant verified work, **update this file** (see § Memory Update Policy) — do not rewrite from scratch.

---

## 2. Current Project State

DWES is an active multi-role wiring execution product (Technician / Supervisor / Director) with LIVE TB (terminal-block / device physical location on GA drawings).

Today’s AI-assisted work (Copilot + Cursor) advanced:

- Technician UX (single-wire matrix, filters, single-modal sidebar functions)
- LIVE TB physical vs reference mapping rules (code + tests)
- Phase 9A/9B DEVICE 2D location domain (`ga_device_locations`) with **mocked** persistence tests
- Supervisor LIVE TB readiness UI pieces
- Director monitoring (read-only)

**Real PostgreSQL** application of new DEVICE location migrations remains **blocked** by a pre-existing migration defect (see §9).

---

## 3. Locked Product Decisions

| Decision | Rule |
|----------|------|
| Reference vs physical | Reference/description/BOM/type tables = **WHAT** (semantic only). Physical GA layout = **WHERE** (final geometry only). |
| Never fake geometry | No invented coordinates; unresolved stays unresolved. |
| TB highlight | Physical TB **strip/group**, not reference-table row. Terminal number is metadata. |
| DEVICE identity | Schedule **equipment tag** is primary `physicalIdentity`. Model/type (e.g. REB650) is supporting evidence only. |
| No X* TB inference on equipment | Equipment header + TERM like `X329/12` → `DEVICE_TERMINAL`, **not** TB_GROUP from string shape. |
| Same device both ends | One shared DEVICE body (`samePhysicalEntity`); separate terminal refs. |
| Phase 7 type safety | DEVICE must never consume TB marker geometry; TB must never consume DEVICE geometry. |
| 3D CAD vs 2D GA | `device_geometries` / `terminal_geometries` = 3D CAD. `ga_device_locations` = 2D GA DEVICE. Do not repurpose 3D tables for LIVE TB paint. |
| Source / Destination colour | Source **red**, Destination **blue** (consistent throughout). |
| Independent endpoints | Resolve SRC and DST independently; one may succeed while the other is unresolved. |
| Demo | Demo/baseline overlays must not masquerade as real LIVE TB path. |

---

## 4. Technician Dashboard

### Accepted behaviour (current)

- Digital Wiring Schedule embedded when assignment is active.
- Single-wire matrix + tablet/full views; action bar (Previous/Next/Skip/Open Side/Finished/Correction/Pause/Resume).
- Filters: Tag Cable-Wise, Skipped Wire, Equipment; Internal Device Looping modal.
- Sidebar: **primary** nav uses exclusive `is-active`; **applied filters** use `is-filter-applied` (badge/dot) — not the same as popup-open.

### Single active function / modal (verified in code)

**Requirement:** Only **one** sidebar function popup open at a time.

**Implementation:** `activeTechnicianFunction` in `src/pages/technician/TechnicianDashboard.tsx`:

`TAG_FILTER | SKIPPED_FILTER | EQUIPMENT_FILTER | INTERNAL_DEVICE | null`

Opening one **replaces** the previous. Close/Cancel/Apply → `null`.  
Applied filter **data** (`tagQuery`, `equipmentQuery`, `scheduleFilter`) is **not** cleared merely by closing/switching popups.

**LIVE TB** stays on separate `liveTbOpen` (not in the enum).

**CSS:** `html.tech-fn-modal-open` insets modal overlays so the sidebar rail stays clickable (`design-system.css`).

**Files:** `TechnicianDashboard.tsx`, `Sidebar.tsx`, `design-system.css`, filter popup components, `scripts/smoke-sidebar-single-modal.mjs`.

---

## 5. Supervisor Dashboard

- Panel status / resources / panel workflow tabs / project info actions remain in the dirty tree.
- LIVE TB readiness UI: `LiveTbSupervisorPanel.tsx`, `LiveTbPanelStatusStrip.tsx` (untracked/new).
- Do not break panel assignment or workflow history contracts without explicit approval.

---

## 6. Director Dashboard

- **Read-only** monitoring: Live Project Status, Status Report, One-Side/Open-End, Employee Performance, People Working Now.
- Director must not upload / edit wiring / assign technicians.
- Related code: `DirectorDashboard.tsx`, `DirectorMonitoringPanel.tsx`, `director.service.ts`, `director-monitoring.helper.ts`.

---

## 7. LIVE TB / GA Mapping

### Reference table = semantic evidence (WHAT)

Use Device Reference / Description / Type tables only to understand identity (TB vs device, description, model).  
**Never** highlight or persist the table-row bbox as LIVE TB geometry.

### Physical GA layout = geometry (WHERE)

Final geometry only from physical views (e.g. LEFT/RIGHT SIDE, INTERNAL, REAR, FRONT physical, EQUIPMENT_MOUNTING, PHYSICAL_TB_BANK).

Reject final geometry from: DEVICE REFERENCE table, DESCRIPTION table, BOM, LEGEND, TITLE BLOCK, schematic-only.

### TB mapping

Schedule `X5A-C` / terminal `15` → classify TB identity from schedule + semantic tables → locate **physical strip** `X5A-C` → `physicalKind = TB_GROUP`, highlight complete strip. Terminal `15` = metadata (cell geometry not required).

### DEVICE mapping

Schedule equipment `87STUB`, terminal `X329/12` → `endpointType = DEVICE_TERMINAL`, `physicalIdentity = 87STUB`, model e.g. `REB650` = supporting only → highlight complete physical device body. Label pattern: `SRC · 87STUB` / header `SRC DEVICE 87STUB · TERM X329/12`.

### Same physical entity

SRC and DST same equipment tag → one DEVICE bbox; `samePhysicalDeviceEntity` helper in `device-location-analysis.ts`.

### Locator hierarchy (no string guessing)

1. Exact physical DEVICE or TB_GROUP  
2. Proven physical terminal group **only if evidence links it to equipment**  
3. Proven equipment/panel zone  
4. UNRESOLVED  

### Phase 7

Regression: equipment fixtures must never match as physical TBs (`tb-group-contract` / equipment-never-matches-TB).

### Match status (current)

- Classification fixed to pass equipment header so TERM `X*` is not TB_GROUP (`endpoint-resolution.ts`, `tb-marker-match.service.ts`).
- DEVICE **geometry paint** still: *“Device resolution not yet implemented.”* → **Phase 9C**.

---

## 8. Phase 9 DEVICE Location

| Phase | Status |
|-------|--------|
| **9A** | Schema + repository + service + Match DI for `ga_device_locations`. 3D CAD tables untouched. |
| **9B** | Pure analysis + orchestrator + mocked persistence tests; hook from drawing-tb-analysis. Tag-over-model, reference reject, tests A–H. |
| **9C** | **Next:** Match/`queryDeviceGeometry` paint path (real PG still blocked by migration). |
| Worker `device_hits` | Analysis contract ready; Python worker emission may still be incomplete. |

**Key paths:** `backend/src/ga-device-locations/*`, `backend/test/ga-device-location-pipeline.test.cjs`.

Metrics honesty: `real_postgresql_ga_device_locations_write_verified: false` until real PG verified.

---

## 9. Database / Migration State

**Blocker:** migration `20260717121500_live_3d_twin_phase1` fails — relation **`device_geometries` does not exist** (PostgreSQL 42P01). Pre-existing; blocks new migrate apply / shadow DB.

**Do not** “fix” this migration as a drive-by during unrelated tasks.

**Consequence:** Real `ga_device_locations` table apply **unverified**. Phase 9B proceeds with **mocked** repository in tests.

`device_geometries` / `terminal_geometries` remain 3D CAD domain in `schema.prisma`.

---

## 10. Current Tests

**Verified 2026-08-10 (this memory session):**

```text
node --test test/*.cjs   (backend/)
ℹ tests 305
ℹ pass 305
ℹ fail 0
```

Also: `ga-device-location-pipeline.test.cjs` + `tb-group-contract.test.cjs` → **34/34 PASS** (includes generic A–H + DEVICE≠TB).

**Contradiction:** Copilot session summary claimed **279/279** earlier today — that number is **stale**. Prefer **305/305** until the next full suite run updates this section.

Typecheck/build: not re-run in this memory-only session; last Cursor Phase 9B session reported backend build OK.

---

## 11. Known Blockers

1. Migration chain: `20260717121500_live_3d_twin_phase1` / missing `device_geometries` → real PG DEVICE location writes unverified.
2. Match DEVICE geometry paint still unimplemented (classification OK; paint deferred to Phase 9C).
3. Large dirty working tree (~161 status lines) — agents must not destroy it.
4. Redis may be N/A locally (expected degraded / SSE `mode:pg`) — do not treat as a new regression without checking.

---

## 12. Next Approved Work

**Phase 9C — Wire Match / LIVE TB paint to `queryDeviceGeometry` for DEVICE ends.**

Constraints: keep Phase 7 type safety; no migration repair in that task unless explicitly approved; no fake geometry; no Demo as real path.

---

## 13. Do Not Do

- Hardcode project-specific regression values (87STUB / X5A-C are examples only)
- Invent LIVE TB coordinates
- Use Demo/baseline as production LIVE TB
- Lower HIGH auto-verify gates without approval
- Match DEVICE endpoints to TB markers (or vice versa)
- Destructive git (`reset --hard`, `clean -fd`, force push, stash drop) without explicit order
- Commit / push / OCI deploy without explicit approval
- Wipe DB / Docker volumes
- Repurpose 3D `device_geometries` for 2D LIVE TB
- Rewrite this memory file from scratch each session

---

## 14. Today's Change Log — 10 Aug 2026

### Copilot (session `5600efa3-…`)

- Phase 9B Step 0: database foundation verification docs
- Documented migration `20260717121500` / `device_geometries` missing
- Established mocked-DB workaround for Phase 9B
- Session reports under `~/.copilot/session-state/5600efa3-…/files/`

### Cursor (same day)

- Full app health / LIVE TB visual probes (reports under verification scripts/tmp)
- Technician sidebar single primary active (`is-filter-applied` vs `is-active`)
- Phase 9B DEVICE analysis + mocked pipeline + tests A–H
- LIVE TB GA reference-vs-physical rule enforcement in analysis + Match classify fix
- Technician **single active sidebar function** (`activeTechnicianFunction`)
- Director F2F Word notes on Desktop (outside repo; tooling only)
- This shared agent memory + handoff

### Classification snapshot (dirty tree themes)

| Area | Notes |
|------|--------|
| A Technician | Matrix, filters, single modal, LIVE TB modal |
| B Supervisor | LIVE TB strips/panels, workflow UI |
| C Director | Monitoring panel / service helpers |
| D LIVE TB / GA | drawing-tb-analysis, tb-markers, overlays |
| E Phase 9 DEVICE | `ga-device-locations/*` |
| F DB / Prisma | schema has `ga_device_locations`; migrate blocked |
| G UI | Sidebar, design-system, dashboards |
| H Tests | Many new `backend/test/*.cjs` + FE tests |
| I Docs | LIVE-TB-*.md, PANEL-WORKFLOW-*.md, this memory |
| J Blockers | Migration; Match DEVICE paint |

---

## Memory Update Policy

After each significant **verified** work session:

1. Read existing memory.  
2. Do **not** rewrite from scratch.  
3. Update only changed facts.  
4. Remove or mark stale facts.  
5. Record verified test evidence (command + counts).  
6. Keep unresolved blockers.  
7. Do not store speculative ideas as facts.  
8. Keep detailed temporary debugging in session reports/handoffs, not here.

### Source priority when conflicts arise

1. Actual current repository / runtime evidence  
2. Current automated tests  
3. Latest approved product decision  
4. This file (`DWES_AGENT_MEMORY.md`)  
5. Latest handoff/checkpoint  
6. Older reports/plans  

Never let an old report override current verified code.
