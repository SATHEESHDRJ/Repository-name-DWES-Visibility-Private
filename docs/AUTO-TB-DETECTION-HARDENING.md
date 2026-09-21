# Automatic TB Detection — Phase 5 hardening notes

## Regression gates (manual / CI)

- Login and role dashboards unchanged.
- Wiring complete/skip/pause/Mid Change unchanged; LIVE TB open/close must not call wiring mutation APIs.
- Technician POST/PUT/DELETE `/api/tb-markers` remains forbidden.
- Drawing upload still succeeds if analysis enqueue fails.
- Original GA checksum unchanged after analysis and after Completed LIVE TB Report download.

## Feature flags

| Flag | Effect |
| ---- | ------ |
| `DWES_TB_GROUP_MATCH=0` | Rollback: match SOURCE/DEST only |
| `DWES_DRAWING_INTELLIGENCE_URL` | Python FastAPI worker |
| `DWES_PYTHON` | Python executable for CLI |
| `DWES_TB_ADVANCED_AI=1` | Phase 4 stubs in worker |
| `DWES_TB_SHAPE=1` | OpenCV hooks |

## Rollout

1. Apply migration `20260730120000_auto_tb_detection`.
2. `npx prisma generate` in backend.
3. Restart API.
4. Optionally start drawing-intelligence worker.
5. Upload panel 2d GA → watch `tb-analysis/status`.
