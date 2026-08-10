#!/usr/bin/env bash
# Zero-downtime rolling deploy on OCI VM (Docker Compose)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT}/infra/docker/.env"
PREVIOUS_TAG_FILE="${ROOT}/infra/docker/.previous-tag"

API_IMAGE="${1:-${DWES_API_IMAGE:-dwes-api:latest}}"
NGINX_IMAGE="${2:-${DWES_NGINX_IMAGE:-dwes-nginx:latest}}"

export DWES_API_IMAGE="$API_IMAGE"
export DWES_NGINX_IMAGE="$NGINX_IMAGE"

if [ -f "$PREVIOUS_TAG_FILE" ]; then
  cp "$PREVIOUS_TAG_FILE" "${PREVIOUS_TAG_FILE}.rollback"
fi
echo "api=${API_IMAGE}" > "$PREVIOUS_TAG_FILE"
echo "nginx=${NGINX_IMAGE}" >> "$PREVIOUS_TAG_FILE"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull api nginx || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps api
echo "waiting for API health..."
for i in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps nginx
echo "deploy complete"
