# DWES Cloud Onboarding Guide — dwes.ingenious-network.com

Every account, service, and credential required to take DWES from an empty cloud
environment to a live, continuously-deployed dev/demo site your Director can review.
This guide accompanies (does not replace) [`docs/DEV-DEPLOY.md`](DEV-DEPLOY.md), which
covers the technical setup steps once accounts exist.

**How to use this guide:** read top to bottom. Each 🛑 **STOP** point requires you to
register/configure something outside this session, then confirm back before we continue.
**I never generate, see, or store any secret value** — every credential cell below says
*"you enter this yourself"*; I only create the reference (an env var name or GitHub
Secret name) and pause.

---

## Architecture decision made for this guide (flag if you disagree)

This repo contains **two different deploy paths**. This guide follows the one already
built and verified this session — flagging the fork explicitly rather than assuming:

| | **Dev/demo path (this guide)** | Production path (not used here) |
|---|---|---|
| Files | `docs/DEV-DEPLOY.md`, `.github/workflows/deploy-dev.yml`, `redeploy-dev.sh` | `scripts/go-live.mjs`, `deploy-production-oci.yml`, `infra/oci/terraform/*` |
| VM access | Direct SSH (port 22 open) | OCI Bastion only — **no port 22 anywhere** |
| VM creation | OCI Console (manual, simple) | Terraform (Vault, KMS, Bastion, Object Storage) |
| Matches your earlier choice | ✅ "OCI VM, simplified" + "push-to-deploy" | — |

The repo's Terraform under `infra/oci/terraform/` was built for the production path and
**cannot** give this dev path SSH access as-is (it opens only 80/443). If you'd rather
use that hardened Bastion/Vault path instead, say so — it changes several sections below.

---

## Quick-reference checklist

| # | Category | Item | Mandatory? |
|---|---|---|---|
| 1 | GitHub | GitHub account | Mandatory |
| 2 | GitHub | Repository for DWES | Mandatory |
| 3 | GitHub | `origin` remote + push | Mandatory |
| 4 | GitHub | `gh` CLI authenticated | Mandatory (for secret setup via CLI) — or use the web UI instead |
| 5 | GitHub | Deploy Key (VM → private repo) | Mandatory (repo is private) |
| 6 | GitHub | 5 Actions Secrets | Mandatory |
| 7 | OCI | Tenancy / Always Free account | Mandatory |
| 8 | OCI | Compute VM (A1.Flex) | Mandatory |
| 9 | OCI | Security list (22/80/443) | Mandatory |
| 10 | OCI | API signing key (CLI/Terraform auth) | **Optional** — only if you later use `oci`/Terraform |
| 11 | OCI | Object Storage (cloud backups) | Optional |
| 12 | OCI | Vault, KMS, Bastion | **Not used** by this path |
| 13 | Domain/DNS | Domain registration | Already owned (`ingenious-network.com`) |
| 14 | Domain/DNS | Turbify DNS access | Mandatory (repoint A record) |
| 15 | SSL/TLS | Let's Encrypt / Certbot | Mandatory — no signup, automated |
| 16 | Email | Any existing email address | Mandatory (Certbot contact only) |
| 17 | Database | Managed DB account | **Not required** — self-hosted in Compose |
| 18 | Monitoring | OCI Monitoring | Optional, included free with OCI |
| 19 | Monitoring | 3rd-party APM/error tracking | **Not used** by the app |
| 20 | Backup | Local VM backups | Included, no account |
| 21 | Backup | OCI Object Storage backups | Optional |
| 22 | Security | SSH keypair(s) | Mandatory (you generate locally) |
| 23 | Security | Cloudflare (DNS automation) | Optional — manual Turbify edit works fine |

---

## A. GitHub

### A1. GitHub account
- **Purpose:** hosts the repo; GitHub Actions runs the CI/CD pipeline.
- **Mandatory.**
- **Register/login:** https://github.com/join (or https://github.com/login if you have one)
- **Docs:** https://docs.github.com/get-started
- **Info needed first:** none.
- **Credentials you'll enter:** your GitHub username/password (or passkey) — used only by you, in the browser.
- **Used later for:** repo, Secrets, Actions.
- **Pricing:** free tier includes unlimited public/private repos and 2,000 CI minutes/month — sufficient for this project.

