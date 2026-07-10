# DWES OCI Operations Runbook

## Environments

| Env | Compose file | Host port | DEMO_MODE |
|-----|--------------|-----------|-----------|
| Production | `infra/docker/docker-compose.yml` | 443 | false |
| Staging | `infra/docker/docker-compose.staging.yml` | 8443 | true |
| UAT | staging compose + prod-like `.env` | 8443 | false |
| Development | local `npm run dev:all` | 5175/3001 | true |

## Deploy paths

Two supported paths (choose one):

1. **Simplified single-VM, push-to-main (current dev/demo — needs only email + DNS + VM IP):**
   `git push origin main` → GitHub Actions `Deploy Dev (main)` → validate (build+tests) → SSH →
   `infra/oci/scripts/redeploy-dev.sh` on the VM (native build, health-gate on `db:connected`,
   auto-rollback to prior commit on failure, preserves volumes). See [DEV-DEPLOY.md](DEV-DEPLOY.md).
2. **Full production (OCIR + Bastion + Vault + Terraform):** the `deploy.sh` / tag-`v*` path below.

## Production hardening (applied)

- **Log rotation:** all long-running containers use `json-file` with `max-size`/`max-file`
  (compose `x-logging` anchor; override via `LOG_MAX_SIZE` / `LOG_MAX_FILE`) so logs can't fill
  the disk. Ref: docs.docker.com/config/containers/logging/json-file/.
- **TLS/HTTP2:** nginx uses `listen 443 ssl;` + `http2 on;` (nginx ≥1.25 form); TLS 1.2/1.3 only;
  HSTS + security-headers snippet; per-zone rate limits (`api_limit`, `login_limit`).
- **Non-root app:** API container runs as `dwes` (entrypoint chowns bind mounts then drops via
  `gosu`). Postgres on `internal` network (no public egress); only nginx is on the `public` network.
- **Firewall:** VM ingress limited to **22, 80, 443**. Prod Terraform path removes public 22
  (Bastion only); the simplified path keeps 22 for the CI SSH deploy — restrict its source to the
  GitHub Actions egress or your admin IP if hardening further.
- **Secrets:** never in git/images/logs — injected at runtime (`.env` from the `DWES_ENV_FILE`
  GitHub Secret on the simplified path, or OCI Vault on the prod path). See §"Secrets" below.

## Go-live inputs (only three, all configurable — no dummy values baked in)

| Input | Where it goes | Placeholder today |
|-------|---------------|-------------------|
| Admin email | `CERTBOT_EMAIL` in `.env` (Let's Encrypt contact) + OCI alarm subscriber | blank → `admin@$DWES_DOMAIN` |
| DNS A record | `dwes.<domain>` → VM public IP (DNS-only for HTTP-01) | domain in `DWES_DOMAIN`/`RP_ID`/`RP_ORIGIN`/`CORS_ORIGINS` |
| VM public IP | `DEPLOY_SSH_HOST` GitHub Secret + the DNS A record | GitHub Secret (empty) |

## Deploy production

```bash
# On VM
cd /opt/dwes
bash infra/oci/scripts/deploy.sh <api-image> <nginx-image>
```

GitHub Actions: push tag `v*` or run **Deploy Production OCI** workflow.

## Rollback

```bash
bash infra/oci/scripts/rollback.sh
```

## Health checks

- Edge: `curl -fsS https://$DWES_DOMAIN/healthz`
- API: `curl -fsS https://$DWES_DOMAIN/api/health`
- Container: `docker compose ps` — all `healthy`

## TLS

- Production: Certbot profile `docker compose --profile certbot`
- Initial bootstrap: self-signed in `infra/docker/ssl/fullchain.pem` + `privkey.pem`
- **Renewal reload:** the certbot renew loop copies fresh PEMs into the shared nginx ssl mount but does **not** itself reload nginx. The daily host cron `sync-letsencrypt-to-nginx.sh` performs the copy + `nginx -s reload`. After a manual `certbot renew`, run `bash infra/docker/scripts/sync-letsencrypt-to-nginx.sh` (or `docker compose exec nginx nginx -s reload`) so the new cert is served.

## Secrets (OCI Vault)

Store in Vault, inject at deploy:

- `JWT_SECRET`, `POSTGRES_PASSWORD`
- OCIR auth token (CI only)

## Monitoring

- OCI Monitoring alarms: CPU > 80%, disk > 85%, health endpoint down
- Logs: `docker compose logs -f api nginx`
- Audit: `session_log` table in WiringSchemeDB

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 502 on login | `docker compose logs api` — Postgres ready? |
| Upload fails | Nginx `client_max_body_size`, disk space on volume |
| WebAuthn fails | `RP_ID` / `RP_ORIGIN` match public HTTPS domain |
| Chennai slow | Expected ~100ms+ to UAE; plan `ap-hyderabad-1` replica |

## Scheduled backup

Cron on VM (daily 02:00 UTC):

```cron
0 2 * * * docker compose -f /opt/dwes/infra/docker/docker-compose.yml --profile backup run --rm backup
```
