# Production readiness (OCI me-dubai-1)

**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Status:** Code complete — awaiting human cutover (`terraform apply`, data migration, WebAuthn device sign-off)

## Automated checks

| Check | Status |
|-------|--------|
| `npm run build` | Pass (2026-07-09) |
| `npm --prefix backend test` | 19/19 pass (2026-07-09) |
| `terraform validate` | CI job — Terraform not installed on dev laptop |
| Playwright E2E (5 roles) | Scaffold in `e2e/`; needs `DWES_E2E_BASE_URL` |
| k6 120 VUs p95 < 800ms | Script in `infra/load/k6/`; run post-deploy |

## Security

| Item | Status |
|------|--------|
| `login-hints` gated in production | Done |
| `/api/env` minimal in production | Done |
| Seed disabled when `NODE_ENV=production` | Done |
| Deep `/api/health` (SELECT 1) | Done |
| Bastion + no public SSH (Terraform) | IaC ready |
| Secrets in Vault template | `fetch-secrets.sh` |

## Cutover (human)

- [ ] `terraform apply`
- [ ] Data migration per `DWES_ORACLE_CLOUD_DEPLOY_PROMPT.md`
- [ ] Admin/director bootstrap + WebAuthn HTTPS
- [ ] k6 load test on production URL

See [DEPLOY-TIMELINE.md](../DEPLOY-TIMELINE.md).
