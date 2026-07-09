# DWES OCI — Morning Report (2026-07-09 overnight)

**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Agent run:** Overnight autonomous (no human input)

---

## Done overnight

| Task | Status |
|------|--------|
| Agent Review issue 1 — certbot renew wrong path | **Fixed** — deploy-hook + `sync-letsencrypt-to-nginx.sh` |
| Agent Review issue 2 — CI deploy vs no-public-SSH | **Fixed** — `deploy-via-bastion.sh` + workflow |
| Director self-password RBAC | **Fixed** — `users-rbac.ts` + controller role |
| Production bootstrap UI | **Done** — `ProductionBootstrapGate` + modal |
| Backend tests | **24/24 pass** (incl. bootstrap service tests) |
| Root + backend build | **Exit 0** |
| E2E scaffold | **Done** — `docker-compose.e2e.yml`, `e2e-stack.mjs`, hardened Playwright |
| k6 one-command | **Done** — `npm run load:smoke` |
| Docs | `DEPLOY-DECISIONS.md`, `HUMAN-ACTIONS.md`, audit updates |
| DEMO_MODE=false gates | Health `db:connected` verified |

## Skipped (human / tool blocked)

| Item | Reason |
|------|--------|
| `terraform apply` | Needs compartment OCID, namespace, SSH key — see below |
| `docker compose config` / E2E local run | Docker not installed on dev laptop |
| `terraform validate` local | Terraform CLI not installed (CI validates) |
| k6 on production URL | No live domain yet |
| Data migration | Requires VM + Bastion |

---

## Your morning steps (copy-paste)

### 1. Pull latest branch

```bash
cd C:\Users\sathe\OneDrive\Desktop\DWES
git fetch origin
git switch change/oci-single-vm-prod-2026-07-09
git pull
```

### 2. Domain decision (director)

Prefer **`dwes.ingeniousnetwork.com`** if you own `ingeniousnetwork.com`; else register **`dwes.ingenious.network`**.

Use the **same host** for: `DWES_DOMAIN`, `RP_ID`, `RP_ORIGIN`, `CORS_ORIGINS`.

### 3. Terraform apply

```bash
cd infra/oci/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit: compartment_id, object_storage_namespace, ssh_public_key, bastion_client_cidr_allow_list
terraform init
terraform plan
terraform apply
```

Save outputs:

```bash
terraform output app_public_ip
terraform output bastion_id
terraform output -raw backup_bucket
```

### 4. Cloudflare DNS (gray cloud)

A record: `<chosen-domain>` → `<app_public_ip>` (DNS only, not proxied).

### 5. VM secrets + stack

SSH via OCI Bastion to VM, then:

```bash
cd /opt/dwes
cp infra/docker/.env.production.example infra/docker/.env
# Set: DWES_DOMAIN, CORS_ORIGINS, RP_ID, RP_ORIGIN, JWT_SECRET, POSTGRES_PASSWORD, CERTBOT_EMAIL
bash infra/oci/scripts/init-letsencrypt.sh
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d
curl -fsS https://$DWES_DOMAIN/healthz
curl -fsS https://$DWES_DOMAIN/api/health
```

### 6. GitHub Actions secrets

See [docs/HUMAN-ACTIONS.md](./HUMAN-ACTIONS.md) §D — add `OCI_BASTION_ID`, `OCI_VM_INSTANCE_ID`, OCIR + OCI API keys.

### 7. Data cutover

```powershell
pg_dump -h localhost -U postgres -Fc -f backend/backups/cutover_YYYYMMDD.dump WiringSchemeDB
```

On VM (Bastion):

```bash
bash infra/oci/scripts/migrate-db.sh /path/cutover.dump
bash infra/oci/scripts/migrate-uploads.sh dwes@<vm-private-ip> /path/to/uploads
bash infra/oci/scripts/verify-migration.sh https://$DWES_DOMAIN
DEACTIVATE_DEMO_SEEDS=true bash infra/oci/scripts/init-production-bootstrap.sh
```

### 8. WebAuthn sign-off

- Sharjah tablet: login → bootstrap password modal → fingerprint enroll
- Chennai director: same on `https://<domain>`

```bash
bash infra/oci/scripts/verify-webauthn-prod.sh https://$DWES_DOMAIN
```

### 9. Load test

```bash
npm run load:smoke -- https://$DWES_DOMAIN
```

---

## Local verification (re-run anytime)

```bash
npm run build
npm --prefix backend run build
npm --prefix backend test
```

With Docker installed:

```bash
npm run e2e:compose
npm run load:smoke
```

---

## Agent Review issues — resolution

1. **Certbot renew** — Was copying to non-existent `/etc/letsencrypt/nginx-out`. Now copies to mounted `${DATA_ROOT}/ssl/nginx`; host script reloads nginx.
2. **Deploy SSH** — Terraform blocks port 22. GitHub deploy now uses OCI Bastion port-forwarding session.

Details: [docs/DEPLOY-DECISIONS.md](./DEPLOY-DECISIONS.md)

---

## Unstaged local files

Unrelated UI/launcher changes remain **unstaged** — not part of OCI commits. Safe to keep working on separately.
