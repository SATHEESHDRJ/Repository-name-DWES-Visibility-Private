# DWES Dev/Demo Deployment — dwes.ingenious-network.com

**New to this?** Start with [`docs/CLOUD-ONBOARDING.md`](CLOUD-ONBOARDING.md) — the full
account/credential checklist (GitHub, OCI, DNS, TLS, etc.) this guide assumes is already done.

A lightweight, continuously-deployed environment for the Director to review progress.
Reuses the existing Docker Compose stack unchanged; images are built **natively on the VM**
(correct arch for OCI A1.Flex / arm64), so there is no container registry to manage.

**Flow:** `git push origin main` → GitHub Actions builds + tests → SSHes to the VM →
`redeploy-dev.sh` rebuilds, health-checks (`db:connected`), and **auto-rolls-back** on failure.
Persistent data (Postgres, uploads, auth) lives under `DATA_ROOT` and is never touched by a redeploy.

---

## One-time setup

### 1. Provision the OCI VM
- Shape `VM.Standard.A1.Flex`, 2 OCPU / 12 GB, Ubuntu 22.04 (or Oracle Linux).
- Ingress security list / NSG: allow **22, 80, 443** (direct SSH is acceptable for this dev env).
- Note the **public IP**.

### 2. DNS
- Add an **A record**: `dwes.ingenious-network.com` → `<VM public IP>`.
- If using Cloudflare, keep it **DNS-only (gray cloud)** so Let's Encrypt HTTP-01 works.

### 3. Bootstrap the VM (once, over SSH)
```bash
# Install Docker Engine + compose plugin + git
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # re-login after this

# Add a GitHub Deploy Key (repo Settings -> Deploy keys, read-only) so the VM can clone/pull
# the private repo over SSH — see docs/CLOUD-ONBOARDING.md §A5 for how to create one.
ssh-keyscan github.com >> ~/.ssh/known_hosts

# Clone the repo to the fixed path the CI expects (SSH remote, private-repo safe)
sudo mkdir -p /opt/dwes && sudo chown "$USER":"$USER" /opt/dwes
git clone git@github.com:<you>/<dwes-repo>.git /opt/dwes
cd /opt/dwes && git checkout main

# Persistent data dirs (survive every redeploy)
sudo mkdir -p /opt/dwes-data/{postgres,uploads,auth,backups,ssl/nginx,ssl/letsencrypt}
sudo chown -R "$USER":"$USER" /opt/dwes-data

# Add the CI deploy public key so GitHub Actions can SSH in
echo "<DEPLOY_SSH public key>" >> ~/.ssh/authorized_keys
```

### 4. Environment file
Copy `infra/docker/.env.dev.example` → `/opt/dwes/infra/docker/.env` and set **strong** values for
`POSTGRES_PASSWORD` and `JWT_SECRET` (`openssl rand -base64 48`). Keep the domain vars as-is.
> The CI overwrites this file on every deploy from the `DWES_ENV_FILE` secret — so put the **same**
> content in that secret (step 7). The `POSTGRES_PASSWORD` must stay constant once the DB volume exists.

### 5. First TLS certificate
```bash
cd /opt/dwes
export $(grep -v '^#' infra/docker/.env | xargs)   # loads DWES_DOMAIN etc.
bash infra/oci/scripts/init-letsencrypt.sh          # self-signed bootstrap → real cert
```

### 6. Restore the real database (first deploy only — data-safe)
```bash
cd /opt/dwes
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d postgres
# wait until healthy:
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env ps
# restore the provided dump into the container DB (postgres:18 — dumps are v18.3).
# Custom-format (-Fc, e.g. backend/backups/*.dump) -> pg_restore:
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env \
  exec -T postgres pg_restore -U postgres -d WiringSchemeDB --clean --if-exists --no-owner \
  < /path/to/cutover.dump
# Plain-SQL (.sql, e.g. backups/*.sql) -> psql (verified in the integration smoke):
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env \
  exec -T postgres psql -U postgres -d WiringSchemeDB -v ON_ERROR_STOP=0 < /path/to/dump.sql
```
This targets only the **container** DB on the VM. It never runs schema migrations
(WiringSchemeDB is read-only for schema) and never touches your local dev database.

### 7. GitHub repository + Secrets
- Create the GitHub repo and push `main` (this repo currently has **no `origin` remote** — add one).
- In **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|--------|-------|
| `DEPLOY_SSH_HOST` | VM public IP |
| `DEPLOY_SSH_USER` | SSH user (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private key (PEM) matching the public key from step 3 |
| `DEPLOY_SSH_PORT` | *(optional)* SSH port, default 22 |
| `DWES_ENV_FILE` | Full contents of the `.env` from step 4 |

### 8. First full deploy
Trigger **Actions → Deploy Dev (main) → Run workflow**, or push any commit to `main`.
Verify: `https://dwes.ingenious-network.com/healthz` → 200 and `/api/health` → `db:connected`.

---

## Ongoing — every deploy is just a push
```bash
git push origin main
```
The workflow builds + tests, then `redeploy-dev.sh` on the VM: `git reset --hard origin/main`,
`docker compose build`, waits for API `db:connected`, then swaps nginx. On health failure it
resets to the previous commit, rebuilds, and the job is marked failed — the live site stays on the
last working release.

## Rollback (manual, if ever needed)
```bash
ssh <user>@<vm> 'cd /opt/dwes && git reset --hard <last-good-sha> \
  && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d --build'
```

## Data safety
- `postgres`, `uploads`, `auth` are bind-mounted under `DATA_ROOT` — redeploys rebuild images only,
  never volumes. Uploaded drawings and DB data persist across every deploy.
- No Prisma migrations run anywhere in this pipeline.
- Take periodic dumps: `docker compose ... exec -T postgres pg_dump -U postgres -Fc WiringSchemeDB > backup.dump`.

## Operations & production hardening
- **Automated daily backup** (DB dump + uploads tarball, 14-day retention via `backup-oci.sh`).
  Add this cron on the VM:
  ```cron
  0 2 * * * cd /opt/dwes && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env --profile backup run --rm backup
  ```
  Backups land in `${DATA_ROOT}/backups`. Set `OCI_BUCKET` (and install the OCI CLI on the VM) to
  also push them to OCI Object Storage; otherwise they stay on the VM disk.
- **Log rotation** is built in (compose `x-logging`: 10 MB × 5 files/container; override with
  `LOG_MAX_SIZE` / `LOG_MAX_FILE` in `.env`).
- **TLS contact:** set `CERTBOT_EMAIL` in `.env` to your admin email (blank falls back to
  `admin@$DWES_DOMAIN`).
- **Monitoring/self-healing:** every container has a healthcheck + `restart: unless-stopped`; the
  deploy health-gate + auto-rollback covers releases. Full ops procedures: [OCI-RUNBOOK.md](OCI-RUNBOOK.md).
