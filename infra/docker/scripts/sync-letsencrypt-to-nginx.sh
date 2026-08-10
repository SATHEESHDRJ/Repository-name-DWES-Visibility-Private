#!/usr/bin/env bash
# Host-side: copy Let's Encrypt live certs to nginx ssl dir and reload nginx.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT}/infra/docker/.env"

# shellcheck disable=SC1090
source "$ENV_FILE"

DOMAIN="${DWES_DOMAIN:?set DWES_DOMAIN in .env}"
DATA_ROOT="${DATA_ROOT:-/mnt/dwes-data}"
LIVE="${DATA_ROOT}/ssl/letsencrypt/live/${DOMAIN}"
OUT="${DATA_ROOT}/ssl/nginx"

mkdir -p "$OUT"

if [ ! -f "${LIVE}/fullchain.pem" ]; then
  echo "[sync-letsencrypt] WARN: no certs at ${LIVE}" >&2
  exit 1
fi

cp -L "${LIVE}/fullchain.pem" "${OUT}/fullchain.pem"
cp -L "${LIVE}/privkey.pem" "${OUT}/privkey.pem"
chmod 644 "${OUT}/fullchain.pem"
chmod 600 "${OUT}/privkey.pem"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T nginx nginx -t
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T nginx nginx -s reload
echo "[sync-letsencrypt] Installed certs for ${DOMAIN} and reloaded nginx"
openssl x509 -in "${OUT}/fullchain.pem" -noout -subject -issuer -dates 2>/dev/null || true
