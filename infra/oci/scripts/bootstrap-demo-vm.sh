#!/usr/bin/env bash
# One-time bootstrap ON OCI VM (DWES demo). Run as ubuntu after SSH works.
# Does not touch WiringSchemeDB schema.
set -euo pipefail

echo "[bootstrap] installing docker, compose plugin, git, rsync..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-plugin git rsync openssl
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "[bootstrap] creating data + app dirs..."
sudo mkdir -p /opt/dwes-data/postgres /opt/dwes-data/uploads /opt/dwes-data/auth /opt/dwes-data/backups /opt/dwes-data/ssl/nginx /opt/dwes-data/ssl/letsencrypt
sudo chown -R "$USER:$USER" /opt/dwes-data
sudo mkdir -p /opt/dwes
sudo chown "$USER:$USER" /opt/dwes

echo "[bootstrap] DONE - re-login (or newgrp docker) so docker group applies."
echo "Next: sync code to /opt/dwes and create infra/docker/.env"