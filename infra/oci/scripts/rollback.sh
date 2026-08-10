#!/usr/bin/env bash
# Rollback to previous image tags recorded by deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ROLLBACK="${ROOT}/infra/docker/.previous-tag.rollback"
[ -f "$ROLLBACK" ] || { echo "no rollback snapshot"; exit 1; }
API_IMAGE="$(grep '^api=' "$ROLLBACK" | cut -d= -f2)"
NGINX_IMAGE="$(grep '^nginx=' "$ROLLBACK" | cut -d= -f2)"
exec "$(dirname "$0")/deploy.sh" "$API_IMAGE" "$NGINX_IMAGE"
