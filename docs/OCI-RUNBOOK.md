# DWES OCI Operations Runbook

## Environments

| Env | Compose file | Host port | DEMO_MODE |
|-----|--------------|-----------|-----------|
| Production | `infra/docker/docker-compose.yml` | 443 | false |
| Staging | `infra/docker/docker-compose.staging.yml` | 8443 | true |
| UAT | staging compose + prod-like `.env` | 8443 | false |
| Development | local `npm run dev:all` | 5175/3001 | true |

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
