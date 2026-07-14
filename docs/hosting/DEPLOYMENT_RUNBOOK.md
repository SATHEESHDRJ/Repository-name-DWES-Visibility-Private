# DWES Deployment Runbook — Option C (Cloudflare Pages + Railway + Neon + R2)

**Date: 2026-07-13.** Execute only after the approval gate and after `SECURITY_IMPLEMENTATION_PLAN.md` Phase S1 is done. Every secret value is entered by the administrator in provider dashboards — never generated here, never committed. For Option A, skip the Neon steps and add a `postgres:18` Railway service; for Option D, use `docs/OCI-RUNBOOK.md`/`docs/CLOUD-ONBOARDING.md` patterns with the existing Compose stack.

## 0. Prerequisites (one-time)
- [ ] **GitHub origin**: the repo currently has **no `origin` remote** (`PROJECT_STATUS.md`). Create a **private** GitHub repo, push `main`, enable secret scanning + push protection. CI (`ci.yml`) starts running automatically (free 2,000 min/mo private-repo allowance is ample).
- [ ] Accounts with **2FA enabled**: Cloudflare, Railway (Hobby, $5/mo — card), Neon (free — no card), GitHub.
- [ ] DNS moved to Cloudflare per `DNS_AND_SSL_GUIDE.md` §3 (records inventory first!).
- [ ] S1 security fixes merged (validation pipe, seed rotation, projects RBAC, body limit, domain-spelling reconciliation, sqlite-in-backups).

## 1. Database — Neon
1. Create project: name `dwes`, **Postgres 18**, region **Singapore (ap-southeast-1)**.
2. Migrate data per `DATABASE_MIGRATION_GUIDE.md` Path A; run the count verification.
3. Create the least-privilege app role; note both connection strings (admin = offline use only).

## 2. Backend API — Railway
1. New project → deploy from GitHub repo → root `infra/docker/Dockerfile.api` (set the Dockerfile path in service settings), region **Southeast Asia**.
2. **Volumes**: create and mount `dwes-uploads` → `/app/uploads` and `dwes-auth` → `/app/data` (sizes: 5 GB / 1 GB).
3. **Environment variables** (names from `infra/docker/.env.production.example`; values typed in dashboard):
   `NODE_ENV=production`, `PORT=3001`, `DATABASE_URL` (Neon app-role string, `sslmode=require`), `JWT_SECRET` (long random value the administrator generates locally), `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES_DAYS`, `CORS_ORIGINS=https://dwes.ingenious-network.com`, `TRUST_PROXY=1`, `UPLOAD_DIR=/app/uploads`, `RP_ID=dwes.ingenious-network.com`, `RP_ORIGIN=https://dwes.ingenious-network.com`, `RP_NAME=DWES`, `DEMO_MODE=false`.
4. Deploy; watch logs until `GET /api/health` on the Railway-generated URL returns `{"status":"ok"}` (deep check includes `SELECT 1` against Neon).
5. Set Railway **usage limits + email alerts** per `BILLING_AND_COST_CONTROL.md` before anything else touches it.

## 3. Frontend — Cloudflare Pages
1. Pages → connect the GitHub repo → build command `npm run build`, output `dist`, Node 22.
2. Custom domain: `dwes.ingenious-network.com` (Cloudflare handles the CNAME + TLS automatically since DNS is already on Cloudflare).
3. Verify the site loads on the custom domain (API calls will fail until step 4 — expected).

## 4. Same-origin API routing — Cloudflare Worker
1. Create a Worker bound to route `dwes.ingenious-network.com/api/*` that forwards method/headers/body to the Railway service URL and streams the response back (≈20 lines; body pass-through must be streaming — 50 MB uploads).
2. This keeps the SPA same-origin (`/api` relative base in `src/services/api.ts` untouched, CORS not in play, WebAuthn origin exact).
3. Verify: login from the public URL; upload a small drawing; download it back; run a passkey enrollment + login.

## 5. Backups — R2 + Railway cron
1. Enable R2; create private buckets `dwes-backups` (30-day lifecycle) — and `dwes-files` only if/when the object-storage migration is approved.
2. Add the backup cron service per `BACKUP_AND_RESTORE_RUNBOOK.md` §2 (nightly 02:00 UTC+4 equivalent).
3. **Run one full restore drill now** — the go-live gate requires a *tested* restore, not a configured backup.

## 6. Go-live gate
Work through `FINAL_DEPLOYMENT_CHECKLIST.md` top to bottom. DNS cutover (§3 of the DNS guide, step 5) is the LAST action, and the local deployment stays running until the checklist is fully green.

## 7. Rollback (any step)
- Frontend: Pages keeps every previous deployment — one-click rollback.
- API: Railway redeploys any previous build; env vars are versioned in the dashboard.
- DB: local WiringSchemeDB is still authoritative until cutover; afterwards, restore per the backup runbook.
- DNS: restore the previous record value (kept from the inventory), TTL 300 s means ≤5 min propagation.

## 8. CI/CD wiring (after first manual deploy works)
- Keep `ci.yml` as the gate (build + tests + e2e).
- Auto-deploy: Railway and Pages both redeploy on push to `main` natively — the SSH-based `deploy-dev.yml`/`deploy-production-oci.yml` workflows are **not used** in this architecture (disable their triggers; they remain for a future VPS/OCI path).
- Protect `main`: require CI green + PR review (even self-review) before merge.
