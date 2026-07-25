# Second Review — GA UI + orphaned 3D removal (Phase A local)

**Branch:** `change/remove-3d-and-ga-ui-local-2026-07-25`  
**Base:** `e50d1d175b786bfcd22762fe9c1d52478584cfc0` (verified Supervisor GA UI)  
**Range:** `e50d1d1` → working tree (Phase A local; not yet tagged for production)  
**Reviewer:** Cursor Desktop Agent  
**Date:** 2026-07-25  

## Summary

This release reuses the verified GA Upload / GA View / popover work on `e50d1d1` and removes orphaned Three.js / `@react-three` frontend dependencies plus a tracked 3D screenshot on a lineage that already lacked panel-model / Demo Lab / EngineeringModelViewer sources. No auth, RBAC, wiring, Excel, or deploy-infra files were modified in Phase A. **Production deploy remains blocked** until OCI Bastion baseline, verified backup, and drift recovery (Phase B) complete.

## Findings

### Critical
None in Phase A source diff.

### High
None in Phase A source diff.

### Medium

| ID | Finding | Status |
|----|---------|--------|
| M1 | OCI Bastion / production identity not verified from this machine; GitHub `main` may differ from production `/opt/dwes`. | **Open — Phase B gate** |
| M2 | Fresh production backup not taken in Phase A. | **Open — Phase B gate** |
| M3 | Technician `GaDrawingViewModal` remains a stub (retitled GA View); Supervisor `PanelDrawingViewModal` is the full read-only GA viewer. | Accepted for this pass; full tech GA parity is a follow-up |

### Low

| ID | Finding | Status |
|----|---------|--------|
| L1 | Historical smoke scripts / CHANGELOG entries still mention “View Drawing” wording. | Non-blocking; scripts not required for production image |
| L2 | Untracked local artifacts remain (`*.tgz`, login JSON probes, `backend/test.glb`) — must not be committed. | Process control |

### Informational
- Demo Lab WIP preserved on `change/3d-model-demo-lab-2026-07-22` @ `4468cd1` — not part of this release.
- Reference branch `change/remove-3d-and-rename-ga-2026-07-24` @ `0605265` is a divergent lineage; not merged wholesale into this branch.

## Security
- No secrets added to the branch.
- No JWT / WebAuthn / CORS / demo-mode changes.
- Orphaned 3D npm packages removed → smaller attack/surface and supply-chain footprint.

## Deployment
- Phase A: local only. Do **not** create `v*` or run `deploy-production-oci.yml` until Phase B checklist passes.
- Rollback for a future deploy: previous production image tag + `infra/oci/scripts/rollback.sh`.

## Verdict
**PASS WITH WARNINGS** for local Phase A scope (GA wording + orphaned 3D deps).  
**Not cleared for production tag/deploy** until Phase B (Bastion baseline, backup, drift recovery, full smoke on production) is complete.
