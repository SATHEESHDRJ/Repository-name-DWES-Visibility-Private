# OCI Backup and Restore

## Backup

`infra/oci/scripts/backup-oci.sh` creates:

- `wiring-scheme.dump` (pg_dump custom format)
- `uploads.tar.gz` (frame JSON + drawings)
- `manifest.json`

Local retention: 14 days. Optional upload to OCI Object Storage when `OCI_BUCKET` is set.

## Restore (disaster recovery)

1. Provision replacement VM or use the existing one; bring up the DB container first:
   `docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d postgres`.
   (`postgres` is only a Compose-network service alias on the `internal` network with no host
   port, so restore must run *through the container*, not with a host-side `-h postgres`.)
2. Restore Postgres (custom-format dump, piped into the container via stdin):

```bash
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env \
  exec -T postgres pg_restore -U postgres -d WiringSchemeDB --clean --if-exists --no-owner \
  < ${DATA_ROOT:-/opt/dwes-data}/backups/TIMESTAMP/wiring-scheme.dump
```

3. Restore uploads into the same `DATA_ROOT` the app mounts (`/opt/dwes-data` on the dev VM,
   `/mnt/dwes-data` on the block-volume prod VM — do not hardcode):

```bash
tar -xzf ${DATA_ROOT:-/opt/dwes-data}/backups/TIMESTAMP/uploads.tar.gz \
  -C ${DATA_ROOT:-/opt/dwes-data}/uploads
```

4. `docker compose ... up -d` and verify `/api/health` returns `db:connected`. No Prisma
   migrations are run (WiringSchemeDB schema is restored from the dump).

## DR target

- RPO: 24h (daily backup) — upgrade to hourly with paid DB PITR
- RTO: 2–4 hours manual restore — automate with Terraform + restore script in Phase 2

## Quarterly drill

Restore latest backup to **staging** compose stack and run login + technician smoke test.