🛑 **STOP if you don't already have a GitHub account.** Confirm once you're logged in.

### A2. Repository
- **Purpose:** source of truth; push to `main` triggers deploy.
- **Mandatory.**
- **Where:** https://github.com/new
- **Docs:** https://docs.github.com/repositories/creating-and-managing-repositories/quickstart-for-repositories
- **Info needed:** repo name (e.g. `dwes`), **Private** visibility recommended (the app + real data will live here).
- **Credentials:** none at creation time.
- **Used later for:** `origin` remote, Secrets, Actions triggers.
- **Pricing:** free (private repos included).

🛑 **STOP — create the repo now, do not initialize with a README** (this repo already has history). Confirm the repo URL once created.

### A3. Local `origin` remote + push
- **Purpose:** connects this local `main` branch (already committed, `294cc2e`) to GitHub.
- **Mandatory.**
- **Docs:** https://docs.github.com/get-started/getting-started-with-git/managing-remote-repositories
- **What I'll do once you confirm A2:** run `git remote add origin <your-repo-url>` and `git push -u origin main` — no credentials needed from you for this step beyond your existing `gh`/git auth (A4).

### A4. `gh` CLI authentication
- **Purpose:** lets `gh` set repo Secrets from the terminal (faster than the web UI — either works).
- **Mandatory** if using CLI for A6; **optional** if you prefer the Settings UI.
- **Docs:** https://cli.github.com/manual/gh_auth_login
- **Command (you run this — it opens a browser device-code flow, I never see the token):**
  ```
  gh auth login
  ```
- **Credentials:** GitHub login via browser — I do not see or store this.

🛑 **STOP — run `gh auth login` now** (or skip and use the web UI for A6 instead). Confirm when `gh auth status` shows logged in.

### A5. Deploy Key — VM's read access to the private repo
- **Purpose:** `docs/DEV-DEPLOY.md`'s current clone command (`git clone https://github.com/...`) has no credential, which **fails for a private repo** — this is a real gap I found in the existing docs, not something already solved. A GitHub **Deploy Key** is the recommended, scoped fix (read-only, tied to this one repo only — not your whole GitHub account like a PAT would be).
- **Mandatory** (repo is private).
- **Where:** repo → **Settings → Deploy keys → Add deploy key**
- **Docs:** https://docs.github.com/authentication/connecting-to-github-with-ssh/managing-deploy-keys
- **Info needed first:** a keypair (see Security §V1 below) — paste the **public** key here.
- **Credentials you enter:** the public key only (paste in GitHub UI); the matching private key stays on the VM.
- **Used later for:** `git clone`/`git fetch` on the VM (`redeploy-dev.sh`).
- **Pricing:** free.

### A6. GitHub Actions Secrets
- **Purpose:** feeds `deploy-dev.yml` without any value touching the repo.
- **Mandatory** (all 5).
- **Where:** repo → **Settings → Secrets and variables → Actions → New repository secret** (or `gh secret set <NAME>`).
- **Docs:** https://docs.github.com/actions/security-guides/using-secrets-in-github-actions

| Secret name | Purpose | You provide |
|---|---|---|
| `DEPLOY_SSH_HOST` | VM public IP | from OCI Console after VM creation (B2) |
| `DEPLOY_SSH_USER` | SSH login user | e.g. `ubuntu` |
| `DEPLOY_SSH_KEY` | CI's SSH private key | the private half of the keypair from Security §V1 |
| `DEPLOY_SSH_PORT` | SSH port (optional) | `22` unless you change it |
| `DWES_ENV_FILE` | full contents of `infra/docker/.env` | built in §D below (JWT_SECRET, POSTGRES_PASSWORD, domain vars) |

I will create these secret **names** as references only; you paste each real value into GitHub's Secrets UI/CLI yourself. I never see the values.

---

## B. Oracle Cloud Infrastructure (OCI)

### B1. OCI tenancy / Always Free account
- **Purpose:** the cloud account that owns the VM.
- **Mandatory.**
- **Register:** https://signup.oraclecloud.com/
- **Docs:** https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm
- **Info needed first:** email, a valid card (for identity verification only — Always Free resources are not charged), country/region.
- **Credentials you enter:** OCI account email + password — used only by you in the browser (or later `~/.oci/config`, entirely optional, see B5).
- **Free-tier considerations:** **Always Free** allows up to **4 OCPU / 24 GB total** of `VM.Standard.A1.Flex` per tenancy (this deployment defaults to 2 OCPU/12 GB — half the allowance) and **200 GB total block storage across up to 2 volumes**. Staying within these keeps compute **$0/month**.

