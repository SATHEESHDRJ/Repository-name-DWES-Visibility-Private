# OCI Backup and Restore

## Backup

`infra/oci/scripts/backup-oci.sh` creates:

- `wiring-scheme.dump` (pg_dump custom format)
- `uploads.tar.gz` (frame JSON + drawings)
- `manifest.json`

Local retention: 14 days. Optional upload to OCI Object Storage when `OCI_BUCKET` is set.

## Restore (disaster recovery)

1. Provision replacement VM (Terraform) or stop stack on existing VM.
2. Restore Postgres:

```bash
pg_restore -h postgres -U postgres -d WiringSchemeDB --clean --if-exists /backups/TIMESTAMP/wiring-scheme.dump
```

3. Restore uploads:

```bash
tar -xzf /backups/TIMESTAMP/uploads.tar.gz -C /mnt/dwes-data/uploads
```

4. `docker compose up -d` and verify `/api/health`.

## DR target

- RPO: 24h (daily backup) — upgrade to hourly with paid DB PITR
- RTO: 2–4 hours manual restore — automate with Terraform + restore script in Phase 2

## Quarterly drill

Restore latest backup to **staging** compose stack and run login + technician smoke test.
