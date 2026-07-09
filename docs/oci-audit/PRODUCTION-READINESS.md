# Production readiness (OCI me-dubai-1)

**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Status:** Agent work complete — awaiting human cutover (`terraform apply`, data migration, WebAuthn device sign-off)

## Automated checks

| Check | Status |
|-------|--------|
| `npm run build` | Pass (2026-07-09 overnight) |
| `npm --prefix backend test` | 24/24 pass |
| `terraform validate` | CI job (not on dev laptop) |
| Playwright E2E (5 roles) | `npm run e2e:compose` — requires Docker |
| k6 120 VUs p95 < 800ms | `npm run load:smoke` — run post-deploy |
| Certbot renew path | Fixed — deploy-hook + `sync-letsencrypt-to-nginx.sh` |
| Bastion deploy workflow | Fixed — `deploy-via-bastion.sh` |
| Production bootstrap UI | Done — `ProductionBootstrapGate` |

## Security

| Item | Status |
|------|--------|
| `login-hints` gated in production | Done |
| `/api/env` minimal in production | Done |
| Seed disabled when `NODE_ENV=production` | Done |
| Deep `/api/health` (SELECT 1) | Done |
| Bastion + no public SSH (Terraform) | IaC ready |
| Director self-password RBAC | Done |
| Secrets in Vault template | `fetch-secrets.sh` |

## Cutover (human)

- [ ] `terraform apply` — [HUMAN-ACTIONS.md](../HUMAN-ACTIONS.md) §A
- [ ] Domain + Cloudflare DNS — §B
- [ ] Data migration — §E
- [ ] Admin/director bootstrap + WebAuthn HTTPS — §F
- [ ] k6 load test — §G

See [DEPLOY-TIMELINE.md](../DEPLOY-TIMELINE.md), [SECURITY-NETWORK-AUDIT.md](./SECURITY-NETWORK-AUDIT.md).
