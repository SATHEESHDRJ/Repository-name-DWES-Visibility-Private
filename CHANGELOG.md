# DWES Changelog

Append-only log of scoped changes. Each entry includes a restore-point reference when git is in use.

Format: `YYYY-MM-DD` · prompt/source · summary · files · restore point · flags

---

## 2026-07-08 — MCP config + Section 8 (files sync)

- **Summary:** Added `.cursor/mcp.json` (filesystem, Postgres WiringSchemeDB, git, browser, memory). Merged Section 8 MCP rules into `dwes-project-skill.mdc`. Fixed `files/mcp.json` (removed invalid example-only `dwes-database` block). Synced `files/dwes-project-skill.md`.
- **Files:** `.cursor/mcp.json`, `dwes-project-skill.mdc`, `dwes-profile.mdc`, `Desktop/files/mcp.json`, `Desktop/files/dwes-project-skill.md`
- **Note:** `dwes-database` URL must match `backend/.env` `DATABASE_URL`. Reload Cursor after MCP install.

---

## 2026-07-08 — Revalidate project skills (artifact sync)

- **Summary:** Restored full artifact content to `dwes-project-skill.mdc`; fixed §2.3 for WiringSchemeDB read-only (not generic migrations); synced Desktop master copy; revalidated `dwes-profile.mdc` rules index.
- **Files:** `.cursor/rules/dwes-project-skill.mdc`, `dwes-profile.mdc`, `~/.claude/skills/dwes-project/SKILL.md`, `Desktop/dwes-project-skill.mdc`

---

## 2026-07-08 — Project skills sync (`dwes-project-skill.mdc`)

- **Summary:** Added permanent DWES project skill and discovered profile to `.cursor/rules/`; created `dwes-project` agent skill index linking `dwes-db-guard` and `dwes-reports-backup`.
- **Files:** `.cursor/rules/dwes-project-skill.mdc`, `.cursor/rules/dwes-profile.mdc`, `~/.claude/skills/dwes-project/SKILL.md`, `CHANGELOG.md`
- **Restore point:** _(pending git — no commits on main yet)_

---

