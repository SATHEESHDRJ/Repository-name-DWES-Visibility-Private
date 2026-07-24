# Second Review — Remove 3D Model + GA terminology rename

**Branch:** `change/remove-3d-and-rename-ga-2026-07-24`  
**Worktree:** `C:\Users\sathe\OneDrive\Desktop\DWES-remove-3d-ga`  
**Baseline:** `9f6a4a4` (`feat(dwes): finalize production workflows and responsive dashboards`)  
**Release commit tip:** `169da2f` (no follow-up code commits yet)  
**Dirty tree preserved:** `C:\Users\sathe\OneDrive\Desktop\DWES` on `change/3d-model-demo-lab-2026-07-22` (not included)  
**Reviewer:** Cursor Agent  
**Date:** 2026-07-24 (release gates resumed)

## Summary

Panel 3D model generation / viewer / demo-lab surface is removed on this release branch. Supervisor Drawing labels are renamed to GA terminology without changing drawing storage paths or 2D upload/view behaviour. PDF/DWG/DXF/image GA uploads remain supported; new 3D slot uploads are rejected. Exclusive Three.js / OCCT / web-ifc frontend dependencies are removed.

## Commit scope check (`9f6a4a4..169da2f`)

Confirmed in-scope only: panel-model deletion, EngineeringModelViewer/workers removal, 3D dependency/lockfile removal, GA terminology UI, related tests, CHANGELOG/PROJECT_STATUS/SECOND-REVIEW. No Technician DWS redesign files.

## Verification (re-run 2026-07-24)

| Check | Result |
|-------|--------|
| Worktree clean at `169da2f` | **PASS** |
| Commit scope (3D removal + GA rename + tests/docs only) | **PASS** |
| Frontend `npm run build` | **PASS** (exit 0) |
| Backend `prisma generate && nest build` | **PASS** (exit 0) |
| Backend automated tests | **PASS 83/83** |
| Browser smoke — Login page `#root` / Sign In UI at `http://localhost:5175/` | **PASS** (page title DWES; Username/Password/Sign In visible) |
| Browser smoke — Supervisor / GA Upload / GA View / Technician / QA/QC / Director / Reports / Logout | **FAIL (blocked)** — Nest backend cannot start: Prisma `P1010` DatabaseAccessDenied on `WiringSchemeDB` (`localhost:5432` is open; app user denied). Full authenticated smoke impossible until DB access is restored. |
| Git `origin` | **BLOCKED** — no remotes on worktree |
| `gh` CLI | **BLOCKED** — not logged in (`gh auth login` required) |
| GitHub Actions → OCIR → OCI deploy | **NOT STARTED** |
| OCI 3D artifact cleanup | **NOT STARTED** |

## Browser-smoke evidence

- **URL:** `http://localhost:5175/`
- **Observed:** Login shell renders (Digital Wiring Execution System / Welcome back / Username / Password / Sign In).
- **Not exercised:** authenticated role dashboards, GA Upload/View with real PDF, Technician/QA/Director/Reports, Logout — blocked by backend DB denial.

## Findings

| Severity | Finding | Status |
|----------|---------|--------|
| **High (deploy)** | No git remote `origin` and `gh` not authenticated — cannot push, tag, or run approved Actions deploy | **Blocker** — provide confirmed GitHub clone URL + `gh auth login` |
| **High (smoke)** | Backend startup `P1010` DatabaseAccessDenied against local WiringSchemeDB | **Blocker** — fix Postgres role/password/`DATABASE_URL` in gitignored `backend/.env`, then re-run full smoke |
| **Medium** | Drawing package API still exposes `model_3d` / `can_download_3d` keys (false/null) for shape stability | Acceptable; optional later cleanup |
| **Low** | Vite chunk >500 kB warning remains after Three.js removal | Non-blocking |

## Protected functions (unchanged by design)

Technician DWS redesign (other branch), Excel upload/parsing, auth/JWT/WebAuthn/RBAC, assignment, Pause/Resume/SKIP/OPEN END, Mid Change, QA/QC, Director reports, completion reports, existing GA drawing files.

## Rollback

- Local: discard worktree or reset to baseline `9f6a4a4`.
- Production: no `v*` tag created this session; keep any prior production image/tag.

## Verdict

**FAIL (release gates incomplete)** — code + automated builds/tests remain green at `169da2f`, but **do not push, tag, or deploy** until:

1. Confirmed GitHub `origin` URL is provided and `gh auth login` succeeds  
2. Local Postgres access for WiringSchemeDB is fixed and full browser smoke PASSes  
3. This SECOND-REVIEW is updated to PASS and production Actions secrets are confirmed present before any `v*` tag
