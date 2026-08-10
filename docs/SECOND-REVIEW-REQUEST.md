# Second Review Request — Claude Code

**Project:** DWES (Digital Wiring Execution System)  
**Repository:** `C:\Users\sathe\OneDrive\Desktop\DWES`  
**Branch:** `change/oci-single-vm-prod-2026-07-09`  
**Diff range:** `652c1a1` (OCI single-VM package) → `HEAD` (current branch tip)  
**Review date:** 2026-07-09

---

## Your task

Perform a **read-only security and deployment review** of all commits on this branch from `652c1a1` through `HEAD`. Do **not** modify any source file, config, or script. Write findings **only** to `docs/SECOND-REVIEW.md`.

### Commits in scope

```
61ff28f fix(oci): certbot renew path and Bastion deploy workflow.
16b40a2 feat(auth): production bootstrap UI and director password RBAC.
27e0573 test(e2e): docker compose role journeys and k6 smoke script.
b374490 docs(oci): overnight report, timeline, and audit updates.
62a2782 docs(oci): director bootstrap references UI gate.
```

(Base package: `652c1a1` — Add OCI single-VM production package for me-dubai-1.)

---

## Review dimensions

### (a) Security mistakes

- Secrets, keys, passwords, or tokens accidentally committed (search `infra/`, `.github/`, `backend/`, `docs/`, hooks).
- Weak or dangerous defaults in `.env.production.example`, compose, Terraform variables, GitHub workflows.
- Endpoints exposed in production that should be gated (`login-hints`, `/api/env`, demo seed, dev routes).
- WebAuthn misconfiguration: `RP_ID`, `RP_ORIGIN`, `CORS_ORIGINS`, `DWES_DOMAIN` consistency across compose, nginx, backend.
- JWT, refresh tokens, Bastion SSH, OCI API key handling in workflows and scripts.
- Production bootstrap bypass (can admin/director skip password rotation or WebAuthn?).

### (b) Deployment mistakes

- `infra/docker/docker-compose.yml` — bind mounts, healthchecks, certbot renew path, nginx ssl paths.
- `infra/docker/scripts/` — certbot deploy-hook, sync-letsencrypt-to-nginx.sh correctness.
- `infra/oci/terraform/` — syntax, circular deps, security list vs NSG, Bastion subnet, monitoring alarm query, outputs needed for deploy.
- `infra/oci/scripts/deploy-via-bastion.sh` — OCI CLI args, SSH target, session lifecycle.
- `.github/workflows/deploy-production-oci.yml` — Bastion deploy, secrets, image tags.
- `cloud-init.yaml` — cron paths, `/mnt/dwes-data` dirs, backup schedule.
- Backup cron and `backup-oci.sh` paths.

### (c) First-deploy failure risks

- Anything that would fail on **first `terraform apply`** (invalid resources, missing variables, wrong region `me-dubai-1`).
- Anything that would fail on **first VM deploy** (compose up, init-letsencrypt, OCIR pull, Bastion SSH, missing GitHub secrets).
- Data migration scripts (`migrate-db.sh`, `migrate-uploads.sh`) — destructive or wrong assumptions.
- RBAC gaps blocking production bootstrap (admin/director password change).

---

## How to review

1. `git log 652c1a1..HEAD --oneline` and `git diff 652c1a1..HEAD --stat`.
2. Read changed files in: `infra/`, `.github/workflows/`, `backend/src/auth/`, `backend/src/users/`, `src/components/auth/`, `src/store/`, `e2e/`, `docs/`.
3. Cross-check against `docs/DEPLOY-DECISIONS.md`, `docs/HUMAN-ACTIONS.md`, `docs/DWES_ORACLE_CLOUD_DEPLOY_PROMPT.md`.

---

## Output format (write to `docs/SECOND-REVIEW.md`)

```markdown
# Second Review — Claude Code

**Branch:** change/oci-single-vm-prod-2026-07-09
**Range:** 652c1a1..<HEAD>
**Reviewer:** Claude Code
**Date:** YYYY-MM-DD

## Summary
(2–4 sentences)

## Findings

| Severity | Location | Finding | Recommendation |
|----------|----------|---------|----------------|
| Critical | path:line | ... | ... |
| High | ... | ... | ... |
| Medium | ... | ... | ... |
| Low | ... | ... | ... |

## No issues found
(areas explicitly checked and clean)

## Needs human confirmation
(items you cannot verify without OCI live tenancy)
```

**Severity rules:**

- **Critical:** Would cause security breach, data loss, or guaranteed production outage on first deploy.
- **High:** Likely deploy/ops failure or significant security weakness; must fix or accept before tag deploy.
- **Medium:** Should fix soon; workaround exists.
- **Low:** Hygiene, docs, or edge case.

Every finding **must** cite `file:line` or exact file path with evidence (quoted snippet or variable name).

---

## Constraints

- **DO NOT** edit, create, or delete any file except `docs/SECOND-REVIEW.md`.
- **DO NOT** run `terraform apply`, `docker compose up` against production, or any destructive command.
- **DO NOT** commit anything.
- If uncertain, use **Needs human confirmation** — do not invent findings.

---

## Key paths (start here)

| Area | Path |
|------|------|
| Compose prod | `infra/docker/docker-compose.yml` |
| Certbot / TLS | `infra/docker/scripts/certbot-deploy-hook.sh`, `sync-letsencrypt-to-nginx.sh` |
| Terraform | `infra/oci/terraform/main.tf`, `security.tf`, `variables.tf`, `outputs.tf` |
| Bastion deploy | `infra/oci/scripts/deploy-via-bastion.sh`, `.github/workflows/deploy-production-oci.yml` |
| Bootstrap | `backend/src/auth/production-bootstrap.service.ts`, `src/components/auth/ProductionBootstrapGate.tsx` |
| RBAC | `backend/src/users/users-rbac.ts` |
| E2E | `infra/docker/docker-compose.e2e.yml`, `e2e/tests/role-journeys.spec.ts` |
