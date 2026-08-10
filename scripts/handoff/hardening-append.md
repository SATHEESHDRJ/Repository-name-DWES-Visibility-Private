

## Automated test matrix

Consolidated regression evidence (2026-07-17, branch `migration/fastify-perf-ios`). Backend suite runs in `backend/`; focused frontend suites from repo root.

| Suite | Command | Tests | Result |
|-------|---------|-------|--------|
| Backend (all) | `npm --prefix backend test` | 137 | **137 / 137 PASS** |
| Operational 3D utils | `npm run test:ot3d` | 26 | **26 / 26 PASS** |
| Cable twin classification | `npm run test:twin` | 7 | **7 / 7 PASS** |
| State consistency | `npm run test:state` | 4 | **4 / 4 PASS** |
| Panel selection | `npm run test:panels` | 10 | **10 / 10 PASS** |
| Schematic layout | `npm run test:schematic` | 5 | **5 / 5 PASS** |
| PWA install smoke | `npm run test:pwa` | 3 | **3 / 3 PASS** |
| **Focused frontend subtotal** | — | **55** | **55 / 55 PASS** |
| **Combined (backend + focused)** | — | **192** | **192 / 192 PASS** |

### Build and static checks

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `npm run typecheck` | PASS |
| Frontend production build | `npm run build` | PASS (exit 0) |
| Lint | `npm run lint` | PASS (exit 0; warnings only) |
| Prisma schema | `npm --prefix backend run prisma validate` | PASS |
| Production deps audit | `npm audit --omit=dev` | 0 vulnerabilities |

### Notes

- Backend OT3D unit cases are included in the **137** backend count (not double-counted in `test:ot3d`, which covers frontend utilities).
- Pilot-only gaps (DEF-003, DEF-004, DEF-005) are **not** covered by this matrix — see production blockers above.
- Master twin handoff: `docs/DWES-LIVE-3D-TWIN-PROJECT-COMPLETION-REPORT.md`.