🛑 **STOP if you don't already have an OCI tenancy.** Sign-up includes identity verification and can take a few minutes to a day. Confirm once you can log into https://cloud.oracle.com/.

### B2. Compute VM (A1.Flex)
- **Purpose:** runs the Docker Compose stack (postgres, api, nginx).
- **Mandatory.**
- **Where:** OCI Console → **Compute → Instances → Create Instance**
- **Docs:** https://docs.oracle.com/iaas/Content/Compute/Tasks/launchinginstance.htm
- **Info needed:** Image = **Ubuntu 22.04** (Oracle Linux also works but ships stricter host firewall rules that need extra steps — Ubuntu avoids that); Shape = `VM.Standard.A1.Flex`, 2 OCPU / 12 GB; **paste the SSH public key** from Security §V1 in the "Add SSH keys" field.
- **Credentials:** none new — reuses the SSH keypair.
- **Used later for:** `DEPLOY_SSH_HOST` (public IP shown after creation).
- **Pricing:** $0 within Always Free limits (see B1).

🛑 **STOP — create the VM now.** Confirm once created and give me the **public IP** (not a secret — safe to share).

### B3. Security list / VNIC — open 22, 80, 443
- **Purpose:** lets SSH (deploy + admin), HTTP (ACME challenge + redirect), and HTTPS (the app) reach the VM.
- **Mandatory.**
- **Where:** the default VCN's Security List (auto-created alongside the VM if you used "Create VNIC automatically"), or Networking → Virtual Cloud Networks → your VCN → Security Lists.
- **Docs:** https://docs.oracle.com/iaas/Content/Network/Concepts/securityrules.htm
- **Add ingress rules:** TCP 22 (0.0.0.0/0 — see note below), TCP 80 (0.0.0.0/0), TCP 443 (0.0.0.0/0).
- **⚠️ Evidence-based note on port 22:** `deploy-dev.yml` SSHes in from **GitHub-hosted runners**, whose IPs rotate across a large, changing range — you cannot reliably scope port 22 to a fixed CIDR without breaking CI. The mitigation the existing architecture relies on is **SSH key-only authentication** (never password auth) — covered in Security §V3. If you'd prefer strict IP-restricted SSH, that requires a self-hosted GitHub Actions runner on the VM instead — a bigger architecture change I have not made and would need your explicit go-ahead.
- **Credentials:** none.

### B4. API signing key (OCI CLI / Terraform auth) — Optional
- **Purpose:** only needed if you later run `oci` CLI commands or Terraform (e.g. for Object Storage backups, or migrating to the production Bastion/Vault path). **Not needed for VM creation via Console or for the dev deploy pipeline itself.**
- **Optional.**
- **Where:** OCI Console → your profile icon → **My profile → API keys → Add API key**
- **Docs:** https://docs.oracle.com/iaas/Content/API/Concepts/apisigningkey.htm
- **Info needed:** none beforehand — the Console generates the keypair or lets you upload your own public key.
- **Credentials you enter:** you download the generated private key PEM yourself and place it at `~/.oci/oci_api_key.pem`; I never generate or see it.
- **Used later for:** `~/.oci/config` (already has a template on this machine, currently missing the key file — this is why `oci` CLI can't authenticate right now). Skip this entirely if you don't plan to use Terraform/CLI.

### B5–B6. Object Storage, Vault/KMS/Bastion
- **Object Storage (cloud backups):** **Optional.** Local backups on the VM's disk (already built into `docker-compose.yml`'s `backup` profile) work without any additional account. Only set this up if you want off-VM backup copies — requires B4 and a bucket (Console: Storage → Buckets → Create Bucket). Docs: https://docs.oracle.com/iaas/Content/Object/Tasks/managingbuckets.htm
- **Vault, KMS, Bastion:** **Not used by this dev/demo path** — these belong to the production Terraform (`infra/oci/terraform/security.tf`) and are irrelevant unless you switch to that architecture.

---

## C. Domain / DNS

