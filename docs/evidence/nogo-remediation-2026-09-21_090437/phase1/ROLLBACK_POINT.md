# Phase 1 — pre-rebuild rollback point (no secrets)

timestamp: 2026-09-21T09:04:37+04:00
git:
  root: C:/dev/DWES-OCI-RESTORES/2026-07-25_115805_OCI-PRODUCTION-EXACT/02_GIT_PRODUCTION_SOURCE/DWES
  branch: change/technician-single-wire-matrix-2026-07-27
  head: 949b6806377e01f9b12229f9292f37026133b7b3
  dirty: true

containers_before:
  api:
    name: dwes_oci_restore_api_20260725_082028
    image_tag: dwes-api:oci-restore-20260725
    image_id: d6a77070d6a6
    ports: "127.0.0.1:3101->3001"
  nginx:
    name: dwes_oci_restore_nginx_20260725_082028
    image_tag: dwes-nginx:oci-restore-20260725
    image_id: bec5c460d5a4
    ports: "127.0.0.1:5275->80, 5280->80"
  postgres:
    name: dwes_oci_restore_postgres_20260725_082028
    image: postgres:18-alpine
    note: volume preserved — do not recreate with -v

volumes_preserved:
  - dwes_oci_restore_postgres_20260725_082028
  - dwes_oci_restore_uploads_20260725_082028
  - dwes_oci_restore_auth_20260725_082028

compose: 08_LOCAL_RESTORE_WORKSPACE/docker-compose.restore.yml
rollback: retag/rebuild previous image IDs above; do not wipe volumes
health_before: ok/degraded (sse pg)
