# DWES Hosting Requirements (Provider-Neutral)

**Date:** 2026-07-13 · **Method:** direct repository inspection + read-only measurements against the live local system. No values below are guessed; each carries its evidence source. Assumptions (marked **ASSUMED**) are stated explicitly and must be confirmed at the approval gate.

Related existing docs (OCI-specific, superseded for provider choice but still valid as reference implementation): `docs/OCI-ARCHITECTURE.md`, `docs/CLOUD-ONBOARDING.md`, `docs/GO-LIVE-REPORT.md`.

---

## 1. Application inventory

| Component | Technology | Evidence |
|---|---|---|
| Frontend | React 19 + Vite 8 + Tailwind 4 + Three.js (SPA/PWA) | `package.json` |
| Backend | NestJS 10 (Express), REST + authenticated Server-Sent Events | `backend/package.json`, `backend/src/events/` |
| ORM | Prisma 7 via `@prisma/adapter-pg` (pg driver) | `backend/package.json`, `backend/src/main.ts` |
| Database | PostgreSQL **18.3**, database `WiringSchemeDB` | measured: `SELECT current_setting('server_version')` → 18.3 |
| Secondary store | SQLite `backend/data/dwes_auth.sqlite` (better-sqlite3, WAL) — WebAuthn passkeys + hashed refresh tokens | `backend/src/auth/webauthn-store.service.ts`, `auth-token-store.service.ts` |
| File store | Local disk `uploads/<PROJECT_CODE>/{frames,drawings,director-reports}` | `backend/src/frames/frame-store.ts` |
| Reverse proxy (concept) | nginx 1.27 (config exists in `infra/nginx/`) | `infra/nginx/conf.d/dwes.conf` |
| Containers | Multi-stage Dockerfiles (API + nginx), ARM64-ready, `node:22-bookworm-slim` | `infra/docker/Dockerfile.api`, `Dockerfile.nginx` |
| CI/CD | GitHub Actions (build+test+e2e; SSH deploy workflows exist for OCI) | `.github/workflows/` |

## 2. Phase-1 checklist — answers

### Frontend build requirements
- Build: `tsc -b && vite build` (`package.json`). Node ≥22 required (`engines`), `.nvmrc` pins 24, Docker/CI pin 22.
- Output: static `dist/` — **19 files, 9.96 MB** (measured 2026-07-13). Largest: Material Symbols font 5.2 MB (woff2, pre-compressed), main JS bundle 2.47 MB (~650 KB gzipped), pdf.worker 1.34 MB (lazy-loaded), CSS 0.64 MB.
- The frontend is a pure static artifact — deployable to any static host or CDN. Dev-server proxying of `/api` → `:3001` (`vite.config.ts`) must be replicated in production by the host (rewrite/proxy) or by same-origin serving (current nginx design).

### Backend runtime and Node.js version
- Node **≥22** (`package.json` engines both packages); production images use `node:22-bookworm-slim`. Runs `node dist/main.js`, listens on **3001**, health endpoint `GET /api/health` (deep check: `SELECT 1`).
- ARM64-compatible end-to-end (no native deps beyond `better-sqlite3`/`bcryptjs`/`sharp`-free stack; existing images target OCI Ampere).

### NestJS memory and CPU requirements
- No headless browser: PDF via **pdfkit/pdf-lib**, Excel via **exceljs/xlsx** — pure JS (`backend/src/common/report-pdf.ts`, `panel-completion-report-pdf.ts`). Grep confirms zero puppeteer/chromium in `backend/src`.
- Memory drivers: multer **memory storage** buffers uploads whole (≤50 MB/file, `backend/src/upload/upload.module.ts:7`); xlsx parsing expands ~5–10× file size in heap; typical wiring schedules are 0.1–1 MB (measured), so parse spikes are tens of MB.
- Baseline Nest+Prisma RSS is ~120–200 MB. **Sizing:** 512 MB RAM runs the API but is marginal during a 50 MB upload + parse (buffer + heap overhead + V8 headroom); **1 GB is the safe floor for the API process alone**. CPU: 1 shared vCPU suffices for 5–15 concurrent users (request/response JSON + occasional PDF render; k6 scaffolding targets 120 VUs on 2 OCPU).
- **Can it run on 512 MB?** API only: yes with risk (single large upload can approach the ceiling; set `NODE_OPTIONS=--max-old-space-size` accordingly). API + PostgreSQL colocated on 512 MB: **no** — not recommended.

