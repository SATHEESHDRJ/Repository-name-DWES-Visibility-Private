# DWES OCI Deploy Timeline

**Plan:** OCI Single-VM Production (`me-dubai-1`)  
**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Started:** 2026-07-09  
**Last updated:** 2026-07-09 (local verification pass)

## Progress summary

| Metric | Value |
|--------|-------|
| **Agent implementation** | Complete |
| **Local verification** | Pass (except Terraform + Docker — tools not on laptop) |
| **Blocking human steps** | 7 (see below) |

Status: done | in progress | waiting-on-human | pending | blocked (tool missing)

---

## Estimates vs actual

| # | ID | Status | Est. agent | Actual agent | Verify result |
|---|-----|--------|------------|--------------|---------------|
| 0 | deploy-timeline | done | 15 min | 20 min | This file |
| 1 | app-security | done | 1 h | 1 h | login-hints 404 prod; health `db:connected` |
| 2 | docker-tls-volumes | done | 2 h | 1.5 h | compose config blocked (no Docker locally) |
| 3 | oci-scripts | done | 2 h | 1.5 h | Scripts written; not run on VM |
| 4 | terraform-modules | done | 4 h | 1 h | **blocked** — `terraform` not installed locally; CI will validate |
| 5 | cicd-hardening | done | 4 h | 1 h | ci.yml updated |
| 6 | docs-validation | done | 2.5 h | 1.5 h | deploy prompt, director, load test |
| 7 | webauthn-prod | waiting-on-human | 1 h | 30 min | `verify-webauthn-prod.sh` ready; needs live domain |
| 8 | load-testing | waiting-on-human | 1 h | 30 min | k6 script ready; run on prod URL |
| 9 | data-migration | waiting-on-human | 2 h | 1 h | Scripts ready; cutover not run |
| 10 | prod-account-bootstrap | done | 1.5 h | 1 h | API returns `bootstrap` on login |
| 11 | cursor-housekeeping | done | 1 h | 45 min | rules, skills, hooks, README |
| 12 | verify-build | done | 1 h | 45 min | See raw outputs below |

---

## Local verification raw outputs (2026-07-09)

### 1. `npm run build` (root) — exit 0

```
> tsc -b && vite build
✓ built in 942ms
ROOT_BUILD_EXIT=0
```

### 2. `npm --prefix backend run build` — exit 0

```
> prisma generate && nest build
✔ Generated Prisma Client (v7.8.0)
BACKEND_BUILD_EXIT=0
```

### 3. `npm --prefix backend test` — 19/19 pass, exit 0

```
ℹ pass 19
ℹ fail 0
BACKEND_TEST_EXIT=0
```

### 4. Terraform — **PENDING (tool not installed)**

```
where.exe terraform → not found
TERRAFORM_NOT_INSTALLED=1
```

Run on CI or install Terraform, then:

```bash
cd infra/oci/terraform
terraform init -backend=false
terraform validate
terraform fmt -check -recursive
```

### 5. `docker compose config` — **PENDING (Docker not installed)**

```
docker → not recognized
```

Run on OCI VM or install Docker Desktop, then:

```bash
cp infra/docker/.env.production.example infra/docker/.env
# edit secrets, then:
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env config
```

### 6. DEMO_MODE=false — API checks (port 3001)

```
GET /api/login-hints → {"message":"Not Found","statusCode":404} HTTP_STATUS=404
GET /api/health      → {"status":"ok","db":"connected",...} HTTP_STATUS=200
GET /api/env         → {"mode":"production","server_time":"..."} HTTP_STATUS=200
```

### 7. DEMO_MODE=true — local dev unchanged (backend :3002, Vite :5175)

```
GET /api/login-hints → {"hint":"Development seed credentials","accounts":[...]} HTTP_STATUS=200
GET /api/env         → {"mode":"demo","demo_mode":true,...} HTTP_STATUS=200
GET http://localhost:5175/ → HTML (Vite ready) HTTP_STATUS=200
```

Note: `dev:all` stack verified as Vite :5175 + backend with `DEMO_MODE=true` (backend used :3002 when :3001 busy).

---

## Human action queue (all pending)

