#!/bin/sh
# Runs inside certbot container on renew — copies PEMs to nginx ssl mount.
# RENEWED_LINEAGE is set by certbot for the renewed certificate.
set -eu
if [ -z "${RENEWED_LINEAGE:-}" ]; then
  echo "[certbot-deploy-hook] RENEWED_LINEAGE not set" >&2
  exit 1
fi
cp -L "${RENEWED_LINEAGE}/fullchain.pem" /nginx-out/fullchain.pem
cp -L "${RENEWED_LINEAGE}/privkey.pem" /nginx-out/privkey.pem
echo "[certbot-deploy-hook] copied certs to /nginx-out"
