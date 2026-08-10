#!/usr/bin/env bash
# Paste into Oracle Cloud Shell (authenticated as your tenancy user).
# Injects SSH public key via Instance Agent Run Command.
# Prerequisites: instance Running, Oracle Cloud Agent "Run Command" plugin ENABLED.
#
# Usage:
#   bash cloudshell-inject-ssh-via-agent.sh [instance-display-name]
#   PUB_KEY='ssh-rsa AAAA... comment' bash cloudshell-inject-ssh-via-agent.sh
#
# Default PUB_KEY matches Windows .oci-ssh/ssh-key-2026-07-20.key.pub
export USER="${USER:-$(id -un 2>/dev/null || echo dwes)}"
set -euo pipefail

# Default matches Windows .oci-ssh/ssh-key-2026-07-20.key.pub (DE7j2gG…).
PUB="${PUB_KEY:-ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDE7j2gGxIRWBiSS/qm7pXuoSqvsB4HB36qe5L8b4ZlBaFAZfz5CgtoYYm8Z5YXONA8srfzAqhYDtUDkctH7nev6HH4xWBO5BsbFO3p1FCgGXDaalSVpB5v2IdKDlsyneTFXbt7yHKUVz3C1bJk6hpyAlkXH95aarEo06eTUD2eycQpZg9T946sBDIlT02vkh7dX67gFbEiyJ+5ANpkfTqE8ZhP9J4K6y3mVTzDCk3cW57q6o3xcgASzmifjm1HhNjGGqDd5OnDjGQ99wu30UF9pL7ylUiqXtDMB7U+V+NYJfz4RN2hEth8HFqGuYCKZ5qslhsLju7FyYDmi7HsgBPb ssh-key-2026-07-20}"
# Unique modulus fragment (comment alone is not unique if keys were rotated).
KEY_MARKER="$(awk '{print $2}' <<<"$PUB" | cut -c1-32)"
NAME="${1:-ingenious-dwes-prod-maintenance-01}"

echo "PUB_LEN=${#PUB} marker=$KEY_MARKER"

# Prefer resource search (finds instance in any compartment; Cloud Shell $OCI_TENANCY works too)
INSTANCE_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = '${NAME}'" \
  --query 'data.items[0].identifier' --raw-output 2>/dev/null || true)"
COMP_ID="$(oci search resource structured-search \
  --query-text "query instance resources where displayName = '${NAME}'" \
  --query 'data.items[0]."compartment-id"' --raw-output 2>/dev/null || true)"

if [ -z "${INSTANCE_ID:-}" ] || [ "$INSTANCE_ID" = "null" ]; then
  COMP_ID="${OCI_TENANCY:-}"
  if [ -z "$COMP_ID" ]; then
    COMP_ID="$(oci iam region-subscription list --query 'data[0]."tenancy-id"' --raw-output 2>/dev/null || true)"
  fi
  INSTANCE_ID="$(oci compute instance list --compartment-id "$COMP_ID" --display-name "$NAME" --query 'data[0].id' --raw-output 2>/dev/null || true)"
fi

if [ -z "${INSTANCE_ID:-}" ] || [ "$INSTANCE_ID" = "null" ]; then
  echo "Instance '$NAME' not found. Try: oci search resource structured-search --query-text \"query instance resources\" --output table"
  exit 1
fi

if [ -z "${COMP_ID:-}" ] || [ "$COMP_ID" = "null" ]; then
  COMP_ID="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
fi

STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
PUBLIC_IP="$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0]."public-ip"' --raw-output)"
echo "Instance=$INSTANCE_ID state=$STATE publicIp=$PUBLIC_IP compartment=$COMP_ID"

if [ "$STATE" != "RUNNING" ]; then
  oci compute instance action --instance-id "$INSTANCE_ID" --action START --wait-for-state RUNNING
fi

SCRIPT_FILE=$(mktemp)
cat > "$SCRIPT_FILE" <<EOF
#!/bin/bash
set -euo pipefail
mkdir -p /home/ubuntu/.ssh
chmod 700 /home/ubuntu/.ssh
touch /home/ubuntu/.ssh/authorized_keys
chmod 600 /home/ubuntu/.ssh/authorized_keys
grep -qF '$KEY_MARKER' /home/ubuntu/.ssh/authorized_keys || echo '$PUB' >> /home/ubuntu/.ssh/authorized_keys
chown -R ubuntu:ubuntu /home/ubuntu/.ssh
echo DONE_SSH_KEY
EOF

CONTENT_JSON=$(mktemp)
TARGET_JSON=$(mktemp)
python3 - <<PY
import json, pathlib
text = pathlib.Path("$SCRIPT_FILE").read_text()
pathlib.Path("$CONTENT_JSON").write_text(json.dumps({
    "source": {"sourceType": "TEXT", "text": text},
    "output": {"outputType": "TEXT"},
}))
pathlib.Path("$TARGET_JSON").write_text(json.dumps({"instanceId": "$INSTANCE_ID"}))
print("content_ok", pathlib.Path("$CONTENT_JSON").stat().st_size)
PY

CMD_ID="$(oci instance-agent command create \
  --compartment-id "$COMP_ID" \
  --timeout-in-seconds 300 \
  --display-name "dwes-add-ssh-key" \
  --target "file://$TARGET_JSON" \
  --content "file://$CONTENT_JSON" \
  --query 'data.id' --raw-output)"

echo "Command=$CMD_ID waiting (ACCEPTED means agent has not picked it up yet)..."
for i in $(seq 1 40); do
  STATUS="$(oci instance-agent command-execution get \
    --instance-id "$INSTANCE_ID" \
    --command-id "$CMD_ID" \
    --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo UNKNOWN)"
  echo "  $i $STATUS"
  case "$STATUS" in
    SUCCEEDED)
      oci instance-agent command-execution get --instance-id "$INSTANCE_ID" --command-id "$CMD_ID" \
        --query 'data.content.output' --raw-output 2>/dev/null || true
      echo "PUBLIC_IP=$PUBLIC_IP"
      echo "SSH READY $PUBLIC_IP"
      echo "Test from Windows:"
      echo "  ssh -i C:\\Users\\sathe\\OneDrive\\Desktop\\DWES\\.oci-ssh\\ssh-key-2026-07-20.key -o IdentitiesOnly=yes ubuntu@$PUBLIC_IP"
      exit 0
      ;;
    FAILED|CANCELED)
      oci instance-agent command-execution get --instance-id "$INSTANCE_ID" --command-id "$CMD_ID" --output json | head -c 3000
      echo
      echo "Enable: Compute -> instance -> Oracle Cloud Agent -> Run Command = ENABLED"
      exit 1
      ;;
  esac
  sleep 5
done

echo "TIMED OUT status still ACCEPTED/IN_PROGRESS."
echo "Enable Run Command plugin on the instance, then re-run this script."
echo "Fallback: bash cloudshell-add-ssh-key.sh  (console connection)"
exit 2
