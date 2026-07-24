# Second Review — Remove 3D Model + GA terminology rename + GA Upload popover

**Branch:** `change/remove-3d-and-rename-ga-2026-07-24`  
**Worktree:** `C:\Users\sathe\OneDrive\Desktop\DWES-remove-3d-ga`  
**Baseline:** `9f6a4a4`  
**Release commit (code):** `169da2f` — Remove panel 3D model feature and rename Supervisor Drawing labels to GA.  
**Prior tip:** `b3f182c` — docs SECOND-REVIEW release gates  
**This session:** GA Upload gated hint → anchored `ButtonHintPopover` (uncommitted until author commit)  
**Dirty tree preserved:** `C:\Users\sathe\OneDrive\Desktop\DWES` on `change/3d-model-demo-lab-2026-07-22` (not included)  
**Reviewer:** Cursor Agent  
**Date:** 2026-07-24 (popover UX + release re-check)

## Summary

Panel 3D model surface remains removed. Supervisor labels remain **GA Upload** / **GA View**. Additional surgical UX: when **GA Upload** is clicked without an active project+panel, show an anchored warning popover beside the button (not a bottom-right toast), with GA Upload wording.

## Pre-release live OCI backup (Phase 1 — prior session)

| Item | Path / value |
|------|----------------|
| Local artifacts | `artifacts/pre-release-live-20260724-132556/` |
| VM durable copy | `/opt/dwes-data/backups/pre-release-live-20260724-132556/` |
| Dump SHA-256 | `91c9d5cade691a2d0320258941ce0659e8e6dcb935ce95edbd0d75f98000428f` |
| Identified GLB (delete only after successful deploy) | `/opt/dwes-data/uploads/010/models/...` (2 files) |

## Verification (2026-07-24 afternoon — popover)

| Check | Result |
|-------|--------|
| Worktree branch | **PASS** — `change/remove-3d-and-rename-ga-2026-07-24` |
| Frontend `npm run build` | **PASS** (exit 0) |
| Browser smoke — Supervisor + GA Upload label | **PASS** |
| Browser smoke — no 3D Model | **PASS** |
| Browser smoke — gated GA Upload → anchored popover (“…before opening GA Upload”) | **PASS** (`_tmp_ga_upload_popover_smoke.json`) |
| Browser smoke — no corner toast for this gate | **PASS** (toastCount=0) |
| Browser smoke — click-outside dismiss | **PASS** |
| Browser smoke — auto-dismiss ~3.2s | **PASS** |
| Browser smoke — GA View control present | **PASS** |
| Git `origin` | **BLOCKED** — no remotes configured; no confirmed GitHub URL |
| `gh` CLI | **BLOCKED** — not logged in |
| GitHub Actions → OCIR → OCI deploy | **NOT STARTED** (gated) |
| Production post-deploy verify | **NOT STARTED** (gated) |

## Findings

| Severity | Finding | Status |
|----------|---------|--------|
| **Critical (deploy)** | No git remote `origin` / no confirmed GitHub URL; `gh` not authenticated | **Blocker** |
| **Info** | Production still shows legacy “Drawing” toast until a `v*` deploy lands | Expected until origin+tag |

## Protected functions (unchanged)

Technician DWS, Excel, auth/JWT/WebAuthn/RBAC, QA/QC, Director reports, Admin Cloud Sync (excluded), SYS controls, existing GA files/APIs/storage.

## Rollback

- Local: reset to `b3f182c` / `169da2f` / baseline `9f6a4a4`.
- Production: **no `v*` tag this session**. Keep current `dwes-api:local` / `dwes-nginx:local` until a successful tagged deploy.

## Verdict

**FAIL (release gates incomplete)** — popover UX + GA labels + FE build verified locally; **do not push/tag/deploy** until confirmed `origin` URL + `gh auth login`, then SECOND-REVIEW overall PASS and `v*` tag via Actions only.
