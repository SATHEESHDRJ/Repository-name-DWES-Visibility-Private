#!/usr/bin/env bash
# First-issue Let's Encrypt certs and install PEMs for Nginx
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT}/infra/docker/.env"

# shellcheck disable=SC1090
source "$ENV_FILE"

DOMAIN="${DWES_DOMAIN:?set DWES_DOMAIN in .env}"
EMAIL="${CERTBOT_EMAIL:-admin@${DOMAIN}}"
DATA_ROOT="${DATA_ROOT:-/mnt/dwes-data}"

mkdir -p "${DATA_ROOT}/ssl/nginx" "${DATA_ROOT}/ssl/letsencrypt"

# Bootstrap self-signed so Nginx starts before real certs exist
if [ ! -f "${DATA_ROOT}/ssl/nginx/fullchain.pem" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${DATA_ROOT}/ssl/nginx/privkey.pem" \
    -out "${DATA_ROOT}/ssl/nginx/fullchain.pem" \
    -subj "/CN=${DOMAIN}"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile certbot run --rm certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --force-renewal || true

LIVE="${DATA_ROOT}/ssl/letsencrypt/live/${DOMAIN}"
if [ -f "${LIVE}/fullchain.pem" ]; then
  cp -L "${LIVE}/fullchain.pem" "${DATA_ROOT}/ssl/nginx/fullchain.pem"
  cp -L "${LIVE}/privkey.pem" "${DATA_ROOT}/ssl/nginx/privkey.pem"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec nginx nginx -s reload
  echo "[init-letsencrypt] Installed certs for ${DOMAIN}"
else
  echo "[init-letsencrypt] WARN: certbot did not produce ${LIVE}; using bootstrap self-signed" >&2
fi
