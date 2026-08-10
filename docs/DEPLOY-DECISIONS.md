# DWES OCI deploy — autonomous decisions log

**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Recorded:** 2026-07-09 (overnight agent run)

Decisions made without human input. Override with director/ops before cutover if needed.

| # | Topic | Decision | Rationale |
|---|--------|----------|-----------|
| 1 | Production domain (placeholder) | `dwes.ingeniousnetwork.com` | Best if Ingenious Network FZC already owns `ingeniousnetwork.com` — one DNS record only. |
| 2 | Domain fallback | `dwes.ingenious.network` (~$20–30/yr) | Use if parent `.com` is not owned. Same value for `DWES_DOMAIN`, `RP_ID`, `RP_ORIGIN`, `CORS_ORIGINS`. |
| 3 | SSH access | Bastion only; security list allows 80/443 only | Matches Terraform in `security.tf`; no public port 22. |
| 4 | CI deploy path | `deploy-via-bastion.sh` + OCI CLI | Replaces direct `appleboy/ssh-action` to public IP. |
| 5 | Certbot renew | Deploy-hook copies to nginx ssl mount; host `sync-letsencrypt-to-nginx.sh` reloads nginx | Fixes broken `/etc/letsencrypt/nginx-out` path. Host cron can run sync after renew. |
| 6 | Bootstrap enforcement | Blocking modal in UI for `system_admin` / `ops_director` when `bootstrap.required` | API already returns flags; UI must enforce before dashboard access. |
| 7 | Director password change | Allow `ops_director` self-update of `password` only in RBAC | Required for production bootstrap; was missing in `users-rbac.ts`. |
| 8 | E2E target | Docker Compose on `localhost:18080`, `DEMO_MODE=true` | Production nginx stack with demo seeds; bootstrap off in demo mode. |
| 9 | k6 default URL | `http://localhost:18080` when no arg | Matches E2E compose HTTP port. |
| 10 | Terraform / Docker on dev laptop | Document in `HUMAN-ACTIONS.md` if tools missing | CI validates Terraform; VM validates Docker at deploy time. |
