#!/usr/bin/env bash
# Restore WiringSchemeDB dump on OCI VM (run on VM after Bastion SSH)
set -euo pipefail

DUMP="${1:?usage: migrate-db.sh /path/to/cutover.dump}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT}/infra/docker/.env"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres
echo "[migrate-db] waiting for postgres..."
for i in $(seq 1 30); do
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_isready -U "${POSTGRES_USER:-postgres}" && break
  sleep 2
done

CID="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q postgres)"
docker cp "$DUMP" "${CID}:/tmp/cutover.dump"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-WiringSchemeDB}" \
  --clean --if-exists --no-owner /tmp/cutover.dump

echo "[migrate-db] restore complete"
