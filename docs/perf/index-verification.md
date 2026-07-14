# Index verification — 2026-07 performance indexes

Status: **PENDING — DDL not applied.** `scripts/sql/2026-07-perf-indexes.sql` is
committed but must not be executed until the user explicitly approves it
(dwes-db-guard HARD STOP). This document records the methodology and, once the
DDL is applied, the before/after query plans.

## Why not `prisma migrate`

`backend/prisma/` holds only an introspected `schema.prisma` — there is no
migrations baseline. Running `prisma migrate dev` against WiringSchemeDB would
offer a destructive reset. The only allowed Prisma commands are `db pull` and
`generate`; DDL goes through a reviewed SQL script applied with `psql -f`.

## Verification method (per index)

1. Capture the real SQL Prisma emits for the hot query (one-off scratch run
   with `new PrismaClient({ log: ['query'] })`, read-only).
2. In psql, record `EXPLAIN (ANALYZE, BUFFERS)` **before** applying the DDL.
3. Apply the DDL (after approval), re-run the same `EXPLAIN (ANALYZE, BUFFERS)`.
4. On the small local dataset the planner may still pick Seq Scan — that is
   expected and not a failure. Additionally record the plan under
   `SET enable_seqscan = off;` to prove the index is usable, and note
   estimated-vs-actual row counts.
5. Re-run `node scripts/benchmark-api.mjs` on the same demo dataset and compare
   endpoint timings against `docs/perf/baseline-express.json`.

## Post-apply schema sync

```
cd backend
npx prisma db pull
npx prisma generate
git diff prisma/schema.prisma   # must contain ONLY added @@index lines
```

## Captures

_To be filled after the DDL is approved and applied._

| Query | Before (plan / ms) | After (plan / ms) |
|-------|--------------------|-------------------|
| —     | —                  | —                 |
