#!/usr/bin/env bash
# Post-migration verification: DB counts, upload files, sample drawing URL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT}/infra/docker/.env"
BASE_URL="${1:-https://localhost}"

# shellcheck disable=SC1090
source "$ENV_FILE"

echo "[verify] users count"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-WiringSchemeDB}" \
  -c "SELECT role, count(*) FROM users WHERE is_active = true GROUP BY role ORDER BY role;"

echo "[verify] projects count"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-WiringSchemeDB}" \
  -c "SELECT count(*) AS projects FROM projects;"

UPLOAD_ROOT="${DATA_ROOT:-/mnt/dwes-data}/uploads"
if [ -d "$UPLOAD_ROOT" ]; then
  echo "[verify] upload file count: $(find "$UPLOAD_ROOT" -type f | wc -l)"
fi

echo "[verify] health"
curl -fsS "${BASE_URL}/api/health" | head -c 500
echo

echo "[verify] demo seed usernames (should be 0 active in production)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-WiringSchemeDB}" \
  -c "SELECT username, role FROM users WHERE username IN ('sysadmin','director1','ops_director1','supervisor1','qa1','qa2','tech1') AND is_active = true;"
