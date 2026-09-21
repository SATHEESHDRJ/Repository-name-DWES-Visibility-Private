# Phase 0 — Automatic TB Detection Impact Review

**Status:** Signed off for Phase 1+ implementation  
**Date:** 2026-07-30  
**Scope:** Universal Automatic TB Group Detection + LIVE TB VIEW (no schema/API writes in Phase 0 itself)

## Compatibility review

| Area | Current | Required change | Risk |
| ---- | ------- | --------------- | ---- |
| `validateMarkerType` | `SOURCE_GROUP` \| `DESTINATION_GROUP` only | Add `TB_GROUP` | Low — additive |
| Match filters | Filters by SOURCE vs DEST type | Match `TB_GROUP` for both endpoints; keep legacy types | Medium — must not break legacy |
| FE `TbMarkerType` | Two literals | Add `TB_GROUP` | Low |
| LIVE TB overlay | Assumes source/dest candidates | Colour by wire role; overview mode later | Low |
| Legacy markers | May exist as SOURCE/DEST | Remain readable forever | None if dual-match |
| Auth / wiring | Unrelated | **No change** | — |

## API contract (Phase 1)

- Create/update accept `marker_type: TB_GROUP`.
- Match Source: `TB_GROUP` \| `SOURCE_GROUP` with device + terminal range.
- Match Destination: `TB_GROUP` \| `DESTINATION_GROUP` similarly.
- Active markers for LIVE TB must match current `drawing_revision` + `drawing_checksum` when set.

## Rollback plan

1. Stop enqueueing `drawing_tb_analysis`.
2. Revert match filter to SOURCE/DEST-only (feature flag `DWES_TB_GROUP_MATCH=0`).
3. Leave `TB_GROUP` rows in DB (harmless if match disabled) or mark `SUPERSEDED`.
4. Frontend continues to work with empty match → safe banners.

## File-level implementation list

### Backend
- `backend/prisma/schema.prisma` — `TB_GROUP` fields + `drawing_tb_analysis_runs`
- `backend/src/tb-markers/*` — type validation, match, auto-persist
- `backend/src/drawing-tb-analysis/*` — job orchestration, Nest validate/store
- `backend/src/upload/upload.service.ts` — enqueue after 2d upload
- `backend/drawing-intelligence/` — Python worker (text/OCR/shape)
- `backend/test/tb-group-contract.test.cjs` (+ analysis/report tests)

### Frontend
- `src/types/tbMarker.ts`, `src/types/liveTbView.ts`
- `src/components/technician/LiveTbViewModal.tsx`
- `src/components/technician/DrawingMarkerOverlay.tsx`
- `src/pages/technician/TechnicianDashboard.tsx` — freeze snapshot, remove debug
- `src/services/api.ts` — analysis status + report download

## Decisions locked

- Extend with `TB_GROUP` (do not dual-write SOURCE+DEST clones).
- HIGH-only auto persist; LOW/AMBIGUOUS never display a guess.
- Original GA never modified.
- Phase 4 advanced AI and Phase 6 report are additive; Phase 6 does not change LIVE TB Modes A/B.
