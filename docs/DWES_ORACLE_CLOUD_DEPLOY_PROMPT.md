# DWES Oracle Cloud deploy guide (me-dubai-1)

Single **VM.Standard.A1.Flex** (2 OCPU / 12 GB), Cloudflare DNS, Let's Encrypt, Nginx edge. Progress: [DEPLOY-TIMELINE.md](./DEPLOY-TIMELINE.md).

## 1. Prerequisites

- OCI PAYG tenancy, compartment OCID, Object Storage namespace
- Domain in **Cloudflare** (gray-cloud A record for HTTP-01)
- GitHub secrets: `OCI_OCIR_*`, `OCI_BASTION_ID`, `OCI_VM_HOST`, smoke credentials
- Local: fresh `pg_dump` of WiringSchemeDB, `backend/uploads/` project folders

## 2. Terraform

```bash
cd infra/oci/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit compartment_id, namespace, ssh_public_key, bastion_client_cidr_allow_list
terraform init && terraform apply
```

Outputs: `app_public_ip`, `bastion_id`, `vault_id` → Cloudflare A record, Vault secrets.

## 3. VM bootstrap

```bash
# Bastion SSH session to private VM IP
git clone <repo> /opt/dwes
cd /opt/dwes
cp infra/docker/.env.production.example infra/docker/.env
# Set DWES_DOMAIN, CORS_ORIGINS, RP_ID, RP_ORIGIN (all same apex host)
bash infra/oci/scripts/fetch-secrets.sh   # or fill JWT_SECRET, POSTGRES_PASSWORD manually
bash infra/oci/scripts/init-letsencrypt.sh
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d
```

**WebAuthn:** `RP_ID`, `RP_ORIGIN`, `CORS_ORIGINS` must match `DWES_DOMAIN`. Verify:

```bash
bash infra/oci/scripts/verify-webauthn-prod.sh https://$DWES_DOMAIN
```

## 4. Data migration (cutover)

**Expected downtime: 1–3 hours**

| Step | Action |
|------|--------|
| T-24h | Announce freeze window |
| T-0 | Stop local DWES autostart; freeze edits |
| 1 | `pg_dump -Fc -f backend/backups/cutover_YYYYMMDD.dump WiringSchemeDB` |
| 2 | Copy dump to VM; `bash infra/oci/scripts/migrate-db.sh /path/cutover.dump` |
| 3 | `bash infra/oci/scripts/migrate-uploads.sh dwes@<private-ip> backend/uploads` (via Bastion) |
| 4 | `bash infra/oci/scripts/verify-migration.sh https://$DWES_DOMAIN` |
| 5 | `DEACTIVATE_DEMO_SEEDS=true bash infra/oci/scripts/init-production-bootstrap.sh` |
| 6 | Smoke: login each role; sample drawing download |
| 7 | Admin/director: password rotation + WebAuthn enrollment |
| 8 | Cloudflare DNS → VM IP (if not done); announce new URL |

## 5. CI/CD production deploy

Push tag `v*` or run **Deploy Production OCI** workflow. Deploys via Bastion SSH → `infra/oci/scripts/deploy.sh`. Rollback: `infra/oci/scripts/rollback.sh`.

## 6. Staging

Port **8443**: `docker compose -f infra/docker/docker-compose.staging.yml --env-file infra/docker/.env up -d`

## 7. Backups

Daily cron (cloud-init): `backup` compose profile → `/mnt/dwes-data/backups` → Object Storage via `backup-oci.sh`.

## 8. Scale

When concurrent users **> 150**: see `infra/oci/terraform/modules/scale-tier/README.md`.

## 9. Director (Chennai)

See [DIRECTOR-ACCESS.md](./DIRECTOR-ACCESS.md) — HTTPS app only, no SSH/Bastion/DB.