### PostgreSQL version and current database size
- **PostgreSQL 18 required.** Live server is 18.3; production compose pins `postgres:18-alpine`; CHANGELOG.md:112–115 records that v18.3 dumps **cannot restore into postgres:16**. Managed-PG providers must offer PG 18, else a plain-SQL export path is needed (documented in `DATABASE_MIGRATION_GUIDE.md` — feasible: 7 simple tables, no v18-only features in schema).
- **Current size: 9.5 MB** (`pg_database_size` = 9,705,151 bytes, measured 2026-07-13). Exact row counts: users 36, projects 8, tech_assignments 3, session_log 989, tech_audit_log 15, panel_inspections 0, file_hashes 6.

### Expected database growth
- The DB stores metadata + audit only; binaries live on disk. Fastest-growing table is `session_log` (one row per login/logout/destructive-op; 989 rows ≈ 216 KB). At 10–30 daily users: **≈ 1–5 MB/year**. Even 10× activity stays under 100 MB for years. **Any managed-PG free tier ≥500 MB is dimensionally sufficient.**

### Prisma migration requirements
- **None.** No `prisma/migrations/` folder exists. WiringSchemeDB is externally managed; the app adapts to the schema (`prisma db pull` only — enforced project rule). Cloud DB provisioning = restore a dump, never `prisma migrate`. The only migratable store is `dwes_auth.sqlite` (self-migrates via better-sqlite3 on boot).

### Redis, queues, WebSockets, cron, background workers
- DWES provides authenticated live updates over **Server-Sent Events** at `/api/events/stream`. Event fan-out currently uses an in-process RxJS `Subject`, so the supported deployment topology is **exactly one API replica**.
- **Before adding a second backend replica**, replace the in-process fan-out with Redis Pub/Sub or PostgreSQL `LISTEN/NOTIFY`. Sticky sessions are not sufficient: the mutation and the listening client can reach different replicas. Queues, WebSockets, application cron, and background workers are not otherwise used.
- Scheduled work is **external to the app**: backup + cert-renew cron on the host (`infra/oci/cloud-init.yaml`; Windows Task Scheduler locally). Any host must provide an equivalent scheduler *or* backups must run from elsewhere.

### Always-running backend? Cold starts acceptable?
- **Correctness:** restart-safe. All persisted state is durable (Postgres / disk / SQLite) except in-flight WebAuthn challenges (5-min TTL Maps, `webauthn.service.ts:36-38`) and non-durable live event notifications. After a restart, the frontend's fallback poll catches up from durable state.
- **Availability:** the login page polls `/api/health` every 5 s; technicians work shifts on tablets. A sleeping backend means the **first user each morning waits through a cold start (typically 10–60 s on scale-to-zero hosts)** and passkey ceremonies can time out mid-wake. **Verdict (ASSUMED, confirm): acceptable for pilot/testing; not acceptable for production shift work.**

### Local filesystem storage currently required?
- **Yes — two mounts beyond Postgres:**
  1. `uploads/` — system of record for frames (JSON+XLSX), drawings, director reports; `FrameStore.loadAll()` rehydrates in-memory caches from disk on boot (`main.ts:157`). Losing it loses all engineering files.
  2. `backend/data/` — `dwes_auth.sqlite` (passkeys + refresh tokens). Losing it logs everyone out and deletes all enrolled fingerprints/passkeys. **Constraint:** per project data rules this store may NOT be folded into WiringSchemeDB or any other DB — so the API host needs a persistent disk, full stop (or an approved architecture change).
- Ephemeral-container hosts without volumes are therefore **unsuitable as-is**; object-storage migration for `uploads/` is designed in `FILE_STORAGE_MIGRATION_GUIDE.md` but the SQLite file still needs a real disk.

### Current and expected file sizes
Measured (`backend/uploads/`, 2026-07-13):
- Total 125 files / 98.35 MB, of which the internal `uploads/backups/` archive is 81.7 MB. **Live project content ≈ 17 MB** across 4 projects.
- By type: PDF 85.5 MB (6 files — dominant; largest single drawing 14.3 MB), XLSX 4.8 MB (48), JSON metadata 7.4 MB (62).
- Code-supported but not yet present: DWG/DXF, PNG/JPG/TIFF, 3D (GLB/GLTF/STEP/IFC/OBJ/FBX/STL) — plan headroom for 3D models toward the 50 MB cap.

### Estimated monthly file-storage growth
- Observed: ~4 projects ⇒ ~17 MB live + archives. **ASSUMED at 1–2 new projects/month with drawings: ~50–200 MB/month**, dominated by PDF/CAD/3D uploads. A 5–10 GB allowance covers the first 2–3 years; archive-on-replace roughly doubles hot data over time unless retention pruning is applied.

### Maximum upload size
- **50 MB** application cap (`MulterModule` limits, `upload.module.ts:7`); nginx allows 55 MB (`client_max_body_size 55m`, `infra/nginx/conf.d/dwes.conf`). Any managed proxy/platform in front of the API must pass ≥50 MB request bodies — this **disqualifies platforms with hard 4.5–32 MB body limits** unless direct-to-storage upload is adopted.

