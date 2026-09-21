#!/bin/bash
set -e
TS=$(date -u +%Y-%m-%d-%H%M%S)
BK=/opt/dwes-data/backups/pre-demo-${TS}.sql.gz
docker exec dwes-production-postgres-1 pg_dump -U postgres -d WiringSchemeDB | gzip > "$BK"
ls -la "$BK"
echo "SIZE:$(stat -c%s "$BK")"
echo "BACKUP_PATH:$BK"