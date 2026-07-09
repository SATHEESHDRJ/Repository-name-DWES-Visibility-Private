# DWES OCI — human action queue

**Status:** Blocking items the agent cannot complete overnight.  
**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Last updated:** 2026-07-09

Skip and continue agent work when blocked; items stay here until you complete them.

---

## A. Terraform apply (OCI PAYG, me-dubai-1)

**You provide:**

| Variable | Example |
|----------|---------|
| `compartment_id` | `ocid1.compartment.oc1..xxxx` |
| `object_storage_namespace` | From Console → Object Storage |
| `ssh_public_key` | Your `ssh-ed25519 AAAA...` |
| `bastion_client_cidr_allow_list` | `["YOUR.PUBLIC.IP/32"]` |

**Commands:**

```bash
cd infra/oci/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with values above
terraform init
terraform plan
terraform apply
```

**Save outputs:** `app_public_ip`, `bastion_id`, `vault_id`, `backup_bucket`, instance OCID (for `OCI_VM_INSTANCE_ID`).

---

## B. Domain + Cloudflare DNS

**Decision:** See [DEPLOY-DECISIONS.md](./DEPLOY-DECISIONS.md) — prefer `dwes.ingeniousnetwork.com`, else `dwes.ingenious.network`.

1. Confirm domain ownership with director.
2. Cloudflare: **gray cloud** (DNS only) A record → `app_public_ip`.
3. On VM `infra/docker/.env`:

```
DWES_DOMAIN=<chosen-host>
CORS_ORIGINS=https://<chosen-host>
RP_ID=<chosen-host>
RP_ORIGIN=https://<chosen-host>
```

---

## C. Secrets on VM

```bash
# On VM via Bastion
bash infra/oci/scripts/fetch-secrets.sh   # if Vault populated
# OR set manually in infra/docker/.env:
# JWT_SECRET, POSTGRES_PASSWORD, CERTBOT_EMAIL
bash infra/oci/scripts/init-letsencrypt.sh
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d
```

---

## D. GitHub Actions secrets

| Secret | Value |
|--------|--------|
| `OCI_OCIR_HOST` | `me-dubai-1.ocir.io` |
| `OCI_OCIR_NAMESPACE` | Tenancy namespace |
| `OCI_OCIR_USERNAME` | `tenancy/oracleidentitycloudservice/<user>` |
| `OCI_OCIR_AUTH_TOKEN` | OCIR auth token |
| `OCI_BASTION_ID` | `terraform output bastion_id` |
| `OCI_VM_INSTANCE_ID` | App VM instance OCID |
| `OCI_VM_HOST` | VM **private** IP |
| `OCI_VM_USER` | `dwes` |
| `OCI_VM_SSH_KEY` | Private key (Bastion session) |
| `OCI_BASTION_SSH_PUBLIC_KEY` | Matching public key file path (optional if `.pub` beside private key) |
| `OCI_TENANCY_OCID` | For OCI CLI in deploy job |
| `OCI_USER_OCID` | API user OCID |
| `OCI_FINGERPRINT` | API key fingerprint |
| `OCI_PRIVATE_KEY` | API private key PEM |
| `DWES_SMOKE_USER` / `DWES_SMOKE_PASS` | Post-deploy login (non-demo prod user) |

---

## E. Data cutover (1–3 h downtime)

```powershell
# Windows laptop — fresh dump (does not modify live DB)
pg_dump -h localhost -U postgres -Fc -f backend/backups/cutover_YYYYMMDD.dump WiringSchemeDB
```

```bash
# On VM via Bastion
bash infra/oci/scripts/migrate-db.sh /path/cutover.dump
bash infra/oci/scripts/migrate-uploads.sh dwes@<vm-private-ip> backend/uploads
bash infra/oci/scripts/verify-migration.sh https://$DWES_DOMAIN
DEACTIVATE_DEMO_SEEDS=true bash infra/oci/scripts/init-production-bootstrap.sh
```

---

## F. WebAuthn sign-off

```bash
bash infra/oci/scripts/verify-webauthn-prod.sh https://$DWES_DOMAIN
```

Manual: Sharjah tablet + Chennai director — password bootstrap modal, then fingerprint enroll.

---

## G. Load test

```bash
k6 run -e DWES_BASE_URL=https://$DWES_DOMAIN infra/load/k6/smoke-120vus.js
# or: npm run load:smoke -- https://$DWES_DOMAIN
```

If p95 > 800 ms: `app_ocpus=4`, `app_memory_gb=24` in `terraform.tfvars`, then `terraform apply`.

---

## Tool gaps (dev laptop)

| Tool | Status | Action |
|------|--------|--------|
| Terraform CLI | May be missing locally | CI validates; install for local `terraform plan` |
| Docker Desktop | May be missing locally | Required for local E2E compose; install or run E2E on VM |
