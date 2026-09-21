# DWES Whole-Project Security Review

Date: 2026-07-17

## Severity summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 3 |
| Informational | 4 |

## Critical/High

None identified in verified paths.

## Medium

M1: Authenticated multi-role browser E2E not executed in hardening agent (pilot required).
M2: Tablet 3D FPS not hardware-measured (pilot required).

## Low

L1: Oxlint warnings remain (unused vars, Fast Refresh exports) — pre-existing.
L2: my_wires 3D filter incomplete (technicianId missing on status).
L3: Load/concurrency benchmarks not run in this pass.

## Verified controls

- JWT_SECRET required, weak secret rejected (auth.module.ts, jwt.strategy.ts)
- Production NODE_ENV requires JWT_SECRET (main.ts)
- .env gitignored
- Vite dev server fs.deny for .env, uploads, seeds (vite.config.ts)
- All API controllers use JwtAuthGuard (+ RolesGuard on role routes)
- sales_director blocked (users-rbac.ts, sales-director-rbac.test.cjs)
- SSE JwtAuthGuard + canReceiveEvent role/panel filter (events.controller.ts)
- LibreDWG shell:false external process only
- GA upload tests: traversal, fake MIME, cross-panel
- No dangerouslySetInnerHTML in src
- Demo endpoints 404 unless DEMO_MODE=true
- Helmet registered on Fastify
