#!/bin/sh
set -eu
KEY="${DWES_SSH_KEY:-/root/.ssh/dwes_key}"
HOST="${DWES_SSH_HOST:-ubuntu@193.123.79.209}"
WWW="$(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$HOST" \
  "docker volume inspect dwes-production_certbot_www --format '{{.Mountpoint}}'")"
ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$HOST" \
  "sudo mkdir -p '${WWW}/.well-known/acme-challenge' && printf '%s' '${CERTBOT_VALIDATION}' | sudo tee '${WWW}/.well-known/acme-challenge/${CERTBOT_TOKEN}' >/dev/null && sudo chmod -R a+rX '${WWW}/.well-known'"