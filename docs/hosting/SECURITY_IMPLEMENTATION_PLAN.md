# DWES Security Implementation Plan

**Date: 2026-07-13.** Ordered remediation of the gaps in `SECURITY_AUDIT.md`. **No step here has been executed** — code changes need user approval (project rule: smallest diff, no new deps without approval). Effort estimates assume the existing codebase patterns.

## Phase S1 — Before any internet exposure (code changes, ~1 day total)

| Step | Gap | Change | Effort |
|---|---|---|---|
| S1.1 | G2 | **Rotate demo credentials**: replace seed passwords in `backend/src/main.ts:16-23` with env-provided or generated-at-boot values (values entered by the user — never committed, never echoed to logs/chat); delete the dev-fallback JWT secret literal from `jwt.strategy.ts:20`/`auth.module.ts:19` in favor of a hard requirement | 1–2 h |
| S1.2 | G1 | Enable global validation: `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` in `main.ts`; add DTO classes for the highest-risk write endpoints first (auth, uploads metadata, projects, assignments) — class-validator is already installed | 3–5 h (incremental per controller) |
| S1.3 | G3 | Add `@Roles(...)` to `projects.controller.ts` `findAll`/`findOne`/`stats`; for technicians, filter to assigned projects (reuse `assertTechnicianProjectAccess` from `frames.controller.ts:362`) | 1 h |
| S1.4 | G6 | `app.use(json({ limit: '1mb' }))` (uploads use multipart; JSON never needs more) | 15 min |
| S1.5 | G9 | Reconcile domain spelling to `dwes.ingenious-network.com` in `deploy-secrets.local.env.example`, `docs/DEPLOY-DECISIONS.md`, `docs/HUMAN-ACTIONS.md` — **critical for WebAuthn RP_ID** | 30 min |
| S1.6 | G5 | Add `backend/data/dwes_auth.sqlite` to both backup paths (`scripts/backup.config.json` include-list; backup cron/`backup-oci.sh` adaptation — copy via SQLite `.backup` or stop-copy to respect WAL) | 1 h |

## Phase S2 — At go-live (config, no code)

- **HTTPS only**: platform TLS (Cloudflare + host certs) with HTTP→HTTPS redirect; verify auto-renewal is the platform's job (managed) or certbot cron (VPS — already scripted post-H2 fix, `CHANGELOG.md:82`).
- **CORS**: set `CORS_ORIGINS=https://dwes.ingenious-network.com` (exact origin, no wildcards). Verify the LAN-regex dev fallback can't run: `NODE_ENV=production` set on the host.
- **Secrets**: all via platform secret managers (Railway/Neon/Cloudflare dashboards or OCI Vault). Values typed in by the administrator only — never in Git, CI logs, or chat. GitHub Actions uses environment-scoped secrets with required reviewers on the production environment.
- **Least-privilege DB account**: create an app role with CRUD on the 7 tables only (no DDL — matches the db-guard rule that the app never migrates WiringSchemeDB); `sslmode=require` on the connection string.
- **`TRUST_PROXY=1`** behind any proxy (Cloudflare/Railway/nginx) so throttling sees real client IPs (`main.ts:161-164` already supports it).
- **Monitoring hooks**: platform uptime checks on `/api/health`; alert on repeated 401/429 spikes (login abuse) and disk/storage thresholds; certificate-expiry alerts (Cloudflare emits these; UptimeRobot free as backstop).

## Phase S3 — First maintenance window after go-live

| Step | Gap | Change |
|---|---|---|
| S3.1 | G4 | Enable helmet CSP: start `Content-Security-Policy-Report-Only` with `default-src 'self'` + the font/worker allowances the Vite bundle needs, watch a week of reports, then enforce. COEP stays off (pdf.js worker compatibility) unless tested |
| S3.2 | G7 | Refresh-token hygiene: nightly purge of expired/revoked rows; on refresh-reuse (revoked token presented) revoke all tokens for that user + log a security event to `session_log` |
| S3.3 | G10 | Evaluate async malware scanning (ClamAV container on VPS; or scan-on-download via a queue later). Until then the compensating controls in `SECURITY_AUDIT.md` §4.2 apply |
| S3.4 | — | Dependency/container scanning in CI: enable GitHub Dependabot + `npm audit` gate + Trivy scan of the two Docker images in `ci.yml` |
| S3.5 | — | Repo-history secret scan: run gitleaks/trufflehog over full history once (expected clean per SECOND-REVIEW, but verify), enable GitHub secret scanning + push protection when the repo gets its GitHub origin |

## Platform-conditional branch A — managed platform (Options A/B/C)

Per the brief: **no unnecessary SSH configuration is created.**
- Deployment via the provider's Git/CLI integration; deploy permissions restricted to the administrator account with 2FA enabled on Cloudflare/Railway/Neon/GitHub.
- Logs/metrics/secrets: use the platform's native facilities; retention noted in `INCIDENT_RESPONSE_RUNBOOK.md`.
- TLS: managed certificates end-to-end; verify renewal is automatic (it is, on all three).
- Database: Neon is TLS-only by default; no public Postgres port of our own exists in this architecture.

## Platform-conditional branch B — VPS (Option D, if ever chosen)

All of branch A's app-level items, plus (largely pre-scripted in `infra/oci/cloud-init.yaml` and `docs/SECURITY-NETWORK-AUDIT.md`):
1. Generate **Ed25519** SSH key locally (`ssh-keygen -t ed25519`); private key never leaves the administrator's device; public key only on the server.
2. Verify key login works **before** disabling password auth; then `PasswordAuthentication no`, `PermitRootLogin no`; non-root sudo user.
3. Restrict SSH: source-IP allowlist or provider bastion; else fail2ban (installed via cloud-init) + non-default port as noise reduction.
4. Firewall: only 80/443 public; SSH restricted; Postgres and API ports bound to the Docker internal network only (compose already does this — nginx is the only exposed service).
5. `unattended-upgrades` for security patches; monthly image refresh of the two Docker images; remove unused services from the base image.
6. Docker hardening: non-root container users (Dockerfile.api already runs as `dwes`), `no-new-privileges`, log rotation (already capped in compose).

## Verification of this plan
Each S1 item lands with a test: ValidationPipe (send malformed payload → 400), roles scoping (technician token → 403 on foreign project), body limit (2 MB JSON → 413), backup inclusion (restore drill recovers a passkey login). The go-live gate in `FINAL_DEPLOYMENT_CHECKLIST.md` requires all S1+S2 items green **and one successful full restore test** before DNS cutover.
