# DWES Project Status

**Last updated:** 2026-07-08  
**Repo:** `C:\Users\sathe\OneDrive\Desktop\DWES`  
**Detailed history:** `PROGRESS.md` (feature log) · **Change log:** `CHANGELOG.md`

---

## Git / restore points

| Item | State |
|------|--------|
| Repository | Initialized on `main` |
| Initial commit | **NOT DONE** — ~399 files staged; technician UI changes unstaged/untracked |
| Per-change branches | **Blocked** until first commit on `main` |
| Protocol | `dwes_change_management_protocol.md` — follow before every change |

**Action required:** Author approval for initial commit (`dwes_git_init_safe.md` Step 7), then use `change/<name>-<date>` branches for future work.

---

## Technician UI (current)

| Item | Status |
|------|--------|
| Dashboard — original static header (`Technician Dashboard` + role chip + subtitle) | **DONE** |
| Dashboard — project/panel/date-time identity block in header | **REMOVED** |
| Dashboard — separate in-page `tech-job-header` card | **REMOVED** |
| Dashboard — Digital Wiring View + GA Drawing buttons above header | **DONE** |
| Dashboard — assignment gating (disabled when no panels) | **DONE** |
| Dashboard — QR display removed | **DONE** |
| Top bar — live project pill when `in_progress` | **DONE** |
| Digital Wiring — popup/modal overlay (`createPortal`, backdrop) | **REMOVED** |
| Digital Wiring — embedded workspace inside dashboard shell | **DONE** |
| Digital Wiring — tablet-optimized primary fields + compact chrome | **DONE** |
| Digital Wiring — Notes/Issue column removed from execution view | **DONE** |
| Digital Wiring — Skip (Next) navigation label | **DONE** |
| Digital Wiring — Tablet View fullscreen + Return to Web View | **DONE** |
| Digital Wiring — filters removed; Full Wiring View reference schedule | **DONE** |
| Digital Wiring — Skip (Next) auto-complete both ends | **DONE** |
| Digital Wiring — Source Open / Destination Open partial workflow | **DONE** |
| Digital Wiring — Confirm Source/Destination removed | **DONE** |
| Technician UI — scoped modern UI (`.dwes-modern-ui`, token-derived) | **REVERTED** |
| Technician UI — layout redesign (`.tech-ui-v2`) | **REVERTED** |
| Pause Reason modal — reason selection only (compact chip UI) | **DONE** |
| My Assigned Panels — modern cards + animated progress border | **DONE** |
| Complete project — disabled until all cables both-ends done | **DONE** |
| Digital Wiring — full Actual Wiring schedule table (serial order) | **REMOVED from technician workspace** |
| Digital Wiring — focused-only single-wire card mode | **DONE** |
| Digital Wiring — two-step confirm (source → destination) | **DONE** |
| Digital Wiring — sequential auto-advance | **DONE** |
| Digital Wiring — Pause/Resume on wiring page | **DONE** |
| GA 3D/2D drawing viewer (detailed layout) | **OPEN** (stub modal) |
| Fingerprint / WebAuthn LAN (`https://dwes.local:5173`) | **DONE** (user must run hosts + certs) |

---

## Other roles

| Area | Status |
|------|--------|
| **Supervisor** — All Projects action toolbar (compact buttons, even spacing) | **DONE** |
| **Supervisor** — gradient hero header (`dashboard-hero--supervisor`) | **DONE** |
| **Supervisor** — mid-changeover alerts hidden on Projects tab | **DONE** |
| **App shell** — Workspace sidebar full column height (`dash-sidebar` stretch) | **DONE** |
| Admin / Director / QA-QC dashboards | Unchanged in recent prompts |
| DWF upload + 935-cable table component (`DigitalWiringFrame.tsx`) | **DONE** (component exists; not shown in technician popup) |
| User Management empty-list fix | **DONE** |
| Viewport / shell scroll fixes | **DONE** |

---

## Config / docs map (for agents)

| Purpose | Path |
|---------|------|
| **Project skill (always apply)** | `.cursor/rules/dwes-project-skill.mdc` |
| **Project profile (stack/domain)** | `.cursor/rules/dwes-profile.mdc` |
| **MCP servers** | `.cursor/mcp.json` |
| Setup & ports | `README.md`, `DEPLOY-LAN.md` |
| Feature progress (long form) | `PROGRESS.md` |
| Changelog | `CHANGELOG.md` |
| Cursor rules | `.cursor/rules/*.mdc` |
| Backup (git preferred) | `scripts/BACKUP.md` |
| Fingerprint setup | `DWES_ENABLE_FINGERPRINT_LOCAL.md` (if present) |

---

## Open flags

1. **Initial git commit** awaiting author `"approved"`.
2. **Demo passwords** in seed files — do not push secrets without review.
3. **`DEWS_WEB_APP/`** nested gitlink — only submodule reference staged.
4. **Merge policy:** Agents create `change/*` branches; author merges to `main` after review.
