# Remote CI — preparation (not run)

**Branch:** `security/nest11-fastify5`  
**Local stack:** Nest11 bundle `8f0f666` + verify follow-up (`git log -1 --oneline` on `security/nest11-fastify5`) — **not pushed**.  
**Origin:** `security/nest11-fastify5` **not present** on `origin` (2026-09-21).

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
git push -u origin security/nest11-fastify5
# Open PR → confirm "DWES CI (local validation)" green → save run URL here.
```

No production deploy from this push.

**DB guard:** `backend/prisma/migrations/` may appear in the bundle for code parity. **Do not** run `prisma migrate deploy` against **WiringSchemeDB** (read-only schema policy). CI uses placeholder `DATABASE_URL` + `prisma generate` only.
