# Second Review — Cursor Agent (fresh eyes)

**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Range:** `652c1a1`..`62a2782` (pre-fix audit)  
**Reviewer:** Cursor Agent (replaces abandoned Claude Code setup)  
**Date:** 2026-07-09

## Summary

Five commits after the OCI single-VM package improve cert renewal, Bastion deploy, production bootstrap UI, and E2E/k6 automation. The audit found **three High-severity deploy blockers** in the Bastion CI path (wrong session type, broken OCI CLI config heredoc, missing Bastion public key wiring) plus one High gap (no Terraform `app_instance_id` output). No committed secrets were found. Critical count after fixes: **0**.

## Findings

| Severity | Location | Finding | Recommendation |
|----------|----------|---------|----------------|
| **High** | `infra/oci/scripts/deploy-via-bastion.sh:18-46` | Used `create-port-forwarding-session` and `eval "$SSH_CMD" ... @host` — port-forward sessions do not provide managed SSH to the VM; first tag deploy would fail. | Switch to `create-managed-ssh-session` with `target-resource-operating-system-user-name` and pass remote script via `bash -s`. **FIXED** |
| **High** | `.github/workflows/deploy-production-oci.yml:69-76` | OCI `~/.oci/config` heredoc was YAML-indented, writing invalid config (`          [DEFAULT]`). OCI CLI auth would fail in deploy job. | Write config with unindented `echo` lines. **FIXED** |
| **High** | `.github/workflows/deploy-production-oci.yml:78-90` | `OCI_BASTION_SSH_PUBLIC_KEY` not written; script expected `${SSH_KEY}.pub` beside private key file. Bastion session create would fail. | Write public key to `/tmp/dwes_bastion_key.pub` from secret. **FIXED** |
| **High** | `infra/oci/terraform/outputs.tf` | No `app_instance_id` output; `OCI_VM_INSTANCE_ID` secret had no terraform source. | Add `output "app_instance_id"`. **FIXED** |
| **Medium** | `infra/oci/terraform/cloud-init.yaml` | Cert sync cron weekly (`0 3 * * 0`); certbot renew copies PEMs but nginx reload only via sync script. | Run sync daily (`0 3 * * *`). **FIXED** |
| **Medium** | `infra/docker/docker-compose.yml:100` | Certbot renew loop does not reload nginx (hook copies to shared volume only). | Daily host `sync-letsencrypt-to-nginx.sh` cron mitigates; document in runbook. |
| **Medium** | `docs/HUMAN-ACTIONS.md` §D | Missing `OCI_BASTION_SSH_PUBLIC_KEY` in secrets table. | Add secret before first deploy. **FIXED in HUMAN-ACTIONS** |
| **Low** | `infra/oci/scripts/deploy-via-bastion.sh:36` | `git fetch --tags origin` assumes `/opt/dwes` remote named `origin`. | Document in deploy prompt; verify on VM bootstrap. |
| **Low** | `e2e/tests/role-journeys.spec.ts` | Loose heading matchers may flake on UI copy changes. | Acceptable for smoke; tighten later. |

## No issues found

- No committed JWT secrets, API keys, or `.env` files in diff range.
- `login-hints` / demo seed gated when `DEMO_MODE=false` (verified in prior pass).
- Certbot deploy-hook now targets `/nginx-out` mounted to `${DATA_ROOT}/ssl/nginx`.
- `RP_ID` / `RP_ORIGIN` / `CORS_ORIGINS` templated from `DWES_DOMAIN` in `.env.production.example`.
- Production bootstrap RBAC allows `ops_director` self-password (`users-rbac.ts`).
- Bind mounts under `/mnt/dwes-data/{postgres,uploads,auth,backups,ssl}` consistent across compose and cloud-init.

## Needs human confirmation

- OCI Bastion managed SSH with user `dwes` (cloud-init creates user; verify SSH username on first Bastion session).
- Windows Application Control blocking `terraform-provider-oci` locally — use Docker `hashicorp/terraform` image or CI for validate/plan (not a deploy blocker).

---

## Finding → fix table (post-remediation)

| Finding | Fix | Commit |
|---------|-----|--------|
| Bastion port-forwarding session + wrong SSH target | `create-managed-ssh-session` + `bash -s` remote script | *(this commit)* |
| OCI CLI config heredoc indentation | Unindented `echo` block in workflow | *(this commit)* |
| Missing Bastion SSH public key in CI | Write `OCI_BASTION_SSH_PUBLIC_KEY` to `.pub` file | *(this commit)* |
| Missing `app_instance_id` terraform output | Added `outputs.tf` entry | *(this commit)* |
| Weekly cert nginx reload | Daily cert sync cron in cloud-init | *(this commit)* |
| HUMAN-ACTIONS missing public key secret | Updated §D | *(this commit)* |
