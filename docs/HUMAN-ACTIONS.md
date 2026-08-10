# DWES OCI — human action queue

**Status:** Go-live **blocked** — credentials not visible to agent session (2026-07-09 21:50 UTC+4).  
**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Full report:** [GO-LIVE-REPORT.md](./GO-LIVE-REPORT.md)

---

## BLOCKER — unblock go-live (5 min)

The agent cannot see these files in the Cursor shell. **Create them on disk** before `npm run go-live`:

| File | Action |
|------|--------|
| `deploy-secrets.local.env` | Copy `deploy-secrets.local.env.example` → fill all values |
| `%USERPROFILE%\.oci\config` | OCI API user + key (or set `OCI_*` in secrets file) |
| `%USERPROFILE%\.ssh\dwes_oci` + `.pub` | Ed25519 key pair for Bastion |
| `gh auth login` | Authenticate GitHub CLI |
| `git remote add origin <url>` | **Required** — go-live now aborts up front if there is no `origin` remote (the github step pushes the deploy tag). |

Then:

```powershell
npm run go-live:plan        # optional: terraform plan preview only, no changes
npm run go-live:preflight   # exit 0 required (also checks origin remote + SSH key files)
npm run go-live
```

> If VM bring-up (Deploy Production OCI workflow) is still finishing when go-live reaches the load step, it skips k6 gracefully — re-run `npm run go-live -- --from=post` afterward.

**You can sleep** — migration dump and uploads are prepped. Go-live runs unattended once preflight passes.

---

## A. Terraform apply (OCI PAYG, me-dubai-1)

Automated by `npm run go-live` when preflight passes.

**Manual fallback:**

```bash
cd infra/oci/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform plan && terraform apply
```

**Save outputs:** `app_public_ip`, `app_private_ip`, `bastion_id`, `vault_id`, `vault_key_id`, `backup_bucket`, `app_instance_id`.

---

## B. Domain + Cloudflare DNS

Use **`dwes.ingenious-network.com`** (canonical RP_ID / WebAuthn; see [DNS_AND_SSL_GUIDE.md](./hosting/DNS_AND_SSL_GUIDE.md)).

Automated: gray-cloud A record via Cloudflare API (`proxied=false`).

---

## C. Secrets on VM

Automated via Bastion: Vault secrets + `fetch-secrets.sh` + `init-letsencrypt.sh` + `docker compose up -d`.

---

## D. GitHub Actions secrets

Automated by go-live script (`gh secret set` for all §D keys) + staging tag push.

| Secret | Value |
|--------|--------|
| `OCI_OCIR_HOST` | `me-dubai-1.ocir.io` |
| `OCI_OCIR_NAMESPACE` | Tenancy namespace |
| `OCI_OCIR_USERNAME` | `tenancy/oracleidentitycloudservice/<user>` |
| `OCI_OCIR_AUTH_TOKEN` | OCIR auth token |
| `OCI_BASTION_ID` | `terraform output bastion_id` |
| `OCI_VM_INSTANCE_ID` | `terraform output app_instance_id` |
| `OCI_VM_HOST` | `terraform output app_private_ip` |
| `OCI_VM_USER` | `dwes` |
| `OCI_VM_SSH_KEY` | Private key PEM |
| `OCI_BASTION_SSH_PUBLIC_KEY` | Matching `.pub` content |
| `OCI_TENANCY_OCID` / `OCI_USER_OCID` / `OCI_FINGERPRINT` / `OCI_PRIVATE_KEY` | OCI API |
| `DWES_SMOKE_USER` / `DWES_SMOKE_PASS` | Post-deploy login |

---

## E. Data cutover

**Prep done:** `backend/backups/cutover_20260709.dump` (47 KB), 123 upload files counted.

On VM via Bastion (after go-live step 3):

```bash
bash infra/oci/scripts/migrate-db.sh /path/cutover.dump
bash infra/oci/scripts/migrate-uploads.sh ...
bash infra/oci/scripts/verify-migration.sh https://$DWES_DOMAIN
DEACTIVATE_DEMO_SEEDS=true bash infra/oci/scripts/init-production-bootstrap.sh
```

---

## F. WebAuthn sign-off (ONLY human item after go-live)

Sharjah tablet + Chennai director — password bootstrap modal, then fingerprint enroll.

```bash
bash infra/oci/scripts/verify-webauthn-prod.sh https://$DWES_DOMAIN
```

---

## G. Load test

```bash
npm run load:smoke -- https://$DWES_DOMAIN
```

If p95 > 800 ms: `TF_APP_OCPUS=4`, `TF_APP_MEMORY_GB=24` in secrets → re-run go-live from terraform step.

---

## Tool status (agent session 2026-07-09)

| Tool | Status |
|------|--------|
| Terraform | OK |
| Docker | OK |
| OCI CLI | Installed; **no config** |
| GitHub CLI | Installed; **not authed** |
| k6 | Not verified |
| pg_dump | Via `postgres:18-alpine` Docker image |
