#!/usr/bin/env bash
# One-command k6 smoke load test against any DWES base URL.
# Usage: bash scripts/k6-smoke.sh [BASE_URL]
# Example: bash scripts/k6-smoke.sh https://dwes.ingeniousnetwork.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:-http://localhost:18080}"

if ! command -v k6 >/dev/null 2>&1; then
  echo "[k6-smoke] k6 not installed — see docs/LOAD-TEST.md" >&2
  exit 1
fi

export DWES_BASE_URL="$BASE"
export K6_INSECURE_SKIP_TLS_VERIFY="${K6_INSECURE_SKIP_TLS_VERIFY:-true}"

echo "[k6-smoke] Target: $DWES_BASE_URL"
k6 run "${ROOT}/infra/load/k6/smoke-120vus.js"