### A. OCI tenancy values (for `infra/oci/terraform/terraform.tfvars`)

| Variable | You provide |
|----------|-------------|
| `compartment_id` | `ocid1.compartment.oc1..xxxx` |
| `object_storage_namespace` | From OCI Console → Object Storage |
| `ssh_public_key` | Your `ssh-ed25519 AAAA...` public key |
| `bastion_client_cidr_allow_list` | `["YOUR.PUBLIC.IP/32"]` (not `0.0.0.0/0` in prod) |
| `project_name` | e.g. `dwes-prod` |

**Commands:**

```bash
cd infra/oci/terraform
cp terraform.tfvars.example terraform.tfvars
# edit values above
terraform init
terraform apply
```

**Save outputs:** `app_public_ip`, `bastion_id`, `vault_id`, `backup_bucket`

---

### B. Production domain (Cloudflare)

| Item | Value |
|------|--------|
| `DWES_DOMAIN` | e.g. `dwes.yourcompany.ae` |
| Cloudflare | **Gray cloud** (DNS only) A record → `app_public_ip` |
| `.env` on VM | `CORS_ORIGINS=https://<DWES_DOMAIN>` |
| | `RP_ID=<DWES_DOMAIN>` |
| | `RP_ORIGIN=https://<DWES_DOMAIN>` |

---

### C. Secrets (`infra/docker/.env` on VM — never commit)

| Secret | Source |
|--------|--------|
| `JWT_SECRET` | OCI Vault `dwes-jwt-secret` or `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | OCI Vault `dwes-postgres-password` or strong random |
| `CERTBOT_EMAIL` | Your email for Let's Encrypt |

```bash
bash infra/oci/scripts/fetch-secrets.sh   # if Vault configured
bash infra/oci/scripts/init-letsencrypt.sh
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d
```

---

### D. GitHub Actions secrets

| Secret | Value |
|--------|--------|
| `OCI_OCIR_HOST` | `me-dubai-1.ocir.io` |
| `OCI_OCIR_NAMESPACE` | Tenancy namespace |
| `OCI_OCIR_USERNAME` | `tenancy/oracleidentitycloudservice/<user>` |
| `OCI_OCIR_AUTH_TOKEN` | OCIR auth token |
| `OCI_BASTION_ID` | From `terraform output bastion_id` |
| `OCI_VM_HOST` | VM **private** IP |
| `OCI_VM_USER` | `dwes` |
| `OCI_VM_SSH_KEY` | Private key for Bastion session |
| `DWES_SMOKE_USER` / `DWES_SMOKE_PASS` | Post-deploy login test (non-demo prod user) |

---

### E. Data cutover (1–3 h downtime)

```powershell
# On Windows laptop — fresh dump
pg_dump -h localhost -U postgres -Fc -f backend/backups/cutover_YYYYMMDD.dump WiringSchemeDB
```

```bash
# On VM (via Bastion)
bash infra/oci/scripts/migrate-db.sh /path/cutover.dump
bash infra/oci/scripts/migrate-uploads.sh dwes@<vm-private-ip> backend/uploads
bash infra/oci/scripts/verify-migration.sh https://$DWES_DOMAIN
DEACTIVATE_DEMO_SEEDS=true bash infra/oci/scripts/init-production-bootstrap.sh
```

---

### F. WebAuthn go-live sign-off

```bash
bash infra/oci/scripts/verify-webauthn-prod.sh https://$DWES_DOMAIN
```

Manual: enroll + fingerprint login on Sharjah device and Chennai director device.

---

### G. Load test

```bash
k6 run -e DWES_BASE_URL=https://$DWES_DOMAIN infra/load/k6/smoke-120vus.js
```

If p95 > 800 ms: set `app_ocpus=4`, `app_memory_gb=24` in `terraform.tfvars` and re-apply.

---

## Changelog

| Date | Event |
|------|-------|
| 2026-07-09 | Agent implementation complete on branch |
| 2026-07-09 | Local verification: build 0, tests 19/19, API prod/demo checks pass |
| 2026-07-09 | Terraform + Docker compose config pending (tools not on dev laptop) |
