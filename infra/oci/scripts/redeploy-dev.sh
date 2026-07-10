#!/usr/bin/env bash
# DWES dev/demo redeploy — runs ON the OCI VM. Invoked by the GitHub Actions
# "Deploy Dev (main)" workflow over SSH, or manually for a one-command redeploy.
#
# Guarantees:
#   - Idempotent: matches the VM working tree to origin/main and rebuilds.
#   - Native build on the VM (correct arch for OCI A1.Flex / arm64) — no registry.
#   - Health-gated: nginx is only (re)started after the API reports db:connected.
#   - Auto-rollback: on health failure, resets to the previous commit and rebuilds.
#   - Data-safe: never touches the postgres/uploads/auth bind mounts under DATA_ROOT.
#     No schema migrations are run (WiringSchemeDB is read-only for schema).
set -euo pipefail

REPO_DIR="${DWES_REPO_DIR:-/opt/dwes}"
BRANCH="${DWES_BRANCH:-main}"
COMPOSE_FILE="${REPO_DIR}/infra/docker/docker-compose.yml"
ENV_FILE="${REPO_DIR}/infra/docker/.env"
HEALTH_RETRIES="${DWES_HEALTH_RETRIES:-60}"

cd "$REPO_DIR"
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

if [ ! -f "$ENV_FILE" ]; then
  echo "FATAL: $ENV_FILE not found — bootstrap the VM first (see docs/DEV-DEPLOY.md)." >&2
  exit 1
fi

PREV_SHA="$(git rev-parse HEAD)"
echo "[redeploy] current commit: $PREV_SHA"

git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"   # dev target mirrors origin exactly (idempotent)
NEW_SHA="$(git rev-parse HEAD)"
echo "[redeploy] target commit:  $NEW_SHA"

# Bring the app up and wait for a DEEP health signal (db:connected), then swap nginx.
# NOTE: bring_up runs as an `if` condition, so `set -e` is suppressed inside it — every
# critical step must `|| return 1` so a build/up failure triggers rollback instead of
# silently proceeding on stale images.
bring_up() {
  compose build || return 1
  compose up -d --no-deps postgres || return 1   # no-op if running; preserves the data volume
  compose up -d --no-deps api || return 1
  echo "[redeploy] waiting for API health (db:connected)..."
  for _ in $(seq 1 "$HEALTH_RETRIES"); do
    if compose exec -T api wget -qO- http://127.0.0.1:3001/api/health 2>/dev/null \
        | grep -q '"db":"connected"'; then
      echo "[redeploy] API healthy"
      compose up -d --no-deps nginx
      return 0
    fi
    sleep 3
  done
  return 1
}

if bring_up; then
  echo "[redeploy] SUCCESS — deployed $NEW_SHA"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "[redeploy] HEALTH CHECK FAILED — rolling back to $PREV_SHA" >&2
git reset --hard "$PREV_SHA"
if bring_up; then
  echo "[redeploy] rollback restored last working release ($PREV_SHA)" >&2
else
  echo "[redeploy] ROLLBACK ALSO FAILED — manual intervention required" >&2
fi
exit 1
