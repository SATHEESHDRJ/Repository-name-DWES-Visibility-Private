#!/usr/bin/env bash
# Daily backup: PostgreSQL dump + uploads tarball → local + optional OCI Object Storage
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M)"
DEST="${BACKUP_ROOT}/${TIMESTAMP}"
mkdir -p "$DEST"

echo "[backup] PostgreSQL dump..."
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-WiringSchemeDB}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

pg_dump -h "$PGHOST" -U "$PGUSER" -Fc "$PGDATABASE" -f "${DEST}/wiring-scheme.dump"

echo "[backup] uploads archive..."
if [ -d /uploads ]; then
  tar -czf "${DEST}/uploads.tar.gz" -C /uploads .
fi

echo "[backup] manifest"
cat > "${DEST}/manifest.json" <<EOF
{"timestamp":"${TIMESTAMP}","db":"${PGDATABASE}","region":"${OCI_REGION:-me-dubai-1}"}
EOF

if command -v oci >/dev/null 2>&1 && [ -n "${OCI_BUCKET:-}" ]; then
  echo "[backup] uploading to OCI Object Storage bucket ${OCI_BUCKET}..."
  oci os object put --bucket-name "$OCI_BUCKET" --file "${DEST}/wiring-scheme.dump" \
    --name "daily/${TIMESTAMP}/wiring-scheme.dump" --force
  if [ -f "${DEST}/uploads.tar.gz" ]; then
    oci os object put --bucket-name "$OCI_BUCKET" --file "${DEST}/uploads.tar.gz" \
      --name "daily/${TIMESTAMP}/uploads.tar.gz" --force
  fi
fi

find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true
echo "[backup] done → ${DEST}"
