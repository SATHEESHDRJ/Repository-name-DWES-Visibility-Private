#!/usr/bin/env bash
# Mark admin/director for bootstrap; optionally deactivate demo seed accounts (one-time cutover)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${ROOT}/infra/docker/.env"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/dwes_auth.sqlite');
db.exec(\`CREATE TABLE IF NOT EXISTS production_bootstrap (
  user_id INTEGER PRIMARY KEY,
  password_rotated_at TEXT,
  webauthn_enrolled_at TEXT
)\`);
console.log('[init-production-bootstrap] SQLite bootstrap table ready');
"

if [ "${DEACTIVATE_DEMO_SEEDS:-false}" = "true" ]; then
  echo "[init-production-bootstrap] deactivating canonical demo seed usernames"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -U postgres -d WiringSchemeDB -c "
UPDATE users SET is_active = false
WHERE username IN ('sysadmin','director1','ops_director1','supervisor1','qa1','qa2','tech1');
"
fi

echo "[init-production-bootstrap] verify active admin/director:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U postgres -d WiringSchemeDB -c "
SELECT id, username, role, is_active FROM users
WHERE role IN ('system_admin','ops_director') ORDER BY role, username;
"
