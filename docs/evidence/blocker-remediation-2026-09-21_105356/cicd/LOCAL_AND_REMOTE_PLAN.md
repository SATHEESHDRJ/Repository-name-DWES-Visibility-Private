# CI/CD — local validation + remote plan (no push)

## Local workflow validation

File: `.github/workflows/ci.yml`

| Check | Result |
|-------|--------|
| YAML present with `on:` / `jobs:` | OK |
| Jobs cover FE typecheck/lint/tests/build | OK |
| Jobs cover BE build/tests | OK |
| Security audit job present | OK (`continue-on-error` on audit — does not hide need for Security FAIL in product gates) |
| Remote GitHub Actions run | **NOT TESTED** |

**Status: LOCAL WORKFLOW VALIDATED · REMOTE CI NOT TESTED**

Never call CI/CD PASS from YAML existence alone.

## Exact branch / push plan (authorization required before any step)

```
Repo: 02_GIT_PRODUCTION_SOURCE/DWES
Branch: change/technician-single-wire-matrix-2026-07-27
HEAD: 949b6806377e01f9b12229f9292f37026133b7b3 (dirty tree — commit scope TBD by Owner)
```

Proposed remote steps ( **do not execute without separate authorization** ):

1. Owner reviews dirty-tree commit set (exclude secrets, `uploads/`, `docs/evidence` if policy requires).
2. `git push -u origin HEAD` on the change branch (or a new `change/blocker-remediation-…` branch).
3. Open PR → GitHub Actions runs `.github/workflows/ci.yml`.
4. Record workflow run URL + exit status in evidence.
5. **No** tag push, **no** release, **no** production deploy from this plan.

## Blockers for CI/CD PASS

- Remote workflow must pass on GitHub.
- Security job must not be the sole reason for product Security PASS while critical/high remain.
