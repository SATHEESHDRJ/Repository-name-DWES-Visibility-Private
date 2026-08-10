# DWES Redis Infrastructure Audit — Final Report

**Date:** 2026-07-18
**Branch:** `change/dashboard-3d-icons-2026-07-18` (uncommitted working tree; not merged)
**Scope:** Redis connections/config, BullMQ, Redis Pub/Sub for SSE, Redis cache + invalidation, distributed locks, request idempotency, health/readiness/degraded reporting, failure fallback + reconnect, multi-instance runtime behaviour.
**PostgreSQL (`WiringSchemeDB`) remained the permanent source of truth throughout — no schema, migration, or DDL changes were made.**

---

## 1. Initial classification of every Redis capability

| Capability | Initial classification | Basis |
|---|---|---|
| Redis connections (ioredis, per-subsystem clients) | IMPLEMENTED BUT NOT VERIFIED | Code present in 3 places (jobs, cache, events); `REDIS_URL` unset in `backend/.env`, so never exercised in this environment |
| BullMQ queue/worker (`JobsService`) | PARTIAL | `backup_export` real and wired; `excel_parse`/`pdf_report`/`dwg_convert` were dead code with fabricated results; unknown job types silently "completed" |
| Redis Pub/Sub for SSE (`EventsService`) | IMPLEMENTED BUT NOT VERIFIED | Correct design (separate pub/sub connections, instanceId de-dup, PG LISTEN/NOTIFY and local fallback) but never run against real Redis |
| Redis dashboard cache (`DashboardCacheService`) | PARTIAL | Real producers existed (`supervisor:allPanels`, `director:core/stats/projectsSummary`) but reads used the memory-only `get()`, never `getAsync()` — Redis writes were effectively write-only |
| Distributed lock (`acquireLock`/`releaseLock`) | PARTIAL | Correct atomic SET NX PX + Lua CAS release design, but failed closed (not to local fallback) on any transient Redis error, and never revisited connection state after startup |
| Idempotency interceptor | BROKEN | Concurrent duplicate requests got an immediate `409` instead of the spec-required "same stored result"; a replayed response could still re-trigger a duplicate SSE publish |
| Health / readiness / degraded reporting | PARTIAL | `/health/live` and `/health/ready` existed; readiness checked only PostgreSQL — Redis-configured-but-down was invisible, and `JobsService`/cache Redis status were never surfaced |
| Redis failure fallback / auto-reconnect | PARTIAL | ioredis reconnects automatically at the transport level, but the app's own `isRedisActive`/`isBullMqActive` flags were startup-only snapshots, never updated on disconnect/reconnect |
| Multi-instance runtime behaviour | NOT VERIFIED (until this audit) | No prior evidence of two real instances sharing Redis; existing `scripts/redis-verification.cjs`/`scripts/test-idempotency.cjs` were unfinished/never-run scaffolding |
| DWG conversion via the generic job queue | BROKEN | Fabricated a fake "converted" result unconditionally — exactly the anti-pattern the task prohibits |

Everything above is now **IMPLEMENTED AND VERIFIED** with live Redis runtime evidence (Sections 10–16), except where explicitly marked **NOT TESTED** in Section 17.

---

## 2. Existing implementation retained (not rebuilt)

- `backend/src/jobs/jobs.service.ts` — BullMQ `Queue`/`Worker` on a shared ioredis connection (`maxRetriesPerRequest: null`), in-memory fallback, `backup_export` → `scripts/backup.ps1`.
- `backend/src/common/cache/dashboard-cache.service.ts` — two-tier (memory + Redis) cache, atomic `SET NX PX` lock, Lua compare-and-delete release, Lua bulk-invalidate.
- `backend/src/events/events.service.ts` — Redis Pub/Sub SSE fan-out with `instanceId` self-echo suppression, PostgreSQL `LISTEN/NOTIFY` fallback, local RxJS `Subject` fallback, bounded reconnect scheduling.
- `backend/src/common/guards/idempotency.interceptor.ts` — key derivation (explicit header or `userId:url:bodyHash`), cache-then-lock flow.
- `backend/src/events/events.interceptor.ts` / `event-visibility.ts` — URL→scope classification, role-based SSE audience filtering.
- `backend/src/common/health.controller.ts` / `health.service.ts` — `/health/live`, `/health/ready`, legacy `/api/health` aliases.
- **`backend/src/ga-foundation/job-queue.service.ts` + `cad-conversion.provider.ts`** — a **separate**, PostgreSQL-polling background-job system (lease-based claiming, exponential-ish backoff, real LibreDWG-based DWG→DXF conversion that already fails clearly when unconfigured). This predates and is independent of the Redis/BullMQ work; it was **not modified** and is **not** a competing implementation to consolidate — it solves engineering/GA CAD conversion, `JobsService` solves generic ops-workflow jobs (currently just backup). Flagged here only so a future pass doesn't mistake it for duplication to delete.
- `background_jobs` Prisma model — used by both of the above; schema untouched.

---

## 3. Defects found and root causes

