#!/usr/bin/env bash
# Verify WebAuthn RP_ID / RP_ORIGIN alignment with DWES_DOMAIN
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="${ROOT}/infra/docker/.env"
BASE_URL="${1:-}"

# shellcheck disable=SC1090
source "$ENV_FILE"

BASE_URL="${BASE_URL:-https://${DWES_DOMAIN}}"
CFG="$(curl -fsS "${BASE_URL}/api/auth/webauthn/config")"

echo "$CFG" | grep -q "\"rpId\":\"${RP_ID}\"" || {
  echo "FAIL: rpId mismatch (expected ${RP_ID})" >&2
  exit 1
}

echo "$CFG" | grep -q "${RP_ORIGIN}" || {
  echo "FAIL: RP_ORIGIN ${RP_ORIGIN} not in config" >&2
  exit 1
}

echo "[verify-webauthn-prod] OK — ${BASE_URL} matches RP_ID=${RP_ID}"