### C1. Domain registration
- **Purpose:** the public hostname.
- **Status: already owned** — `ingenious-network.com`. **No action needed.**

### C2. DNS management access (Turbify)
- **Purpose:** point `dwes.ingenious-network.com` at the OCI VM.
- **Evidence:** `nslookup` confirms nameservers `ns1.turbify.com` / `ns2.turbify.com`; the `dwes` subdomain currently aliases to Turbify's cPanel (`172.203.250.63`), **not** the future OCI VM.
- **Mandatory.**
- **Where:** https://login.turbify.com/ (Yahoo Small Business / Turbify control panel — wherever you originally registered/manage this domain)
- **Docs:** Turbify's own DNS-management help center (varies by plan; search "Turbify manage DNS records" from their support site).
- **Info needed:** your Turbify account login; the VM's public IP from B2.
- **Credentials:** your existing Turbify login — used only by you.
- **Action:** change/add an **A record** for `dwes` → `<VM public IP>`, DNS-only (no proxying — Turbify doesn't proxy by default, so this is usually automatic). Lower the TTL to ~300s while testing.

🛑 **STOP — update the Turbify A record now** (needs the VM IP from B2 first). Confirm once done; I'll re-verify with `nslookup` before we proceed to TLS.

### C3. Cloudflare (DNS automation) — Optional
- Only relevant if you want `scripts/go-live.mjs`'s automated DNS API calls (the *production* path). For this dev path, editing the Turbify A record by hand (C2) is sufficient and requires no new account. Skip unless you specifically want to migrate DNS to Cloudflare later.

---

## D. SSL/TLS

### D1. Let's Encrypt / Certbot
- **Purpose:** free HTTPS certificate for `dwes.ingenious-network.com`.
- **Mandatory** — but **no account registration UI**; Certbot registers automatically with Let's Encrypt's ACME server on first run.
- **Docs:** https://letsencrypt.org/how-it-works/, https://eff-certbot.readthedocs.io/
- **Info needed:** the domain must already resolve publicly to the VM (C2 done) and **port 80 reachable from the internet** (B3 done) — this repo's `init-letsencrypt.sh` uses HTTP-01 validation, which requires exactly that.
- **Credentials you enter:** just an email address (any you already have) for expiry/urgent notices — passed as `CERTBOT_EMAIL` in the `.env` file, not a separate signup.
- **Pricing:** free, unlimited renewals (rate limits apply — not a concern at this scale).

No stop-point here — this runs automatically once C2 and B3 are done, via the command already documented in `docs/DEV-DEPLOY.md` step 5.

---

## E. Email

- **No transactional email service is used anywhere in the DWES codebase** (confirmed — no SMTP/SendGrid/SES/Mailgun/nodemailer). The only two email touchpoints in the entire repo:
  1. `CERTBOT_EMAIL` (D1) — any address you already have.
  2. An optional OCI Notifications alarm-subscriber address — only relevant if you later enable OCI Monitoring alarms (§G); not wired up automatically even then.
- **Action needed: none** beyond having an email address, which you already do.

---

## F. Database

- **No external/managed database account required.** PostgreSQL runs entirely self-hosted as the `postgres:18-alpine` container in `docker-compose.yml`, persisted to the VM's own disk. This was verified end-to-end this session (real data restore → `/api/health` = `db:connected`).
- The only "credential" is `POSTGRES_PASSWORD` — a config value **you** choose (see §H), not an account.

---

## G. Monitoring

- **OCI Monitoring** — included free with your OCI account (B1), no separate signup. The repo's CPU alarm (`infra/oci/terraform/security.tf`) belongs to the production Terraform path and isn't applied here; for this dev/demo VM, monitoring is optional and manual (`docker compose ps`, `docker compose logs`).
- **No third-party APM/error-tracking SaaS** exists in this codebase (confirmed — no Sentry/Datadog/etc.). None is needed or recommended, per "reuse existing architecture only."

---

## H. Backup

- **Local backups (included, no account):** the `backup` Compose profile already in `docker-compose.yml` dumps Postgres + uploads to `${DATA_ROOT}/backups` on the VM. Sufficient for a dev/demo environment.
- **Cloud backups to OCI Object Storage — Optional:** requires B4 + B5. Note: I found this wiring is currently incomplete in `infra/oci/scripts/backup-oci.sh` (the container image lacks the `oci` CLI and Instance-Principal auth isn't fully connected) — flagging as a known gap, not something to silently fix without your go-ahead, since it's outside this session's requested scope.

---

## I. Security

### I1. SSH keypair (you generate locally — I never see the private key)
- **Purpose:** VM login (B2), GitHub Deploy Key (A5), and the `DEPLOY_SSH_KEY` GitHub Secret (A6) — the guide above uses **one keypair** for simplicity; you may split these if you prefer stricter blast-radius separation.
- **Mandatory.**
- **Docs:** https://docs.github.com/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent
- **Command (run locally — I do not run this or see the output):**
  ```
  ssh-keygen -t ed25519 -f ~/.ssh/dwes_deploy -C "dwes-deploy"
  ```
- This produces `~/.ssh/dwes_deploy` (private — goes into GitHub Secret `DEPLOY_SSH_KEY`, never committed, never shown to me) and `~/.ssh/dwes_deploy.pub` (public — pastes into OCI VM creation B2 **and** GitHub Deploy Key A5).

### I2. Strong secrets for the app (`JWT_SECRET`, `POSTGRES_PASSWORD`)
- **Purpose:** required by `docker-compose.yml` (`:?` guards — the app refuses to start without them).
- **Mandatory.**
- **Commands (run locally, values go straight into your `.env` / GitHub Secret — I never generate or see these):**
  ```
  openssl rand -base64 48   # for JWT_SECRET
  openssl rand -base64 32   # for POSTGRES_PASSWORD
  ```
- Per official Docker/Compose guidance, these live only in the git-ignored `infra/docker/.env` on the VM and the `DWES_ENV_FILE` GitHub Secret — never in source control (already verified this session: `.gitignore` covers all of these paths).

### I3. Disable SSH password authentication (hardening for open port 22)
- **Purpose:** mitigates the B3 tradeoff (port 22 open to `0.0.0.0/0` for GitHub Actions).
- **Recommended, not blocking.**
- **Docs:** https://www.ssh.com/academy/ssh/sshd_config — set `PasswordAuthentication no` in `/etc/ssh/sshd_config` on the VM (Ubuntu cloud images default to key-only auth already for the default user — verify, don't assume).

---

## Sequenced walkthrough (dependency order)

```
1. GitHub account + repo (A1, A2)
2. SSH keypair generated locally (I1)
3. origin remote + push main (A3) — needs A2
4. GitHub Deploy Key added (A5) — needs I1 public key
5. OCI tenancy (B1)
6. OCI VM created (B2) — needs I1 public key, B1
7. Security list opened 22/80/443 (B3)
8. Turbify DNS A record → VM IP (C2) — needs B2's IP
9. VM bootstrap over SSH: install Docker, clone repo via Deploy Key, create /opt/dwes-data (per DEV-DEPLOY.md step 3) — needs 4, 6, 7
10. .env created on VM with JWT_SECRET/POSTGRES_PASSWORD (I2) + domain vars — needs 8 (for correct RP_ID/RP_ORIGIN)
11. TLS cert issued via init-letsencrypt.sh (D1) — needs 8 DNS propagated + 7 port 80 open
12. Database restored from your existing backups/*.sql dump (per DEV-DEPLOY.md step 6) — needs 9
13. GitHub Secrets set: DEPLOY_SSH_* + DWES_ENV_FILE (A6) — needs 6, 1, 10
14. First deploy triggered (push or workflow_dispatch)
15. Verify: /healthz → 200, /api/health → db:connected, https://dwes.ingenious-network.com loads
```

At each 🛑 in sections A–C, stop and confirm; I will **re-verify from evidence** before continuing —
`gh auth status`, `oci iam region get` (only if B4 done), `nslookup dwes.ingenious-network.com`,
`ssh <user>@<ip> docker --version`, and finally live `curl` checks against the real URL —
exactly the same evidence-first method used to verify everything else this session.

---

## What's explicitly NOT required for this deployment

Per the architecture decision at the top: **OCI Vault, KMS, Bastion, OCIR (container registry),
Cloudflare API token, and the `infra/oci/terraform/*` apply** are all part of the separate,
unused production path (`scripts/go-live.mjs` / `deploy-production-oci.yml`) and are not needed
to get `https://dwes.ingenious-network.com` live under this guide.
