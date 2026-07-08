# DWES Project Status

**Last updated:** 2026-07-08 (Hard Reset DB dev tool)  
**Repo:** `C:\Users\sathe\OneDrive\Desktop\DWES`  
**Detailed history:** `PROGRESS.md` (feature log) · **Change log:** `CHANGELOG.md`

---

## Git / restore points

| Item | State |
|------|--------|
| Repository | Branch `change/fix-duplicate-resolver-2026-07-08` off `main` @ `f6af0a9` |
| Latest commit | `f6af0a9` — MCP config + project rules |
| Working tree | **Dirty** — duplicate resolver fix + prior unstaged set |
| Duplicate resolver fix (2026-07-08) | Branch `change/fix-duplicate-resolver-2026-07-08` (no commit) |
| Protocol | `dwes_change_management_protocol.md` — follow before every change |

**Stabilization pass (2026-07-08):** No checkpoint branch/commit created (author did not request commit). Restore point = current dirty `main` at `f6af0a9` + working tree.

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
| **Supervisor** — Projects toolbar shorter action labels (Wiring Upload, Workflow, Drawing, Reports, Users) | **DONE** |
| **Supervisor** — hero header matches admin/director (default `dashboard-hero`) | **DONE** |
| **Supervisor** — Projects tab project + panel selector; gated uploads/reports | **DONE** |
| **Supervisor** — Projects Active Panel dropdown (compact `=H001` labels only; project-scoped dedupe) | **DONE** |
| **Supervisor** — Duplicate panel delete removes frame + DB refs; auto-refresh all workspaces | **DONE** (2026-07-08) |
| **Supervisor** — wiring upload targets selected panel (`frame_id`) | **DONE** |
| **Supervisor** — Wiring Upload + Drawing modals: View / Replace when file exists (no separate View button) | **DONE** (2026-07-08) |
| **Supervisor** — Unified `FileViewer` (PDF/image/Excel) + metadata bar in upload popups | **DONE** (2026-07-08, spec pass) |
| **Supervisor** — Global duplicate panel name guard (UI + API 409) blocks wiring/drawing/reports/workflow until resolved | **DONE** (2026-07-08; drawing modal + toolbar gating aligned in master verify pass) |
| **Supervisor** — Duplicate panel resolver: distinguishable rename buttons, duplicate-only select, selection preserved on resolve | **DONE** (2026-07-08) |
| **Supervisor** — Panel ID shown in upload headers + viewer; duplicate-name upload confirm | **SUPERSEDED** — hard block + rename/select resolution (2026-07-08) |
| **Supervisor** — Replace upload: confirm + progress warning + backups before overwrite | **DONE** (2026-07-08) |
| **Supervisor** — mid-changeover alerts hidden on Projects tab | **DONE** |
| **Supervisor** — per-panel metadata (create/add/edit); info card shows selected panel fields | **DONE** |
| **Supervisor** — New Project popup (compact 2-col, combined fields, auto project name) | **DONE** |
| **Desktop icon** — canonical Ingenious globe mark on white tile (from `logo-icon.svg`); `favicon.ico` + SVG favicon + PWA PNGs + `apple-touch-icon` + `app-icon.ico`; manifest theme `#1B2958` | **DONE** |
| **App shell** — Workspace sidebar full column height (`dash-sidebar` stretch) | **DONE** |
| **App shell** — Workspace nav + content typography modernization (tokens, gradient nav pill, card surfaces) | **DONE** |
| Admin / Director / QA-QC dashboards | Unchanged in recent prompts |
| DWF upload + 935-cable table component (`DigitalWiringFrame.tsx`) | **DONE** (component exists; not shown in technician popup) |
| User Management empty-list fix | **DONE** |
| **Supervisor** — Projects single info card (panel voltage/system type) | **DONE** |
| **Supervisor** — Panel completion report PDF (live data, Prompt.md) | **DONE** |
| **Supervisor** — Panel completion report executive preview (matches PDF zones) | **DONE** |
| **Supervisor** — Project Report inline PDF viewer (`ProjectPdfPreviewModal` + `PdfDocumentViewer` + **pdf.js** canvas renderer) | **DONE** |
| **Supervisor** — Excel Wiring Upload full-screen worksheet grid | **DONE** |
| **UI** — Global modal/popup shell redesign (shared `Modal`, unified backdrop/sizes/motion) | **DONE** |
| **Supervisor** — Technician Workflow modal (assign / deassign / changeover) | **DONE** |
| **Supervisor** — Assignments + Mid-Changeover removed from sidebar | **DONE** |
| **Supervisor** — Review & Approval unified workspace (panel status consolidated) | **DONE** |
| **Supervisor** — Panel Status sidebar tab removed | **DONE** |
| **Supervisor** — Status tab (renamed from Review & Approval) | **DONE** |
| **Supervisor** — Panel verification removed; auto-validated on Excel upload | **DONE** |
| **Supervisor** — Excel Wiring Upload unified wu-* design system | **DONE** |
| **Supervisor** — Excel Wiring Upload inline column checkboxes + column filters | **DONE** (filter UI hidden; logic retained) |
| **Supervisor** — Excel Wiring Upload full-view expand overlay for worksheet review | **DONE** |
| **Supervisor** — Excel Wiring Upload full-view Excel-like grid (sticky headers, frozen # col, column resize) | **DONE** |
| **Supervisor** — Excel Wiring Upload full-view rendering fix (single-modal swap, flex scroll chain) | **DONE** (2026-07-08) |
| **Supervisor** — Excel Wiring Upload all-rows parse (Full View + import; S.NO 1 retained) | **DONE** (2026-07-08) |
| **Supervisor** — Technician Workflow dashboard-scoped (gated button, no in-modal project/panel select) | **DONE** |
| **Supervisor** — Technician Workflow status context card (badges, technician, KPI) | **DONE** |
| **Supervisor** — Status workspace collapsible compact project cards | **DONE** |
| **Supervisor** — Status workspace live refresh (12s poll, tab-activate refetch, `dwes:frames-changed`, compact panel names) | **DONE** (2026-07-08) |
| Viewport / shell scroll fixes | **DONE** |
| **Stabilization pass** — frontend + backend production builds | **PASS** (2026-07-08) |
| **Stabilization pass** — panel completion report PDF (no GA merge) | **PASS** on rebuilt backend; **stale** on long-running `:3001` dev process |
| **Stabilization pass** — completion-report JSON endpoint | **PASS** on rebuilt backend (`:3003`); **404** on stale `:3001` — **restart required** |
| **Stabilization pass** — report meta grid overlap | **FIXED** in `panel-completion-report-pdf.ts` + `PanelCompletionReportPreview` CSS grid |

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

1. **Restart backend (required):** Stop long-running `npm run dev:all` / Nest on `:3001` and restart so `completion-report` + standalone ~66 KB panel PDF are served. Evidence: `:3001` uptime 18k+ s, `completion-report` → 404, `report-pdf` → ~15 MB; `:3003` (fresh `dist`) → JSON OK + ~66 KB PDF.
2. **IT-1 live data:** `frame_1783506467856` (`=H00+R`) holds **399** cables (imported before S.NO-1 fix). Re-upload `_H00+R.xlsx` → Validate & Import for 400.
3. **GA merge decision:** `report-pdf` now serves standalone completion report (no GA). `generateFrameDocument()` still contains GA-append logic but has **no route** — author to confirm whether to expose as separate “full package” export or remove dead code.
4. **Demo passwords** in `backend/src/main.ts` seed — do not deploy without rotation.
5. **Merge policy:** Agents create `change/*` branches; author merges to `main` after review.
6. **Wiring & Drawing spec (2026-07-08):** Drawings are **project-scoped** in backend — panel picker gates UI but `projectsApi.drawings` lists project files. Image drawing upload (PNG/JPG/SVG) not in supervisor picker. `uploadedBy` not in file store (metadata bar shows `—`). Populated popup opens viewer directly + **Replace** footer.
7. **Security triage (report-only, not fixed):** see master verify report in `CHANGELOG.md` 2026-07-08 entry — seed creds, `DEMO_MODE`, `/api/login-hints`, `.env` in tree, large client bundle, frontend role routing without server substitute.
8. **Hard Reset DB (dev only):** Admin → Settings → **Hard Reset DB** when `import.meta.env.DEV` + backend `DEMO_MODE=true` (or `ALLOW_DEV_HARD_RESET=true`). Wipes operational data + session log + WebAuthn; re-seeds 5 canonical projects; preserves user accounts + `uploads/backups/`.
