# Remote CI — preparation (not run)

**Branch:** `security/nest11-fastify5`  
**Origin (2026-09-21):** **`d2ff3402`** — single commit on `origin/main` (restore tree minus GitHub-blocked blobs: `.terraform` providers, `logs/launcher/*.log.*`, entire `Backup/`).  
**Local full history:** `backup/security-nest11-full-history` → `a2221734` (7 commits; **not pushable** due to 100MB files in snapshot history).  
**Push helper branch used:** `security/nest11-fastify5-remote` tracks `origin/security/nest11-fastify5`.

## Push candidate (HEAD)

**Branch HEAD** on `security/nest11-fastify5` is the CI-faithful merge candidate (Nest11 bundle + verify fixes).  
Push **branch HEAD only** — not the dirty working tree (`backend/tmp_*`, `uploads/`, extra untracked docs remain local).

**CI test parity:** Remote `npm test` runs committed tests only; HEAD includes the full **426**-test suite (verified 2026-09-21).

**Staging helper (dry-run default):** `scripts/stage-for-remote-ci.ps1` · apply with `-Apply` → review `git diff --cached` → commit → push.  
Dry-run manifest (**199** paths via dynamic `backend/`/`scripts/` scan — incl. `drawing-intelligence`, `prisma/migrations`, `public/assets/`): re-run `stage-for-remote-ci.ps1` to refresh `REMOTE_CI_STAGING_MANIFEST.txt`.

## Suggested minimum scope for first CI push (Nest11 security closure)

| Area | Paths (indicative) |
|------|---------------------|
| Nest 11 / Fastify 5 | `backend/package.json`, `backend/package-lock.json`, `package.json`, `package-lock.json` |
| JWT / boot | `backend/src/auth/auth.module.ts`, `backend/src/main.ts` |
| Container | `infra/docker/Dockerfile.api`, `infra/docker/scripts/api-entrypoint.sh` |
| CI trigger | `.github/workflows/ci.yml` (`security/**`) |
| LIVE TB gate doc | `docs/ACCEPTANCE_DRAWING_REQUIRED.md` |
| Verify scripts | `scripts/verify-*`, `scripts/run-final-two-blockers-verify.ps1`, `scripts/run-ci-local-parity.ps1` |
| PWA test sync | `tests/pwa-install.test.mjs` (SW version must match `public/sw.js`) |
| Evidence (optional) | `docs/evidence/final-two-blockers-2026-09-21_112345/` (exclude huge binaries if any) |

Defer unrelated FE/LIVE TB feature WIP unless the PR owner wants a single mega-PR.

## Local preflight (done)

- `scripts/run-ci-local-parity.ps1` — FE + BE jobs
- `npm audit --audit-level=high` — exit 0 (moderate residual)
- `docker build -f infra/docker/Dockerfile.api` — OK (`verify/docker-api-build-nest11.log`)

## When authorized

```powershell
# Already pushed: origin/security/nest11-fastify5 @ d2ff3402
# PR: https://github.com/SATHEESHDRJ/Repository-name-DWES-Visibility-Private/pull/new/security/nest11-fastify5
# Confirm "DWES CI (local validation)" green → save run URL below.
```

**CI run URL:** _(pending — check GitHub Actions after PR/open)_

No production deploy from this push.

**DB guard:** `backend/prisma/migrations/` may appear in the bundle for code parity. **Do not** run `prisma migrate deploy` against **WiringSchemeDB** (read-only schema policy). CI uses placeholder `DATABASE_URL` + `prisma generate` only.