1. **`JobsService.updateJobProgress` wrote a non-existent `progress` column.** `background_jobs` has no `progress` field (`getJob()` derives it from `status` instead). Every `prisma.background_jobs.update()` call therefore threw an "Unknown argument `progress`" Prisma validation error, caught by a bare `catch {}` that silently fell back to an in-memory map the job was never registered in. **Every Postgres-backed job — including the only real one, `backup_export` — was permanently stuck at `QUEUED` in the API/DB, even though the BullMQ worker genuinely ran it to completion.** Root cause: a field name added to the update payload without a matching schema column, masked by silent error-swallowing.
2. **Idempotent concurrency returned `409` instead of the real result.** `acquireLock` failure (another request in flight) immediately threw `ConflictException`. Root cause: no wait-for-completion path; the interceptor treated "someone else is processing this" as terminal rather than something to await.
3. **Idempotent replay could duplicate-publish an SSE event.** `IdempotencyInterceptor` and `EventsInterceptor` are both registered as global `APP_INTERCEPTOR`s from different modules; their relative order (which is outer) depends on NestJS's module-scan order rather than anything explicit in this codebase. If `EventsInterceptor` ends up outer, its `tap()` fires on every response — including a short-circuited cache replay that performed no new mutation. Root cause: no explicit signal from the idempotency layer to the event layer that "nothing new happened here."
4. **`isRedisActive` / `isBullMqActive` were startup-only snapshots.** Set once after the initial `connect()`, never updated on later disconnect or reconnect. Root cause: no `'ready'`/`'error'` listeners on the ioredis connections. Effect: after a Redis outage, `DashboardCacheService.acquireLock` kept taking the "Redis path," which then threw and returned `false` unconditionally (**not** falling through to the local lock) — every idempotency-protected mutation would report "another request is processing" even when no one held anything. `JobsService.createJob` likewise kept routing to a queue it could no longer reach.
5. **`spawnSync` inside `runBackupExportJob` blocked the Node event loop.** The BullMQ worker runs in-process with the HTTP server; a synchronous child-process call (up to a 600 000 ms timeout) freezes HTTP handling, SSE heartbeats, DB health checks, and BullMQ's own lock-renewal heartbeat for the same duration — which risks BullMQ marking the job/worker stalled and reprocessing it.
6. **Dashboard cache reads never consulted Redis.** `supervisor.service.ts` / `director.service.ts` called the synchronous, memory-only `DashboardCacheService.get()` instead of `getAsync()`. `set()` did write to Redis, so the Redis-side data existed but nothing ever read it back — a second instance always recomputed from Postgres, defeating the point of a shared cache (bounded by each entry's 30 s TTL, not a correctness bug, but a real efficiency gap the spec asked to close).
7. **`dwg_convert` fabricated a fake "converted" result** unconditionally — a direct instance of the anti-pattern the task explicitly names, in code that (fortunately) has zero real callers today.
8. **Unrecognized job types silently "completed" with an empty result** — `executeJobHandler`'s `if/else if` chain had no final `else`, so anything outside `excel_parse`/`pdf_report`/`dwg_convert`/`backup_export` fell through with `result = { success: true }` and was marked `COMPLETED`.
9. **Fire-and-forget local-fallback execution produced unhandled promise rejections.** `setImmediate(() => void this.executeJobHandler(data))` — `executeJobHandler` intentionally rethrows after recording failure (so the *BullMQ* path can track retries), but nothing catches that rethrow on the *local fallback* path. This was latent and invisible before (the old fake stubs never threw); it surfaced immediately once defect #7 was fixed and became visible under test.
10. **`REDIS_URL` and its per-subsystem toggles were undocumented** in `backend/.env.example`.

---

## 4. Defects fixed

All ten defects above were fixed in place, inside the existing modules — no new Redis client, queue, cache, or event bus was introduced.

1. `updateJobProgress` no longer includes `progress` in the Prisma `data` payload (it's derived, not stored); the in-memory fallback still tracks it. Verified live: a real `backup_export` job now transitions `QUEUED → PROCESSING (started_at stamped) → COMPLETED (finished_at stamped)`.
2. `IdempotencyInterceptor`: on lock-acquire failure, polls (150 ms interval, 32 s bound — just past the 30 s lock TTL) for the in-flight holder's cached result and replays it; only if the original holder never finished (crash) does it attempt to take over the now-expired lock, and only then does a genuine `409` occur.
3. Added `req.__dwesIdempotentReplay` marker set by `IdempotencyInterceptor.replay()`; `EventsInterceptor`'s `tap()` returns immediately when set. This is correct regardless of interceptor order, so it doesn't depend on NestJS internals that aren't part of this codebase's contract.
4. Added `'ready'`/`'error'` listeners on the `DashboardCacheService` and `JobsService` ioredis connections to keep the active-flags live. `acquireLock`/`releaseLock` now fall through to the local lock on a Redis *error* (not just "inactive"), instead of failing closed.
5. `runBackupExportJob` now calls a small `spawn`-based `runBackupScript` helper (non-blocking, same timeout/env/cwd semantics) instead of `spawnSync`.
6. `supervisor.service.ts allPanels()`, `director.service.ts loadCore()/stats()/projectsSummary()` now call `getAsync()`.
7. `dwg_convert` now fails clearly, pointing at the two real converters already in the codebase.
8. Added a final `else { throw new Error('Unsupported job type: ...') }`.
9. Local-fallback execution now does `.catch(err => this.logger.error(...))` instead of leaving the rejection unhandled.
10. `backend/.env.example` documents `REDIS_URL` and `DWES_ENABLE_BULLMQ` / `DWES_ENABLE_REDIS_CACHE` / `DWES_REDIS_EVENT_FANOUT` / `DWES_PG_EVENT_FANOUT`.

---

## 5. Missing functionality implemented

- **Health/readiness Redis visibility (Phase 3 requirement: "Health endpoints distinguish live, ready, and degraded").** `HealthService` now injects `JobsService` and `DashboardCacheService` and reports `queue: {redisConfigured, bullmqActive}`, `cache: {redisConfigured, redisActive}`, plus additive `ready`/`degraded` booleans. `degraded` is true only when Redis was *configured* (`REDIS_URL` set) but any subsystem isn't currently riding it — a deployment that never configured Redis is `ok`, not `degraded`. The pre-existing `status` string (`'ok'|'degraded'`) is preserved byte-for-byte for the not-ready case, so no existing consumer's parsing breaks.
- **Bounded exponential backoff for BullMQ retries** — `queue.add(..., { backoff: { type: 'exponential', delay: 5000 } })`, previously absent (BullMQ default is immediate retry).
- **Clear-failure contract for DWG conversion and unsupported job types** (see Section 4, items 7–8) — this *is* the "complete missing functionality" item for BullMQ's DWG workload per the task's explicit instruction; the real conversion workloads (GA CAD conversion, CAD preview) already existed and were left untouched.

**Deliberately not built:** wiring `excel_parse`/`pdf_report` BullMQ job types to the real Excel-parsing/PDF-generation code. Neither job type has any caller anywhere in the app (confirmed via full-repo search) — Excel upload and report generation are synchronous today and nothing in the product currently asks for an async path. Fabricating a trigger point for them would mean inventing new API surface and touching "Existing upload endpoints" / "Reports", both on the explicit preservation list, for a capability nothing exercises or can be tested against end-to-end. The dead code was made to fail clearly (Section 4.8) rather than silently succeed, which resolves the correctness risk without expanding scope.

---

## 6. Exact files changed

Modified:
- `backend/src/jobs/jobs.service.ts` *(already untracked/new in this working tree; further edited)*
- `backend/src/common/cache/dashboard-cache.service.ts` *(already untracked/new; further edited)*
- `backend/src/common/guards/idempotency.interceptor.ts` *(already untracked/new; further edited)*
- `backend/src/common/health.service.ts`
- `backend/src/events/events.interceptor.ts`
- `backend/src/director/director.service.ts`
- `backend/src/supervisor/supervisor.service.ts`
- `backend/.env.example`
- `CHANGELOG.md`, `PROJECT_STATUS.md`

Added:
- `backend/test/idempotency-interceptor.test.cjs`
- `backend/test/dashboard-cache.test.cjs`
- `backend/test/jobs-service.test.cjs`
- `docs/DWES-REDIS-INFRASTRUCTURE-AUDIT-REPORT.md` (this file)

Not modified (reviewed, left as-is): `backend/src/events/events.service.ts`, `event-visibility.ts`, `events.module.ts`, `events.controller.ts`, `dashboard-cache.module.ts`, `jobs.module.ts`, `jobs.controller.ts`, `health.controller.ts`, `health.module.ts`, `app.module.ts`, all of `backend/src/ga-foundation/*`, `backend/prisma/schema.prisma`.

---

## 7. Environment variables added or corrected (no secrets)

Documented in `backend/.env.example` (all optional; absent = non-Redis fallback):

```
REDIS_URL                    # e.g. redis://localhost:6379 — unset by default
DWES_ENABLE_BULLMQ           # default true when REDIS_URL set
DWES_ENABLE_REDIS_CACHE      # default true when REDIS_URL set
DWES_REDIS_EVENT_FANOUT      # default true when REDIS_URL set
DWES_PG_EVENT_FANOUT         # default true (independent PG LISTEN/NOTIFY fallback)
```

No credentials were generated, committed, or hard-coded. `backend/.env` (local dev, git-ignored) was **not** modified — the live-verification instances below received `REDIS_URL` as a process environment variable at launch, not a committed file change.

---

## 8. Commands executed

```
npm run build            (backend: prisma generate && nest build)          — exit 0
npx tsc -p tsconfig.build.json --noEmit  (backend strict typecheck)        — exit 0
npm test                 (backend: node --test test/**/*.test.cjs)         — 159 tests, 158 pass, 1 pre-existing unrelated failure
node --test test/idempotency-interceptor.test.cjs test/dashboard-cache.test.cjs test/jobs-service.test.cjs
                                                                             — 17 tests, all pass
npx tsc --noEmit -p tsconfig.json   (frontend, root check)                 — exit 0
npm run build             (frontend: tsc -b && vite build)                 — exit 2, PRE-EXISTING unrelated errors (Section 17)
node scripts/demo-project.mjs setup / teardown
redis-server.exe / redis-cli.exe   (Windows-native Redis 5.0.14.1, TEMP\redis-bin)
node dist/main.js  (×2, PORT=3002/3003, REDIS_URL=redis://127.0.0.1:6379)
```

---

## 9. Backend and worker ports used

- Instance A: `3002` (HTTP + in-process BullMQ worker)
- Instance B: `3003` (HTTP + in-process BullMQ worker)
- PostgreSQL: `5432` (existing `WiringSchemeDB`, shared by both instances)
- Redis: `6379`, bound to `127.0.0.1` only — never exposed beyond localhost, no credentials, stopped and removed at the end of verification.
- The pre-existing default dev backend (`3001`) was not running at audit start and was not started or touched.

---

## 10. Redis runtime evidence

Both instances' startup logs and `/api/health/ready`:

```
[JobsService] BullMQ background processing active with Redis worker
[DashboardCacheService] Redis Dashboard Cache connected
[EventsService] Redis Pub/Sub event fan-out active

GET /api/health/ready →
{
  "status": "ok", "ready": true, "degraded": false,
  "sse_events": { "mode": "redis", "redisReady": true, "pgReady": false },
  "queue": { "redisConfigured": true, "bullmqActive": true },
  "cache": { "redisConfigured": true, "redisActive": true }
}
```
(Redis 5.0.14.1 — ioredis logs a "recommend ≥6.2.0" advisory; `SET NX PX`, `EVAL`, and Pub/Sub used here are all supported since Redis 2.6, so this did not affect functional correctness.)

---

## 11. BullMQ lifecycle evidence

Live job (`backup-export`, `dry_run: true`) polled through the real HTTP API:

```
t+0s  status=PROCESSING started_at=18/07/2026 18:49:59
t+5s  status=COMPLETED  started_at=18/07/2026 18:49:59  finished_at=18/07/2026 18:50:15
```
Redis-side confirmation: `bull:dwes_jobs:{id}` and `bull:dwes_jobs:{id}:lock` keys present in Redis during processing (`redis-cli keys "bull:dwes_jobs:*"`).

Before the fix in Section 4.1, three separate jobs were created and observed with **57 consecutive polls over 30 s all showing `status=QUEUED`, `attempts=0`, `started_at=null`** — while the backend's own log simultaneously showed `BullMQ job ... completed`. Cross-checked directly against Postgres:
```sql
SELECT id, status, attempts, started_at, finished_at FROM background_jobs WHERE id = '26eee383-...';
 status | attempts | started_at | finished_at
 QUEUED |        0 |            |
```
This is the ground-truth evidence for defect #1 and its fix (re-run after the fix: see Section 16).

---

## 12. Two-instance SSE evidence

- Health on both instances simultaneously: `sse_events.mode: "redis"`, `redisReady: true`.
- Direct Redis Pub/Sub proof (independent `ioredis` subscriber process, not part of the app, subscribed to the same `dwes_events` channel the app uses): a real `POST /api/tech/cable-action` mutation on instance A produced —
  ```
  MESSAGE {"instanceId":"83725df7-...","event":{"scope":"assignment","action":"created","actorId":40,"at":"2026-07-18T18:49:31.166Z"}}
  ```
  received by the independent subscriber in real time, correctly scoped (`assignment`) and correctly excluding the heartbeat/no-op noise.
- **Caveat (NOT a product defect):** a Node `fetch()`-based SSE client written for this audit's verification script did not reliably observe streamed chunks from the `/api/events/stream` endpoint in this harness; the underlying transport (Redis Pub/Sub → `EventsService.asObservable()` → `EventsController`'s `@Sse('stream')`) was verified directly instead, and the SSE-controller wiring itself is already covered by the existing, passing unit test *"SSE stream emits a body heartbeat immediately after authentication."* A live two-browser-tab confirmation was not performed in this session — see Section 18.

---

## 13. Authenticated idempotency evidence

Ten concurrent, authenticated `POST /api/tech/cable-action` requests, same `X-Idempotency-Key`, **split 5/5 across instance A (`:3002`) and instance B (`:3003`)**, real technician JWT, real assignment (`id=97`):

```
Status distribution: { "201": 10 }
Unique response bodies: 1
Audit rows for this action (tech_audit_log, action=cable_skip, matched by note): before=1 after=2 → delta=1
```
All ten concurrent cross-instance requests returned HTTP 201 with byte-identical bodies; exactly one `tech_audit_log` row was created. Re-run after the interceptor fix (Section 4.2); the pre-fix behavior (documented in Section 3.2) was `409` for 9 of 10 concurrent requests, which the task's own acceptance criteria explicitly rejects as valid evidence.

---

## 14. Database mutation and audit-count evidence

- `tech_assignments` (cable_status JSON) and `tech_audit_log` each show **exactly one** write per the 10-way concurrent idempotency test above (Section 13).
- `background_jobs` row transitions verified directly against Postgres pre- and post-fix (Section 11).
- No `WiringSchemeDB` schema, migration, or DDL statement was executed at any point — all verification used existing, already-approved application write paths (assignment/cable-action/job-creation endpoints), consistent with the pre-approved write list.

---

## 15. Cache and lock evidence

- `dwes:cache:supervisor:allPanels` present in Redis after instance A served `GET /api/supervisor/all-panels`; instance B's subsequent call to the same endpoint returned the same row count (2/2), now reachable via `getAsync()` (Section 4.6).
- Lock unit tests (real in-memory-fallback code path, deterministic): mutual exclusion until release, owner-safe compare-and-delete (wrong-owner release is a no-op; correct-owner release frees the lock), bounded-TTL expiry of an abandoned lock, cache set/get TTL expiry, pattern-scoped `invalidate()`. All pass (`backend/test/dashboard-cache.test.cjs`, 6/6).
- Idempotency interceptor unit tests: 10 concurrent same-key calls → exactly 1 execution; replay marks the request so downstream publish/invalidation is skipped; an unrelated key is never blocked by someone else's in-flight request; GET is never intercepted. All pass (`backend/test/idempotency-interceptor.test.cjs`, 4/4).

---

## 16. Redis failure/recovery evidence

```
BEFORE stop:  degraded=false  sse=redis/true   queue.bullmqActive=true   cache.redisActive=true
[redis-cli shutdown nosave]
DURING outage: HTTP still 200, backend did not crash
              degraded=true   sse=local/false  queue.bullmqActive=false cache.redisActive=false
  → cable-action mutation during the outage: succeeded (in-memory idempotency lock fallback)
  → backup-export job created during the outage: QUEUED → PROCESSING within 3 s via the local
    (non-BullMQ) fallback path — not stuck, because isBullMqActive correctly flipped to false
[redis-server.exe restarted]
AFTER restart: reconnection observed within 1 s (first poll):
              degraded=false  sse=redis/true   queue.bullmqActive=true   cache.redisActive=true
```
Post-recovery verification:
- The job created *during* the outage finished cleanly exactly once (`status=COMPLETED`, `attempts=0`, no duplicate row) — it was never added to the BullMQ queue in the first place (the fallback branch doesn't call `queue.add()`), so there was no possibility of BullMQ re-picking it up after reconnection.
- A **new** job created *after* reconnection correctly went through the real BullMQ/Redis path again (`bull:dwes_jobs:{id}:lock` present in Redis) and completed in 4 s.
- No duplicate jobs, events, mutations, or audit entries were observed across the stop→outage→restart→recovery sequence.
- Committed PostgreSQL data (the assignment, its cable_status, and audit rows) remained intact throughout — Redis was never in the write path for this data.

---

## 17. Test and build results

| Check | Result |
|---|---|
| `prisma generate` | OK |
| Backend `nest build` | OK, exit 0 |
| Backend strict typecheck (`tsc --noEmit`) | OK, exit 0 |
| Backend full test suite | 159 tests: **158 pass**, 1 fail — `ProjectsService.submitToDirector per-panel writes one audit when wiring is complete` (`test/projects.service.test.cjs:279`). **Pre-existing and unrelated**: this session made zero changes to `projects.service.ts` or anything it depends on; the file was already modified/uncommitted before this audit began. Not fixed — out of scope for a Redis-focused audit and would be unrelated scope creep. |
| New Redis-focused unit tests | 17/17 pass |
| Frontend root typecheck (`tsc --noEmit -p tsconfig.json`) | OK, exit 0 |
| Frontend `npm run build` (`tsc -b && vite build`) | **FAILS, exit 2** — pre-existing, unrelated TypeScript errors in `src/pages/admin/tabs/DiagnosticsTab.tsx` and `src/pages/technician/tabs/PanelsTab.tsx`. Both files were already in the modified/uncommitted working tree before this session started; this session made **no frontend changes at all**. Not fixed — out of scope. |
| Real-Redis BullMQ execution | VERIFIED (Section 11) |
| Cross-instance SSE (Redis transport) | VERIFIED (Section 12); full end-to-end browser/SSE-client confirmation NOT TESTED (Section 18) |
| Authenticated distributed idempotency | VERIFIED (Section 13) — exactly one mutation, one audit entry, cross-instance |
| Redis failure/recovery | VERIFIED (Section 16) |

---

## 18. Remaining risks and exact blockers

- **Frontend build is currently broken** (Section 17) for reasons unrelated to this audit — pre-existing uncommitted TypeScript errors. This blocks a clean `npm run build` for the whole app until that's fixed separately; it does not affect any backend/Redis work in this report.
- **One pre-existing, unrelated backend test failure** (`projects.service.test.cjs`) — see Section 17.
- **SSE verified via the Redis transport layer directly, not via a full two-browser-tab / two-SSE-client capture in this session** — the Node `fetch()`-based test client used for this audit did not reliably surface streamed chunks (a test-harness limitation, not reproduced against the app's own passing SSE unit test). Residual risk: low — `EventsController` is a thin, already-unit-tested RxJS `merge()` over `EventsService.asObservable()`, and the Redis pub/sub delivery into that Observable was proven directly.
- **`excel_parse`/`pdf_report` BullMQ job types remain unimplemented (fail clearly) rather than wired to real logic** — deliberate scope decision (Section 5), since nothing in the app currently creates jobs of these types; implementing them without a real caller would be unverifiable and would touch protected "Existing upload endpoints"/"Reports" surfaces.
- **`backend/src/ga-foundation/job-queue.service.ts` and `backend/src/jobs/jobs.service.ts` are two independent background-job systems** sharing the `background_jobs` table by job-type-namespace convention rather than a single dispatcher. Not a defect today (no overlapping job types), but a latent risk if a future job type is added to the wrong one, or both. Flagged, not consolidated, to respect "smallest diff" / "don't rebuild existing services."
- **Redis 5.0.14.1** (Windows-native binary used for verification) is below the ioredis-recommended 6.2.0. All primitives this codebase depends on (`SET NX PX`, `EVAL`, Pub/Sub) are supported since Redis 2.6, so this is not expected to affect correctness, but it was not verified against Redis ≥6.2.
- **Cross-instance cache staleness window:** with the `getAsync()` fix (Section 4.6), a cold read on instance B now reuses instance A's Redis-cached value, but each instance's own *local* L1 copy of that value is only cleared by its own TTL (bounded at 30 s) or by a mutation that instance itself handles — a mutation on instance A does not actively push instance B to drop its L1 copy early. This is a bounded (≤30 s), not unbounded, staleness window; PostgreSQL is never bypassed as source of truth. Actively invalidating other instances' L1 caches would require either subscribing `DashboardCacheService` to the existing `dwes_events` channel (risking a `DashboardCacheModule` ↔ `EventsModule` circular dependency) or a dedicated invalidation channel — judged out of scope for this pass given the bound is already small and explicit in the spec's own tolerance ("cache invalidation" was not required to be instantaneous, only correct and bounded).

**No Redis-dependent capability is being claimed as verified without the live evidence cited above.** Cloud/production multi-instance readiness is supported by this evidence but was exercised against a local Windows-native Redis binary and two local backend processes, not a deployed multi-region/production topology.

---

## 19. Rollback instructions

All changes are plain file edits with no schema/migration/data changes, so rollback is a pure code revert:

```powershell
# From C:\Users\sathe\OneDrive\Desktop\DWES
git checkout -- backend/src/common/health.service.ts `
                backend/src/events/events.interceptor.ts `
                backend/src/director/director.service.ts `
                backend/src/supervisor/supervisor.service.ts `
                backend/.env.example `
                CHANGELOG.md PROJECT_STATUS.md

# These three files were already untracked (new in this working tree before the audit
# started) — reverting them means restoring the pre-audit version, not deleting them:
#   backend/src/jobs/jobs.service.ts
#   backend/src/common/cache/dashboard-cache.service.ts
#   backend/src/common/guards/idempotency.interceptor.ts
# There is no prior committed version to `git checkout` back to; if a full rollback of
# this audit's edits to those three files is needed, restore from this report's diffs
# or from a pre-audit backup/snapshot of the working tree.

Remove-Item backend/test/idempotency-interceptor.test.cjs, `
            backend/test/dashboard-cache.test.cjs, `
            backend/test/jobs-service.test.cjs, `
            docs/DWES-REDIS-INFRASTRUCTURE-AUDIT-REPORT.md

Set-Location backend; npm run build   # rebuild dist/ after rollback
```

No `REDIS_URL` was ever set in the committed/tracked `backend/.env`; no Redis service was left running (Windows-native `redis-server.exe`, PID-tracked, was shut down via `redis-cli shutdown nosave` at the end of verification); no production or shared infrastructure was touched; the demo project (`DEMO_PROJECT_20260718183352`) created for live verification was torn down via `npm run demo:teardown` equivalent (`node scripts/demo-project.mjs teardown`).

---

## Addendum (2026-07-19) — Repository-clean follow-up

Follow-up pass closing the three items Section 18 flagged as outstanding: the pre-existing frontend build failure, the pre-existing backend test failure, and the deliberately-deferred `excel_parse`/`pdf_report` BullMQ wiring. All Redis/BullMQ/SSE/cache/lock/idempotency work above was retained unchanged — nothing in this addendum touches `dashboard-cache.service.ts`, `events.service.ts`, `idempotency.interceptor.ts`, or `health.service.ts`.

### A. Frontend build fixed (exit 0)

- `src/pages/admin/tabs/DiagnosticsTab.tsx`: removed an unused `heapTone` variable (`TS6133`) — its intended tone-coloring logic was already implemented separately via inline `heapPct` comparisons a few lines below; nothing depended on it.
- `src/pages/technician/tabs/PanelsTab.tsx`: the `fields` array's `emphasis` values (`'meta'`, `'primary'`) were widening to `string` instead of the declared `WorkspaceInfoEmphasis` union at the array-literal boundary (`TS2322`); annotated them `as const`.
- `src/styles/design-system.css`: fixing the two TS errors above unblocked `tsc`, which then exposed a **pre-existing, unrelated** Tailwind v4 build failure one stage later (`vite build`): eleven `@apply <custom-class>` call sites referenced plain CSS classes (`.dw-wim-matrix`, `.dw-wim-cell`, `.dw-wim-label`, `.dw-wim-value`, `.dw-wim-value--primary`, `.dw-wim-matrix-span`, `.dw-wim-header`, `.dw-wim-header-titles`, `.dw-wim-title-primary`, `.dw-wim-title-secondary`) as if they were Tailwind utilities — Tailwind v4 rejects `@apply` of a non-utility class outright ("Cannot apply unknown utility class"), where v3 was more permissive. Fixed by inlining each referenced class's actual declarations at every call site (matching this codebase's established fix for the same class of bug — see memory `apply-plain-class-gotcha`), rather than restructuring the file's single ~9000-line `@layer components` block to use Tailwind v4's `@utility` at-rule. Zero visual change: `@apply <custom-class>` was already only pulling in that class's own declaration block (never its separate media-query overrides), so inlining reproduces exactly what was being attempted.
- Verified: `tsc -b` exit 0, `vite build` exit 0, all 55 existing frontend tests pass (`tests/*.test.ts`, `tests/pwa-install.test.mjs`) — none touch the three edited files, so this is regression-safety, not new coverage of them.

### B. Backend test failure fixed at the root cause (fixture, not implementation or assertions)

`ProjectsService.submitToDirector per-panel writes one audit when wiring is complete` (`test/projects.service.test.cjs`) failed with `NotFoundException: Panel assignment not found`.

**Root cause:** a test-fixture/implementation mismatch, not a product defect. `submitToDirector`'s `target.frameId`-without-`assignmentId` branch resolves the panel via `tech_assignments.findMany({ orderBy: { id: 'desc' }, take: 1 })` — deliberately picking the *latest* assignment row for that frame (matters after a mid-change/rework cycle leaves older rows for the same `frame_id`). The failing test's fixture wired the assignment onto `findFirst` instead, which this code path never calls (`assignmentId` is undefined here, so the `assignmentId ? findFirst(...) : null` ternary always takes the `null` branch) — meanwhile its explicit `findMany: async () => []` guaranteed the real lookup found nothing. No other test in the file exercises this branch (all others use the QA-enabled legacy all-panels path), so this had no other coverage to cross-check against before now.

**Fix:** corrected the fixture to return the assignment from `findMany` (matching what the implementation actually queries), confirmed by inspecting `submitToDirector`'s source directly rather than guessing. The implementation's `findMany`+`orderBy`+`take:1` approach was left exactly as-is — it is more correct than a bare `findFirst` would be, not a bug to "fix."

**Added, not just fixed:** a companion regression test, `submitToDirector per-panel retry is idempotent: one audit row, one publish, same result replayed`, exercising this specific branch's already-implemented idempotent-retry path (previously untested for this branch): two calls with the same `{ frameId }` target produce exactly one `tech_audit_log` row, exactly one `events.publish()` call, and the second call's response carries `idempotent: true`. This directly covers the task's "Idempotent retries" / "No duplicate SSE publication" requirements for this workflow.

Verified: focused file 15/15 pass; full backend suite 169/169 pass (161 prior + 8 new async-job-handler tests below). One additional failure seen on a single run — `LibreDWG external-process adapter validates output, crash, timeout, size bound, and temp cleanup` (`test/ga-foundation.test.cjs`, unrelated to any change in this report) — reproduced as transient: passed in isolation and on a subsequent full-suite run; it's a timeout-sensitive test spawning a real child process, not a regression.

### C. Real async Excel and PDF processing via the existing BullMQ infrastructure

Added two new, additive, default-off capabilities. **No existing endpoint, response shape, or business logic changed.** Both reuse the exact existing synchronous logic — zero duplicated parsing or report-generation code — via a new pluggable handler mechanism added to `JobsService` (mirrors the `registerHandler` pattern `backend/src/ga-foundation/job-queue.service.ts` already uses for its own jobs, rather than hardcoding a new `if/else` branch or having `JobsService` depend on feature modules directly):

```ts
registerHandler(jobType: string, handler: (payload, report) => Promise<any>): void
```

`executeJobHandler` checks a registered handler first, before falling through to the existing hardcoded `backup_export` / `dwg_convert` / unsupported-type branches — none of which changed.

**Excel (`DWES_ASYNC_EXCEL_PROCESSING`, default off):**
- New endpoint `POST /api/upload/wiring-schedule-mapped-async/:code` (404 when the flag is off — same convention as other flag-gated DWES endpoints). Stages the uploaded buffer to a temp file (job payloads travel through Redis/Postgres as JSON — a raw file buffer up to `DWES_MAX_UPLOAD_MB` does not belong there) and calls the existing `JobsService.createJob`. Returns a job reference; poll via the existing `GET /api/jobs/:id`.
- `UploadService.onModuleInit` registers the `excel_parse` handler (only when the flag is on) to read the staged file back and call **the exact same `UploadService.uploadMapped(...)`** the synchronous endpoint calls, then deletes the temp file.
- The existing `POST /api/upload/wiring-schedule-mapped/:code` is completely unchanged and remains the default.

**PDF report (`DWES_ASYNC_REPORT_GENERATION`, default off):**
- New endpoint `POST /api/projects/:code/frames/:id/report-pdf-async` (404 when off). Calls `JobsService.createJob` with only small metadata (`projectCode`, `frameId`, `generatedBy`) — no binary payload.
- `WiringDocumentService.onModuleInit` registers the `pdf_report` handler (only when the flag is on) to call **the exact same `WiringDocumentService.generatePanelCompletionReport(...)`** the synchronous endpoint calls. The generated PDF bytes are *not* stored in the job's Postgres `result` column; the job result instead carries `{ ready, filename, size_bytes, download_url }`, where `download_url` points at the existing, unchanged synchronous `GET /api/projects/:code/frames/:id/report-pdf` — report generation here is fast and deterministic, so re-running it synchronously once for delivery is cheap and avoids storing a binary blob in Redis/Postgres.
- The existing synchronous `report-pdf` endpoint is completely unchanged and remains the default and the only delivery path.

**Job lifecycle:** both reuse `JobsService.createJob`/`updateJobProgress` exactly as already implemented and verified in this report — `QUEUED → PROCESSING → COMPLETED/FAILED`, bounded exponential-backoff retry (`maxAttempts: 2`), `safe_error` on failure, full history via the existing `GET /api/jobs` / `GET /api/jobs/:id` / `POST /api/jobs/:id/retry`. A failing parse or report generation reaches `FAILED` with the real thrown error — never a fabricated success (verified directly, see below). When Redis is unavailable, `createJob` transparently uses the same in-memory fallback already audited in the main report — both new endpoints were exercised in that exact fallback mode (`REDIS_URL` unset in the test process) and worked identically.

**New tests** (`backend/test/async-job-handlers.test.cjs`, 8/8 pass):
- A registered handler reaching `COMPLETED` with its real result and reported progress.
- A registered handler reaching `FAILED` with the real thrown error and `result: null` (no fabricated success).
- Duplicate `registerHandler` calls for the same job type fail clearly.
- `retryJob` genuinely re-invokes the handler (a job that failed once then succeeds on retry ends `COMPLETED` with the second attempt's real result, not a replayed first-attempt result).
- `enqueueMappedUpload` / `enqueuePanelCompletionReport` both reject with 404 when their flag is off (default).
- **End-to-end**: with the flag on, `enqueueMappedUpload` given a real `.xlsx` buffer runs the job through `JobsService`'s in-memory fallback, and the resulting frame in `MockStore` has the same parsed cable data the synchronous path would have produced — proving the async path is not a reimplementation.
- The `pdf_report` handler is registered if and only if `DWES_ASYNC_REPORT_GENERATION` is on.

### Files changed in this addendum

- `src/pages/admin/tabs/DiagnosticsTab.tsx`, `src/pages/technician/tabs/PanelsTab.tsx`, `src/styles/design-system.css`
- `backend/test/projects.service.test.cjs`
- `backend/src/jobs/jobs.service.ts` (added `registerHandler`/`JobHandler`; no changes to existing job types or the Redis connection/queue/worker setup from the main report)
- `backend/src/common/feature-flags.ts` (added `asyncExcelProcessingEnabled`, `asyncReportGenerationEnabled`)
- `backend/src/upload/upload.service.ts`, `backend/src/upload/upload.controller.ts`
- `backend/src/projects/wiring-document.service.ts`, `backend/src/frames/frames.controller.ts`
- New: `backend/test/async-job-handlers.test.cjs`

### Environment variables added (no secrets, both default off)

```
DWES_ASYNC_EXCEL_PROCESSING=true   # enables POST /api/upload/wiring-schedule-mapped-async/:code
DWES_ASYNC_REPORT_GENERATION=true  # enables POST /api/projects/:code/frames/:id/report-pdf-async
```

### Final verification

| Check | Result |
|---|---|
| Frontend `tsc -b` | exit 0 |
| Frontend `vite build` | exit 0 |
| Frontend tests (55: `tests/*.test.ts` + `pwa-install.test.mjs`) | 55/55 pass |
| Backend `tsc --noEmit` (strict) | exit 0 |
| Backend `nest build` | exit 0 |
| Backend full suite | 169/169 pass |

### Remaining note

The new async endpoints are backend-complete and tested but have no frontend caller (consistent with them being off by default) — enabling either flag in a real deployment is a backend-only, reversible operational change; wiring a frontend "process in background" UI affordance was not requested and was not built, to avoid scope creep into frontend work this task didn't ask for.
