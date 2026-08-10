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

echo "[init-letsencrypt] requesting certificate for ${DOMAIN} (webroot)"
if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile certbot run --rm certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive; then
  echo "[init-letsencrypt] certbot certonly failed — check port 80, DNS, and /var/www/certbot" >&2
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs nginx --tail 40 2>/dev/null || true
  exit 1
fi

LIVE="${DATA_ROOT}/ssl/letsencrypt/live/${DOMAIN}"
if [ -f "${LIVE}/fullchain.pem" ]; then
  bash "${ROOT}/infra/docker/scripts/sync-letsencrypt-to-nginx.sh"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile certbot up -d certbot
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx
  echo "[init-letsencrypt] Installed certs for ${DOMAIN}"
else
  echo "[init-letsencrypt] WARN: certbot did not produce ${LIVE}; using bootstrap self-signed" >&2
  exit 1
fi
