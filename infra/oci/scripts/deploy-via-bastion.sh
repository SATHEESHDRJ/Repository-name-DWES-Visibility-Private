#!/usr/bin/env bash
# Deploy DWES on OCI VM through Bastion managed SSH session (no public port 22).
set -euo pipefail

BASTION_ID="${OCI_BASTION_ID:?set OCI_BASTION_ID}"
INSTANCE_ID="${OCI_VM_INSTANCE_ID:?set OCI_VM_INSTANCE_ID}"
VM_USER="${OCI_VM_USER:-dwes}"
SSH_KEY="${OCI_VM_SSH_KEY:?set OCI_VM_SSH_KEY}"
PUB_KEY="${OCI_BASTION_SSH_PUBLIC_KEY:?set OCI_BASTION_SSH_PUBLIC_KEY}"
API_IMAGE="${DWES_API_IMAGE:?set DWES_API_IMAGE}"
NGINX_IMAGE="${DWES_NGINX_IMAGE:?set DWES_NGINX_IMAGE}"
GIT_REF="${GIT_REF:-main}"

SESSION_JSON="$(mktemp)"
trap 'rm -f "$SESSION_JSON"' EXIT

echo "[bastion-deploy] Creating managed SSH Bastion session..."
oci bastion session create-managed-ssh-session \
  --bastion-id "$BASTION_ID" \
  --ssh-public-key-file "$PUB_KEY" \
  --target-resource-id "$INSTANCE_ID" \
  --target-resource-port 22 \
  --target-resource-operating-system-user-name "$VM_USER" \
  --session-ttl 1800 \
  --wait-for-state SUCCEEDED \
  --max-wait-seconds 300 \
  >"$SESSION_JSON"

SESSION_ID="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['data']['id'])" "$SESSION_JSON")"
SSH_CMD="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['data']['ssh-metadata']['command'])" "$SESSION_JSON")"

echo "[bastion-deploy] Session ${SESSION_ID}"

REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd /opt/dwes
git fetch --tags origin
git checkout ${GIT_REF}
export DWES_API_IMAGE='${API_IMAGE}'
export DWES_NGINX_IMAGE='${NGINX_IMAGE}'
bash infra/oci/scripts/deploy.sh "\$DWES_API_IMAGE" "\$DWES_NGINX_IMAGE"
EOF
)

# shellcheck disable=SC2086
eval "$SSH_CMD" -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  bash -s <<REMOTE_EOF
${REMOTE_SCRIPT}
REMOTE_EOF

echo "[bastion-deploy] Closing session ${SESSION_ID}"
oci bastion session delete --session-id "$SESSION_ID" --force \
  --wait-for-state SUCCEEDED --max-wait-seconds 120 || true

echo "[bastion-deploy] Done"