### Estimated monthly bandwidth
- First visit ≈ 8 MB (font+JS+CSS; ~2–3 MB with gzip/brotli — PWA-cached thereafter). API traffic is small JSON; drawing views stream 1–15 MB PDFs.
- **ASSUMED usage model:** 10–30 daily users × ~20–40 MB/day worst case ⇒ **≈ 10–25 GB/month**, spikes with heavy drawing use; **50 GB/month is a safe planning ceiling.** Any 100 GB+ egress allowance is comfortable.

### Concurrent / daily users
- **5–15 concurrent (user-confirmed 2026-07-13)**; 36 active accounts today across 5 roles; daily active **ASSUMED 10–30**. Existing k6 target (120 VUs) provides ample headroom validation.

### Required geographic region
- Primary: **UAE**; secondary: **India**. Best-latency regions: AWS me-central-1 (UAE), Azure UAE North, GCP me-central1/2 (Doha/Dammam), OCI me-dubai-1; Mumbai regions serve India well. EU (Frankfurt/Falkenstein) adds ~100–150 ms to UAE — acceptable for normal requests, but directly visible in live SSE updates and large drawing downloads.

### Backup retention / recovery time / uptime (business requirements — **ASSUMED, confirm at gate**)
- **RPO ≤ 24 h** (daily backups — matches existing local Task Scheduler design: daily 02:00, keep 21 snapshots/30 days, `scripts/backup.config.json`).
- **Retention 30 days.**
- **RTO ≤ 4 h** during working hours.
- **Uptime ~99%** (working-hours-critical, not life-safety; ≈ 7 h/month allowance).
- Known gap to fix in any target: `dwes_auth.sqlite` is excluded from BOTH existing backup systems (`scripts/BACKUP.md:69`; `infra/oci/scripts/backup-oci.sh`).

### Is Docker Compose essential?
- **No.** Compose is a convenience wrapper; the services are cleanly separable (static frontend / Node API / Postgres / cron). Managed platforms can host each part natively. Compose remains the reference for VPS-style deployment (`infra/docker/docker-compose.yml`).

### Is nginx necessary?
- **No — replaceable** by managed routing/TLS. But four nginx duties must be re-provided by whatever replaces it: (1) TLS + HTTP→HTTPS, (2) ≥50 MB body pass-through, (3) rate limiting + security headers, and (4) streaming `/api/events/stream` without response buffering or caching.

### Does the application require SSH?
- **The app: no.** SSH is purely an operations channel for the VPS option. Managed platforms need none (use their deploy/logs/secrets tooling).

### Can frontend and backend be separated?
- **Yes.** SPA calls relative `/api` via axios with Bearer tokens in headers (no cookies ⇒ no cross-site cookie complexity). Split-origin hosting needs: `CORS_ORIGINS` set to the frontend origin (mechanism already implemented, `main.ts:176-181`), and the frontend's `/api` base URL made configurable or path-proxied at the edge. WebAuthn RP_ID binds passkeys to the public domain — keep the app on `dwes.ingenious-network.com` regardless of provider, or all enrolled passkeys break.

### Must uploads migrate to S3-compatible object storage?
- **Conditional.** If the chosen host provides a reliable persistent disk (VPS block volume, Fly/Railway/Render volumes) uploads can stay on disk exactly as today — zero code change. If the API host is ephemeral, migration is **mandatory before production**. Even with a disk, object storage is the recommended DR target for backup copies. No S3/R2 code exists yet (verified — greenfield; design in `FILE_STORAGE_MIGRATION_GUIDE.md`).

---

## 3. Minimum viable production footprint (provider-neutral)

| Resource | Minimum | Comfortable |
|---|---|---|
| API compute | 1 shared vCPU / 512 MB (risk-noted) | 1–2 vCPU / 1–2 GB |
| PostgreSQL | PG 18, 100 MB storage | PG 18, 1 GB, automated daily backups |
| Persistent disk (uploads + SQLite) | 2 GB | 10 GB |
| Static hosting | 10 MB artifact, ~25 GB/mo egress | CDN + brotli |
| Bandwidth (total) | 25 GB/mo | 100 GB/mo |
| Scheduler | 1 daily backup job | + cert renew (if self-managed TLS) |
| TLS + custom domain | required (`dwes.ingenious-network.com`) | managed auto-renew |

This footprint is deliberately small — DWES is a lightweight line-of-business API with a file store, not a heavy web platform. The provider comparison (`HOSTING_PROVIDER_COMPARISON.md`) evaluates who can deliver this free, and at what paid price where not.
