#!/usr/bin/env bash
# Rsync local uploads to OCI VM — run from workstation with Bastion tunnel
# Usage: migrate-uploads.sh <bastion-proxy-ssh-target> <local-uploads-dir>
set -euo pipefail

TARGET="${1:?usage: migrate-uploads.sh user@vm-private-ip}"
LOCAL="${2:-backend/uploads}"
REMOTE_DATA="${3:-/mnt/dwes-data/uploads}"

rsync -avz --progress -e ssh "${LOCAL}/" "${TARGET}:${REMOTE_DATA}/"
echo "[migrate-uploads] sync complete → ${TARGET}:${REMOTE_DATA}"
