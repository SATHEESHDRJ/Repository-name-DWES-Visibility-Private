# DWES Handoff — 2026-08-10

**Audience:** ChatGPT, Cursor, GitHub Copilot, Codex, Cline, humans  
**Repo:** `C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/02_GIT_PRODUCTION_SOURCE/DWES`  
**Branch:** `change/technician-single-wire-matrix-2026-07-27`  
**HEAD:** `949b6806377e01f9b12229f9292f37026133b7b3`  
**Master memory:** [`DWES_AGENT_MEMORY.md`](../../DWES_AGENT_MEMORY.md) · Start file: [`AGENTS.md`](../../AGENTS.md)

---

## TODAY COMPLETED

- Phase 9B Step 0 (Copilot): DB foundation verification; migration blocker documented; mocked-DB path chosen.
- Phase 9B analysis + mocked pipeline + generic tests A–H (Cursor).
- LIVE TB rule: reference/description = WHAT; physical layout = WHERE (code + tests).
- Match classify fix: equipment header passed so TERM `X*` ≠ TB_GROUP.
- Technician sidebar: single primary active; **single open function/modal** via `activeTechnicianFunction`.
- Shared agent memory files created (this handoff + master memory).

## TODAY IN PROGRESS / DEFERRED

- Real PostgreSQL `ga_device_locations` apply (blocked by migration).
- Phase 9C Match DEVICE geometry paint (`queryDeviceGeometry` unused for paint; message still “Device resolution not yet implemented”).
- Python worker `device_hits` emission (contract ready; producer may lag).

## TODAY VERIFIED

- `node --test test/*.cjs` (backend): **305 pass / 0 fail** (2026-08-10 memory session).
- `ga-device-location-pipeline` + `tb-group-contract`: **34/34 pass**.
- Code presence: `activeTechnicianFunction`, `ga-device-locations/*`, `samePhysicalDeviceEntity`, tag-over-model ranking.

## CURRENT BLOCKERS

1. Migration `20260717121500_live_3d_twin_phase1` — missing `device_geometries` relation.
2. Match DEVICE paint path not wired.
3. Large dirty tree (~161 status lines) — preserve.

## NEXT TASK

**Phase 9C — Wire Match/LIVE TB paint to `queryDeviceGeometry` for DEVICE ends** (no drive-by migration repair; keep Phase 7 DEVICE≠TB safety).

## TEST STATUS

| Suite | Result |
|-------|--------|
| `backend` `node --test test/*.cjs` | **305 / 305 PASS** |
| Phase 9B + TB contract pair | **34 / 34 PASS** |
| Copilot claim “279/279” | **STALE** — do not reuse |

## FILES MOST IMPORTANT

- `DWES_AGENT_MEMORY.md`, `AGENTS.md`
- `src/pages/technician/TechnicianDashboard.tsx`
- `backend/src/ga-device-locations/device-location-analysis.ts`
- `backend/src/tb-markers/endpoint-resolution.ts`
- `backend/src/tb-markers/tb-marker-match.service.ts`
- `backend/test/ga-device-location-pipeline.test.cjs`
- `backend/prisma/schema.prisma` (`ga_device_locations`, 3D CAD tables)

## DO-NOT-BREAK RULES

- No fake LIVE TB coordinates / Demo-as-real.
- No DEVICE↔TB geometry cross-matching.
- Equipment tag primary; model/type supporting only.
- One Technician sidebar popup at a time; applied filters may persist closed.
- No destructive git / commit / push / deploy without explicit approval.
- Do not rewrite agent memory from scratch — update facts only.
