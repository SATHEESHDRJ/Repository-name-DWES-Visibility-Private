# NO-GO Remediation Evidence Index — 2026-09-21_090437

Continuation of `docs/evidence/master-continuation-2026-09-21_084204/`.

## Identity
| Field | Value |
|-------|-------|
| Branch | `change/technician-single-wire-matrix-2026-07-27` |
| HEAD | `949b6806377e01f9b12229f9292f37026133b7b3` |
| Runtime API image | `dwes-api:oci-restore-20260725` → `f098d4be66eb` |
| Rollback tag | `dwes-api:oci-restore-20260725-rollback-090437` (`d6a77070d6a6`) |
| Ports | nginx `:5275`, API `:3101`, Postgres `:55432` |
| Broken middie9 attempt | `dwes-api:oci-restore-20260725-broken-middie9` (`cace9a654e5b`) — Fastify 5 peer mismatch |

## Phase folders
| Phase | Path | Result |
|-------|------|--------|
| 1 Rebuild | `phase1/` | PASS (portfolio runtime cut/stripped/crimped/ready=4 on image `f098d4be66eb`) |
| 2 LIVE TB auto | `phase2/` | **FAIL / SCHEDULE_DRAWING_MISMATCH** — see `AUTOMATIC_LIVE_TB_VERDICT.md` |
| 3 Security | (package overrides + audits) | **FAIL** — `@fastify/middie` still **critical** on Fastify-4-compatible `8.3.3`; Nest11/Fastify5 required for 9.x. FE `react-router` cleared (root high=0). Backend high≈11 remain. |
| 4 Backup/restore | `phase4/` | PASS portable backup + refuse root/inside-project; disposable dump+auth+isolated PG `:55433` (projects=8). Working stack untouched. |
| 5 CI/CD | `.github/workflows/ci.yml` | **LOCAL WORKFLOW VALIDATED** (structure); **REMOTE CI NOT TESTED** |
| 6 UI AFTER gallery | `phase6/after-gallery/` | 26 PNGs across 5 roles × 5 viewports (+ supervisor status chips). **PENDING OWNER VISUAL ACCEPTANCE** |
| 7 Regression | `phase7/` | See summary logs (typecheck/build/tests) |

## Overall
**Production GO/NO-GO = NO-GO**

Owner still required for: UI gallery visual acceptance; risk acceptance on remaining critical/high; separate production deploy authority.
