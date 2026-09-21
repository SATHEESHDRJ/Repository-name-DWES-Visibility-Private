# Security — Nest 11 / Fastify 5 middie closure

Evidence stamp: `final-two-blockers-2026-09-21_112345`  
Branch: `security/nest11-fastify5` (local only — not pushed)

## Dependency path (proven)

| Stage | Path |
|-------|------|
| **BEFORE (Nest 10)** | `dwes-backend` → `@nestjs/platform-fastify@10.4.22` → **`@fastify/middie@8.3.3`** (npm audit CRITICAL) |
| Mitigation only | `skipMiddie: true` in `main.ts` — does not remove package from disk |
| **AFTER (Nest 11)** | `@nestjs/platform-fastify@11.1.29` → `fastify@5.11.0` — **`@fastify/middie` ABSENT** from `npm ls` / container `require.resolve` |
| Nest 11 note | Adapter vendors an optional middie clone under `adapters/middie/`; DWES keeps `skipMiddie: true` and registers no Express middleware |

Artifacts: `middie-BEFORE.txt`, `middie-AFTER.txt`, `npm-audit-backend-omit-dev-FINAL.json`

## Changes applied

- Nest packages → `^11.1.29` (+ jwt/passport/cli/schematics 11)
- `@fastify/multipart` → `^9`, `@fastify/helmet` → `^13`
- Removed `@fastify/middie` override
- Overrides: `brace-expansion@2.1.7`, `fast-uri@3.1.8`, `deepmerge-ts@8.0.2`, `mysql2@3.24.4`
- Prisma → `^7.10.0`
- JWT `expiresIn` typed for Nest 11 / jsonwebtoken types

## Audit (backend `--omit=dev`) FINAL

- **critical: 0**
- **high: 0**
- moderate: 4 (fastify ≤5.12.0, uuid via exceljs) — residual moderate only; **no owner risk acceptance recorded**
- Root FE omit-dev: 1 moderate (fflate)

## Runtime

- Image: `dwes-api:oci-restore-20260725-nest11`
- Container: `dwes_oci_restore_api_20260725_082028` (prior renamed `*_pre_nest11`)
- Health: `200` `db:ok` (degraded: redis unset — expected on restore)
- `middie ABSENT`, `platform-fastify 11.1.29`, `fastify 5.11.0`

**No production deploy. No owner security risk acceptance.**
