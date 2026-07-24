# Second Review — Remove 3D Model + GA terminology rename

**Branch:** `change/remove-3d-and-rename-ga-2026-07-24`  
**Worktree:** `C:\Users\sathe\OneDrive\Desktop\DWES-remove-3d-ga`  
**Baseline:** `9f6a4a4` (`feat(dwes): finalize production workflows and responsive dashboards`)  
**Dirty tree preserved:** `C:\Users\sathe\OneDrive\Desktop\DWES` on `change/3d-model-demo-lab-2026-07-22` (not included)  
**Reviewer:** Cursor Agent  
**Date:** 2026-07-24

## Summary

Panel 3D model generation / viewer / demo-lab surface is removed from this release branch. Supervisor Drawing labels are renamed to GA terminology without changing drawing storage paths or 2D upload/view behaviour. PDF/DWG/DXF/image GA uploads remain supported; new 3D slot uploads are rejected. Exclusive Three.js / OCCT / web-ifc frontend dependencies are removed.

## Change-impact (confirmed)

| Area | Action |
|------|--------|
| Frontend | `PanelGaDrawingModal` rewritten GA/2D-only; deleted `EngineeringModelViewer` + workers/loaders; removed `panelModel` API helpers/types; Supervisor/Technician labels → GA Upload / GA View |
| Backend | Deleted `backend/src/panel-model/*`; removed model routes/providers earlier on branch; upload rejects 3D slot/formats |
| Feature flags | `VITE_ENABLE_PANEL_3D` obsolete (documented in `.env.example` / `features.ts`) |
| Packages | Removed `three`, `@react-three/drei`, `@react-three/fiber`, `occt-import-js`, `web-ifc` |
| Tests | Deleted `panel-model.test.cjs` + recovery test; updated drawing-package + deletion-consistency tests |
| Docs | `CHANGELOG.md`, `PROJECT_STATUS.md`, this `SECOND-REVIEW.md` |
| Data | **No** deletion of existing GA drawings, Excel, reports, projects, panels, or wiring records |

## Verification

| Check | Result |
|-------|--------|
| Frontend `npm run build` | **PASS** |
| Backend `prisma generate && nest build` | **PASS** |
| Backend automated tests | **PASS 83/83** |
| Browser smoke (`/`, `/technician`, role routes) | **NOT RUN** (dev server not exercised this pass) |
| Git `origin` / push / `v*` tag | **BLOCKED** — no remotes configured on this worktree |
| GitHub Actions → OCIR → OCI deploy | **BLOCKED** — no origin |
| OCI 3D artifact cleanup | **NOT STARTED** — requires healthy post-deploy image + verified backup |

## Findings

| Severity | Finding | Status |
|----------|---------|--------|
| **High (deploy)** | No git remote `origin` — cannot push, tag, or run approved Actions deploy | **Blocker** — add remote before release |
| **Medium** | Drawing package API still exposes `model_3d` / `can_download_3d` keys (false/null) for shape stability | Acceptable; optional later cleanup |
| **Low** | Browser role smoke and live GA open not verified in this pass | Run before production tag |
| **Low** | Orphan historical files under `uploads/<project>/models/` on disk (if any) are not deleted by this code change | Inventory + backup after OCI deploy only |

## Protected functions (unchanged by design)

Technician DWS redesign (other branch), Excel upload/parsing, auth/JWT/WebAuthn/RBAC, assignment, Pause/Resume/SKIP/OPEN END, Mid Change, QA/QC, Director reports, completion reports, existing GA drawing files.

## Rollback

- Local: `git switch` / reset to baseline `9f6a4a4` on this branch, or discard the worktree.
- Production: keep previous production image/tag until a successful `v*` deploy exists (none created this session).

## Verdict

**PASS WITH WARNINGS** — implementation and automated verification complete locally; **do not deploy** until `origin` exists, SECOND-REVIEW browser smoke is completed, and change-management backup/tag gates pass.
