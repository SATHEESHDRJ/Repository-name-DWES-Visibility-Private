# DWES Provider Migration Guide (Anti-Lock-In)

**Date: 2026-07-13.** DWES must be able to leave any provider in an afternoon. This guide documents why it can, and the exact procedure.

## 1. Portability by design (already true, keep it true)

| Principle | Status |
|---|---|
| Provider-neutral env vars (`DATABASE_URL`, `UPLOAD_DIR`, `CORS_ORIGINS`, `JWT_*`, `RP_*`) | ✔ already how the app is configured (`infra/docker/.env.production.example`) |
| Standard PostgreSQL (no proprietary extensions) | ✔ verified — 7 plain tables; works on any PG 18 (or 17 via plain SQL) |
| Dockerfiles maintained even on managed platforms | ✔ `infra/docker/Dockerfile.api`, `Dockerfile.nginx` — keep building them in CI forever |
| S3-compatible APIs only for object storage | rule adopted in `FILE_STORAGE_MIGRATION_GUIDE.md` (R2/B2 both S3-compatible) |
| No provider-specific auth SDKs | ✔ auth is self-contained (JWT + WebAuthn + SQLite) |
| Domain owned by us, DNS on Cloudflare (not the compute provider) | planned — the single most important anti-lock-in choice: leaving a host = one DNS/route change |
| WebAuthn RP_ID = the domain, not the host | ✔ passkeys survive any migration that keeps `dwes.ingenious-network.com` |

Residual lock-in (accepted, small): the Cloudflare Worker `/api` route (20 lines, rewrite anywhere), Railway cron definition (any scheduler runs the same script), Neon-specific PITR conveniences (Layer-2 dumps are provider-neutral).

## 2. Export procedure (works from every option A–D)
1. **DB:** `pg_dump -Fc` via the provider's TLS connection string (seconds at 9.5 MB).
2. **Files:** tar the uploads volume (platform shell/`railway run`/SSH) or `rclone sync` if primary storage is a bucket.
3. **Auth SQLite:** `sqlite3 .backup` copy from the data volume.
4. **Secrets inventory:** confirm the env-var name list is current (values re-entered at the destination by the administrator).
   In fact, the nightly backup (`BACKUP_AND_RESTORE_RUNBOOK.md` §2) already produces artifacts 1–3 every day — a migration can start from last night's R2 folder.

## 3. Import procedure (destination-agnostic)
1. Stand up the API container (any Docker host / PaaS) with the same env-var names; mount volumes; restore uploads + sqlite.
2. Restore DB per `DATABASE_MIGRATION_GUIDE.md` (Path A or B by target PG version); run count verification.
3. Deploy frontend build output (`dist/`) to the new static host — or leave it on Cloudflare Pages (frontend rarely needs to move).
4. Smoke test on a temporary hostname: login (password + passkey), upload, download, report generation.

## 4. DNS cutover
Lower TTL to 300 s the day before → verify destination on temp hostname → switch the CNAME/route → watch logs on BOTH old and new for 24 h → keep the old environment paid/running for 7 days before teardown.

## 5. Rollback
The old environment is not deleted until the new one has run clean for a week (and **the local Windows deployment is never decommissioned until the cloud has passed `FINAL_DEPLOYMENT_CHECKLIST.md`** — the standing rule from the project brief). Rollback = revert the DNS record (≤5 min) and reconcile any interim writes (re-export from new, re-import to old — same procedure §2–3 in reverse).

## 6. Trigger events for using this guide
Provider price change beyond `BILLING_AND_COST_CONTROL.md` expectations · free-tier terms change (Neon/R2) · repeated outages · account/billing lock (see incident Play 6 — restore from R2, don't wait for support) · OCI signup finally succeeding (migrate onto Always Free to cut cost to $0: this same procedure, destination = the original `infra/` Compose stack).