- **Summary:** Reorganized All Projects action buttons into a compact flex toolbar (consistent 40px height, even spacing). Added supervisor-scoped gradient hero header (`dashboard-hero--supervisor`). Hid mid-changeover alert strips on the Projects tab; Mid-Changeover tab unchanged.
- **Files:** `SupervisorDashboard.tsx`, `ProjectsTab.tsx`, `SupervisorAlertStrips.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Verify:** `/supervisor` → Projects tab — compact action row, gradient header, no changeover status strip; Mid-Changeover tab still shows changeover queue.
- **Restore point:** _(pending git — no commits on main yet)_

---

## 2026-07-08 — FIX — Workspace sidebar height alignment

- **Summary:** The left **Workspace** sidebar (`dash-sidebar`) only matched its nav item height because of `self-start sticky` + `max-height: 100dvh`. It now stretches with `dash-layout` so the sidebar column matches main content height on all project/dashboard routes; short pages still fill the viewport below the topbar via `--dash-topbar-height`.
- **Files:** `src/styles/design-system.css`
- **Verify:** `npm run build`; open `/supervisor` → Projects (and Assignments), `/technician`, `/admin` — sidebar border/background should run full column height beside scrollable main content.

---

## 2026-07-07 — FIX — stale Vite proxy 502 (login "Can't reach server")

- **Summary:** Backend on :3001 was healthy but an orphaned Vite dev process returned 502 on `/api/*`. Restarted Vite; proxy + login verified (`/api/health`, `/api/auth/login`).
- **Recovery:** `npm run dev:all` or restart Vite after backend is up.
- **Files:** _(runtime restart only)_

---

## 2026-07-07 — FIX — backend autostart VBS syntax error

- **Summary:** Fixed `start-backend-hidden.vbs` VBScript compilation error (line 10: illegal multi-line `BuildPath(` call). Scheduled-task / hidden launcher can start `run-backend.bat` again.
- **Files:** `scripts/start-backend-hidden.vbs`
- **Verify:** `http://localhost:3001/api/health` → `status: ok`

---

## 2026-07-07 — REVERT — tech-ui-v2 layout redesign + dwes-modern-ui

- **Summary:** Reverted `.tech-ui-v2` layout redesign and `.dwes-modern-ui` scoped styling per author request. Prior streamlined wiring workflow UI restored (table-based single-wire exec, dash action buttons, panel list).
- **Files:** `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `PauseReasonModal.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `technician-wiring-workflow.mdc`

---

## 2026-07-07 — Technician Dashboard layout redesign (`.tech-ui-v2`)

- **Source:** User request — full layout/UX modernization (not color-only)
- **Summary:** Scoped `.tech-ui-v2` layout layer on technician surfaces. **Home:** active-panel focus strip with progress ring, command launch tiles, responsive panel grid. **Execution:** 3-zone header shell, card-based single-wire view (serial hero, source→dest flow, spec grid), sticky nav + open-end dock. Full Wiring View schedule unchanged. All handlers/API calls preserved.
- **Files:** `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — dwes_general_modern_ui_prompt — technician scoped modern UI

- **Source:** `dwes_general_modern_ui_prompt.md` (TARGET: Technician Dashboard + wiring execution)
- **Summary:** Scoped `.dwes-modern-ui` layer using existing design tokens only — larger type, WCAG-oriented contrast, elevated light cards, 44px touch targets, semantic status chips. Light workspace header (no in-content dark band). No logic/global token changes.
- **Files:** `TechnicianDashboard.tsx`, `WiringWorkstation.tsx`, `PauseReasonModal.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — REVERT — Prompt 07 technician-surface styling

- **Summary:** Reverted `.technician-surface` high-contrast emphasis layer per author request.
- **Files:** `TechnicianDashboard.tsx`, `WiringWorkstation.tsx`, `PauseReasonModal.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`

---

## 2026-07-07 — REVERT — Prompt.md vibrant color system

- **Summary:** Reverted technician `.tech-ui-vibrant` color overrides (navy headers, royal/emerald/amber gradients) per author request. Prior muted styling restored.
- **Files:** `TechnicianDashboard.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`

---

## 2026-07-07 — Prompt.md — pause modal reason-only

- **Source:** `Prompt.md` (Desktop, corrected)
- **Summary:** Removed Source Open / Destination Open from Pause Wiring popup. Pause now requires only a reason chip (Tea break, Lunch break, Material delay, Mid-changeover, Other) before confirm. Open-end buttons remain on the single-wire execution footer only.
- **Files:** `PauseReasonModal.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — Prompt.md — streamlined wiring workflow + full schedule reference

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed filter/search toolbar from single-wire execution view; added **Full Wiring View** (scrollable Excel-style reference schedule, close to return). Removed Confirm Source/Destination — **Skip (Next)** auto-marks both ends complete; **Source Open** / **Destination Open** record partial completion. Redesigned compact Pause Reason modal with chip picker and optional open-end buttons. Modernized My Assigned Panel cards (elevated layout, animated progress border, Green/Amber/Grey status). **Complete project** gated until all cables have both ends done. Status badges: Green Completed, Amber In Progress, Grey Not Started.
- **Files:** `DigitalWiringFrame.tsx`, `WiringWorkstation.tsx`, `PauseReasonModal.tsx`, `PanelsTab.tsx`, `wiring-utils.ts`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — Prompt.md — tablet-optimized wiring execution UI

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Optimized technician Digital Wiring View for tablet visibility: compact search/filters/validation strip/secondary chrome; enlarged primary wiring fields (No., Source, Destination, Color, Size, Length, Status); slimmer cable visual path bar. Removed Notes/Issue column. Renamed Next → **Skip (Next)**. Added **Tablet View** fullscreen mode (hides app shell via portal) and **Return to Web View** to restore embedded dashboard layout. Portrait/landscape CSS for tablet fullscreen.
- **Files:** `DigitalWiringFrame.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — Prompt.md — embedded Digital Wiring workspace (no popup)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed technician Digital Wiring popup/modal (`createPortal`, `dwf-modal-backdrop`). Digital Wiring View now loads inside the main Technician Dashboard layout with embedded `dwf-workspace` shell — preserves app header, nav, and dashboard structure. Single-wire flow, filters, validation strip, prev/next nav, and Confirm Source/Destination unchanged. Back to panels via workspace header.
- **Files:** `WiringWorkstation.tsx`, `WiringTab.tsx`, `TechnicianDashboard.tsx`, `DigitalWiringFrame.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_
- **Flags:** Modal CSS retained for non-technician/preview use only.

---

## 2026-07-07 — Prompt.md — single-wire Digital Wiring View (technician)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Technician Digital Wiring View shows one cable at a time (not the full schedule table). Kept modal header, search/filters, validation strip, Excel column row, and Previous/Next serial navigation. Added step-by-step Confirm Source → Confirm Destination with auto-advance to next pending cable. Supervisor full-list workflow unchanged.
- **Files:** `DigitalWiringFrame.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — Prompt 06 — revert technician header to original

- **Source:** `dwes_06_revert_tech_dashboard_header.md`
- **Summary:** Reverted technician dashboard hero to the original static header (`Technician Dashboard` + `Wiring Technician` chip + original subtitle). Removed project/panel identity and assigned date/time from the header area only.
- **Files:** `src/pages/technician/TechnicianDashboard.tsx`, `.cursor/rules/technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_
- **Flags:** Assigned date/time no longer appears at top; panel identity remains available via "My Assigned Panels."

---

## 2026-07-07 — Prompt.md — restore Actual Wiring View (full schedule)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed focused single-wire mode (`SingleWireView`). Restored `DigitalWiringFrame` full schedule with SRC/DST checkboxes, search/filters, validation strip, and Previous/Next serial navigation with row highlight.
- **Files:** `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — Prompt.md — unified dashboard hero (technician)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed separate `tech-job-header` card; technician project + panel + assigned date/time integrated into shared `DashboardShell` `dashboard-hero` (same structure as other roles). Topbar unchanged.
- **Files:** `DashboardShell.tsx`, `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `design-system.css`
- **Restore point:** _(pending git)_

---

## 2026-07-07 — Change-management protocol adopted

- **Source:** `dwes_change_management_protocol.md`
- **Summary:** Protocol documented; project knowledge files created/updated (`CHANGELOG.md`, `PROJECT_STATUS.md`, `.cursor/rules/change-management.mdc`). Git restore points blocked until initial commit on `main`.
- **Files:** `CHANGELOG.md`, `PROJECT_STATUS.md`, `.cursor/rules/change-management.mdc`, `.cursor/rules/technician-wiring-workflow.mdc`
- **Restore point:** _(none — repo has no commits yet)_
- **Flags:** Run `dwes_git_init_safe.md` Step 7 (initial commit) before per-change branches.

---

## 2026-07-07 — Prompt.md — single-wire Digital Wiring View only

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed Focused wire / Full schedule toggle from technician popup. Removed full 657-row table from technician workflow. Popup opens directly into one-wire sequential flow (Confirm source → Confirm destination → auto-advance). Dashboard header unchanged.
- **Files:** `src/components/technician/wiring/WiringWorkstation.tsx`
- **Restore point:** _(pending git)_
- **Flags:** `DigitalWiringFrame.tsx` retained in repo for non-technician/future use but not mounted in technician popup.

---

## 2026-07-07 — Prompts 4 & 5 — dashboard buttons + focused flow refinements

- **Source:** `dwes_04_tech_dashboard_header_buttons.md`, `dwes_05_digital_wiring_view_focused_flow.md`
- **Summary:** Consolidated technician dashboard header; buttons above header; assignment gating; renamed Digital Wiring View; two-step confirm buttons; read-only SRC/DST markers in full table (before table removed from popup).
- **Files:** `DashboardShell.tsx`, `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `Topbar.tsx`, `AssignmentAcknowledgmentModal.tsx`, `useLiveWiringStore.ts`, `GaDrawingViewModal.tsx`, `design-system.css`
- **Restore point:** _(pending git)_
- **Flags:** Multi-panel: top buttons follow selected row.

---

## 2026-07-07 — Prompts 1–3 — technician restructure, top bar live, wiring focus

- **Source:** `dwes_01` … `dwes_03` (MD1)
- **Summary:** Removed KPI cards and dashboard QR; job header + panel list; live top-bar indicator; wiring workstation focus view; pause on wiring page; direct start on wiring page.
- **Files:** See prompts 4/5 entry (overlapping files)
- **Restore point:** _(pending git)_
- **Flags:** GA drawing modal is stub only.
