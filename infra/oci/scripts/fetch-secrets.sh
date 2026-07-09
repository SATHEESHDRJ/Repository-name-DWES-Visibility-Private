#!/usr/bin/env bash
# Pull secrets from OCI Vault into infra/docker/.env (chmod 600)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="${ROOT}/infra/docker/.env"
EXAMPLE="${ROOT}/infra/docker/.env.production.example"

VAULT_ID="${OCI_VAULT_ID:?set OCI_VAULT_ID}"
COMPARTMENT="${OCI_COMPARTMENT_ID:?set OCI_COMPARTMENT_ID}"

fetch_secret() {
  local name="$1"
  oci secrets secret-bundle get-secret-bundle-by-name \
    --secret-name "$name" \
    --vault-id "$VAULT_ID" \
    --query 'data."secret-bundle-content".content' --raw-output \
    | base64 -d
}

if [ ! -f "$ENV_FILE" ]; then
  cp "$EXAMPLE" "$ENV_FILE"
fi

JWT_SECRET="$(fetch_secret dwes-jwt-secret)"
POSTGRES_PASSWORD="$(fetch_secret dwes-postgres-password)"

# Update or append keys in .env
tmp="$(mktemp)"
grep -v '^JWT_SECRET=' "$ENV_FILE" | grep -v '^POSTGRES_PASSWORD=' > "$tmp" || true
mv "$tmp" "$ENV_FILE"
{
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
} >> "$ENV_FILE"

chmod 600 "$ENV_FILE"
echo "[fetch-secrets] Wrote ${ENV_FILE}"
