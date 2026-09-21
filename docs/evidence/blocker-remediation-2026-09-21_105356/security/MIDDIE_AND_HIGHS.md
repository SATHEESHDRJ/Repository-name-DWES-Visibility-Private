# Security — @fastify/middie and remaining highs

## Runtime use of `@fastify/middie`

| Item | Finding |
|------|---------|
| Dependency path | `dwes-backend` → `@nestjs/platform-fastify@10.4.x` → `@fastify/middie@8.3.3` |
| Direct app import | **None** — DWES `main.ts` does not `require('@fastify/middie')` |
| Nest middleware | **None** — no `MiddlewareConsumer`, no `app.use()` Express middleware |
| Nest registration | `FastifyAdapter.init()` calls `registerMiddie()` unless `skipMiddie` |
| Change applied | `skipMiddie: true` in `backend/src/main.ts` so Nest **does not load** middie at boot |
| CVE surface | Path-scoped middleware bypass (GHSA-cxrg-g7r8-w69p family) — requires middie middleware to be registered |

### Preferred remediation order outcome

| Option | Result |
|--------|--------|
| (a) Remove if unused | **Runtime unused** with `skipMiddie`. Package remains a transitive install of Nest 10 Fastify adapter. |
| (b) Replace with hooks | App already uses Fastify `addHook('onRequest', …)` for cache headers — no Express bridge needed. |
| (c) Nest 11 / Fastify 5 | **Required** to take `@fastify/middie@>=9.3.4` (audit: vulnerable `<=9.3.1`). Not executed this session (isolated major migration). |

**No owner risk acceptance recorded.** Security gate remains **FAIL** while npm audit still reports critical middie on disk and other highs.

## Fresh production dependency scan (backend `--omit=dev`)

Observed after this session’s tree:

- **1 critical:** `@fastify/middie` (via `@nestjs/platform-fastify`)
- **11 high:** `@fastify/ajv-compiler`, `@nestjs/platform-fastify`, `@prisma/config`, `brace-expansion`, `deepmerge-ts`, `fast-json-stringify`, `fast-uri`, `fastify`, `minimatch`, `mysql2`, `prisma`
- Frontend/root omit-dev high/critical: **0** (`react-router@7.18.4`)

### High findings (documentation — not accepted)

| Package | Path (typical) | Notes |
|---------|----------------|-------|
| fastify / find-my-way / ajv-compiler / fast-uri / fast-json-stringify | `@nestjs/platform-fastify` → `fastify@4.x` | Major Fastify 5 with Nest 11 |
| @nestjs/platform-fastify | direct | Nest 10 Fastify URL encoding advisory — Nest 11 |
| brace-expansion / minimatch | tooling transitive | Override attempted; residual paths remain |
| prisma / @prisma/config / deepmerge-ts | `prisma@7.x` | Prisma major/config bump |
| mysql2 | transitive (if present) | Not DWES primary driver (Postgres); still flagged |

## Boot / smoke after `skipMiddie`

Requires API image rebuild containing `main.ts` change. Evidence to attach after rebuild: `/api/health`, login, crimping-portfolio (portfolio already proven prior; re-smoke only).
