# DWES Changelog

Append-only log of scoped changes. Each entry includes a restore-point reference when git is in use.

Format: `YYYY-MM-DD` · prompt/source · summary · files · restore point · flags

---

## 2026-07-08 — Dev — Hard Reset DB (DEMO_MODE gated)

- **Summary:** Added development-only **Hard Reset DB** — wipes all projects, wiring data, uploads, session log, WebAuthn credentials, duplicate hash cache, and in-memory frame/drawing stores; re-seeds 5 canonical demo projects; clears client storage and reloads. Guarded by `DEMO_MODE=true` or `ALLOW_DEV_HARD_RESET=true`; UI visible only in Vite dev build + backend flag. Backup-first (`pg_dump` + uploads archive). User accounts preserved.
- **Endpoints:** `GET/POST /api/dev/hard-reset` (system_admin; 404/403 when gated off)
- **Env:** `DEMO_MODE=true` (default dev) or `ALLOW_DEV_HARD_RESET=true`
- **Files:** `backend/src/dev/*`, `backend/src/common/dev-reset.util.ts`, `backend/src/common/seed-projects.ts`, `HardResetDbTab.tsx`, `useDevHardReset.ts`, `api.ts`, `AdminSettingsPage.tsx`, `webauthn-store.service.ts`, `auth.controller.ts`, `main.ts`, `.env.example`
- **Restore point:** Dirty working tree (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — UX — Duplicate panel warning dismiss (✕)

- **Summary:** Added session-only **Clear (✕)** on Supervisor Projects duplicate banner. Dismiss hides the warning and unblocks toolbar actions for testing; triggers fresh panel reload. Resets on project/panel change, frames-changed, and wiring/drawing upload start — banner reappears only if duplicates still exist. Backend 409 guard unchanged.
- **Files:** `DuplicatePanelWarning.tsx`, `ProjectsTab.tsx`, `usePanelDuplicateGuard.ts`, `design-system.css`, `CHANGELOG.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0.

---

## 2026-07-08 — Fix — Duplicate panel resolver (rename/select/clear)

- **Summary:** Fixed broken **Duplicate Panel Name Detected** resolver on Supervisor Projects. Rename buttons now map one-per-duplicate-panel (keyed by internal ID), with distinguishable labels (`tag + short id + cable/schedule hint`). **Set active duplicate panel** select lists the conflicting duplicates only (was incorrectly listing unique panels like `=E01`). Removed `ProjectsTab` effect that silently remapped `selectedPanelId` to the deduped dropdown entry — root cause of resolver catch/clear loop. Wiring upload modal now wires rename/select handlers; edit-save preserves active panel ID after reload.
- **§2 label decision:** Relabeled control **"Set active duplicate panel:"** — picks which duplicate internal ID actions bind to; not merge/delete and not "switch to unrelated unique panel." Merge path **not implemented** (rename-only per spec).
- **Root cause:** (1) `selectOptions` filtered *out* duplicates; (2) rename labels showed tag only; (3) `useEffect` stole selection when ID absent from `activePanelOptions`.
- **Files:** `panelDuplicates.ts`, `DuplicatePanelWarning.tsx`, `ProjectsTab.tsx`, `FramesTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-duplicate-resolver-2026-07-08` off dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — QA — Master bundle verify · debug · harden (`DWES_MASTER_verify_debug_harden.md`)

- **Summary:** Re-ran Tier E verification over the assembled change bundle per master orchestration spec. Frontend `npm run build`, backend `npm run build`, `npm run lint` (0 errors, 33 warnings), and `node backend/scripts/verify-excel-parse.mjs` all pass. Runtime: Vite shell routes `/`, `/technician`, `/supervisor` → HTTP 200. **Stale backend on `:3001`** (uptime ~5h) still serves pre-refactor panel `report-pdf` (~15 MB wiring+GA) and returns **404** for `completion-report`; rebuilt backend on `:3003` serves standalone completion PDF (~66 KB) and `completion-report` JSON OK. Fixed regression: `PdfDrawingUploadModal` + `usePanelDuplicateGuard` now **hard-block** duplicate panel tags (aligned with wiring modal + backend 409; removed soft `duplicatePanelUploadConfirm` on drawing upload/replace).
- **§1 decisions (applied from implemented bundle + spec authority):**
  1. **Report page-count:** Panel export = **one-page executive** (`dwes_project_completion_report_redesign.md`); multi-panel project dossier stays on `/projects/:code/report-pdf` (`Prompt.md` scope).
  2. **Excel parse:** Tier A parser fix supersedes fullview diagnostic doc — verified 400-row script.
  3. **Wiring/Drawing popup:** Build from `dwes_wiring_drawing_popup_view_replace.md`; module spec is reference only.
  4. **GA merge:** **Separate** — `frames/:id/report-pdf` = standalone completion report; `generateFrameDocument()` GA-append path has no route.
- **IT checklist:** IT-1 parser **PASS** (script); persisted `=H00+R` frame **399 cables** (pre-fix import — re-upload `_H00+R.xlsx` for 400). IT-2 viewers **PASS** (code: shared `FileViewer` + `PdfDocumentViewer`). IT-3 duplicate guard **PASS** after fix (UI hard block + `assertPanelNameUniqueForWrite` 409). IT-4 replace **PASS** (progress warning + backup). IT-5 report **PASS** on fresh backend / **FAIL** on stale `:3001`. IT-6 styling **MANUAL** (modal/responsive re-smoke).
- **Files:** `usePanelDuplicateGuard.ts`, `PdfDrawingUploadModal.tsx`, `ProjectsTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit per spec)
- **Manual:** Restart `npm run dev:all` to pick up backend dist; browser smoke-test logged-in flows; re-import `_H00+R.xlsx` on `=H00+R` panel for IT-1 live 400-cable check; triage security list below.

---

## 2026-07-08 — Feature — Global duplicate panel name guard

- **Summary:** Project-wide duplicate compact panel tags now **hard-block** all panel-scoped actions (wiring upload/view/replace, drawing upload/view/replace, reports, technician assign/de-assign/mid-changeover). Shared frontend `assertNoDuplicatePanels` + `usePanelDuplicateGuard`; backend mirror `assertPanelNameUniqueForWrite` / `assertPatchPanelNameAllowed` in `panel-duplicate.helper.ts` returns **409 Conflict** on guarded writes. `DuplicatePanelWarning` shows standard resolution copy with rename / select-existing panel actions.
- **Files:** `panelDuplicates.ts`, `usePanelDuplicateGuard.ts`, `DuplicatePanelWarning.tsx`, `UploadViewChooser.tsx`, `ProjectsTab.tsx`, `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `TechnicianWorkflowModal.tsx`, `panel-duplicate.helper.ts`, `upload.service.ts`, `upload.controller.ts`, `frames.service.ts`, `wiring-document.service.ts`, `supervisor.service.ts`, `tech.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — Refactor — Wiring & Drawing popup unified View/Replace

- **Summary:** Unified **Wiring Upload** and **Drawing** popups with single resolved state on open (`loading` → `empty` | `populated` | `replacing`). Populated panels auto-open **FileViewer** (SheetJS Excel table, pdf.js PDF, image zoom/pan, DWG download-only) plus **PanelFileMetadataBar** and footer **Replace Upload**. Removed choose-phase / extra View buttons on Projects toolbar. Duplicate panel tags: warn + confirm (`duplicatePanelUploadConfirm`), reports still gated via `reportGated`.
- **New dependency:** `xlsx` (SheetJS) for client-side wiring schedule preview.
- **Files:** `FileViewer.tsx`, `PanelFileMetadataBar.tsx`, `panelFilePopup.ts`, `FramesTab.tsx` (`UploadFrameModal`), `PdfDrawingUploadModal.tsx`, `PdfDocumentViewer.tsx` (Ctrl+wheel zoom), `panelDuplicates.ts`, `usePanelDuplicateGuard.ts`, `ProjectsTab.tsx`, `design-system.css`, `package.json`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; backend untouched.

---

## 2026-07-08 — Spec — Wiring & Drawing module compliance (`DWES_Wiring_Drawing_Module_Spec.md`)

- **Summary:** Gap pass against authoritative Desktop spec: unified **panel-file popup** pattern (`panelFilePopup.ts`, `FileViewer`, `PanelFileMetadataBar`) for wiring + drawing; **internal panel ID** in `UploadTargetHeader` and viewer `panelLabel`; **State B metadata** (file, type, uploaded, size); **duplicate-name confirmation** (not hard block) for upload/replace via `duplicatePanelUploadConfirm`; **post-replace refresh** stays in populated viewer state; Projects tab allows wiring/drawing when duplicate names exist (reports still blocked). Wiring view uses `GET /supervisor/wiring-schedule/:code/:frameId/xlsx` + `FileViewer` excel mode.
- **Files:** `panelFilePopup.ts`, `FileViewer.tsx`, `PanelFileMetadataBar.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `PdfDrawingUploadModal.tsx`, `UploadTargetHeader.tsx`, `UploadViewChooser.tsx`, `DuplicatePanelWarning.tsx`, `panelDuplicates.ts`, `ProjectsTab.tsx`, `ProjectPanelSelect.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Flags:** Drawings remain **project-scoped** in backend (`MockStore.drawings` per `project_code`) — UI is panel-gated but file detection is project-wide; PNG/JPG/SVG drawing upload not in picker (PDF/DWG only). `uploadedBy` metadata not stored server-side (shows `—`). Populated state opens viewer directly with **Replace** in footer (equivalent to spec State B).
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — Fix — Duplicate panel delete propagation

- **Summary:** Deleting a panel from Supervisor Projects now fully removes it from MockStore, disk frame files, and related DB rows (`panel_inspections` → `tech_assignments` → `tech_audit_log`). Frontend immediately updates panel lists, clears selection when the deleted panel was active, and recomputes duplicate-name warnings without manual refresh. `dwes:frames-changed` event propagates removal to Status workspace, Frames tab, and Technician dashboard.
- **Root cause:** `deleteFrameGuarded` archived and removed frame files but left `tech_assignments` and dependent rows in WiringSchemeDB; `ReviewApprovalWorkspace` loaded frames only on mount; `reloadProjectPanels(false)` skipped selection validation so stale panel IDs could linger briefly.
- **Files:** `frames.service.ts`, `projectFramesEvents.ts` (new), `ProjectsTab.tsx`, `ReviewApprovalWorkspace.tsx`, `FramesTab.tsx`, `TechnicianDashboard.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0; delete one of two duplicate panels → warning clears, dropdown/card/Status tab update without page reload.

---

## 2026-07-08 — Feature — Replace upload guards (wiring + drawing)

- **Summary:** **Replace Upload** now requires an explicit confirmation before overwrite. Wiring replace checks `supervisorApi.frameProgress` and warns when technician execution progress exists; both wiring and drawing archive existing files to `uploads/backups/` (`FRAME_REPLACE_*`, `DRAWING_REPLACE_*`) before overwrite. Drawing upload accepts optional `replace_drawing_id` to swap the prior file instead of accumulating duplicates.
- **Files:** `FramesTab.tsx` (`UploadFrameModal`), `PdfDrawingUploadModal.tsx`, `UploadViewChooser.tsx`, `frame-store.ts`, `upload.service.ts`, `upload.controller.ts`, `ReviewApprovalWorkspace.tsx` (TS fix), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Flags:** Replace is **allowed** with elevated confirmation when execution progress exists (not blocked). Table “zoom” = full-view + responsive layout (no literal cell zoom). PDF viewer reuses existing `PdfDocumentViewer` (pdf.js).
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — Feature — Supervisor Upload+View merged modals

- **Summary:** Removed separate **View Wiring** toolbar button. **Wiring Upload** (`UploadFrameModal`) and **Drawing** (`PdfDrawingUploadModal`) now open with a **View schedule / View drawing** vs **Replace upload** choice when an existing file is detected. Wiring viewer reuses `WiringScheduleMappingGrid` read-only fullview (search, zoom, full screen); data from `GET /projects/:code/frames/:id/verify-data`. Drawing viewer uses `PdfDocumentViewer` for PDF; DWG is download-only (matches Drawings tab). New shared `UploadViewChooser` + `wiringScheduleView.ts` helpers.
- **Upload detection:** Wiring — `existingCableCount > 0` on selected panel (from `projectsApi.frames`). Drawing — latest project drawing matching file type via `projectsApi.drawings` (`.pdf` / `.dwg`).
- **Files:** `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `ProjectsTab.tsx`, `UploadViewChooser.tsx` (new), `wiringScheduleView.ts` (new), `design-system.css`, `ViewWiringScheduleModal.tsx` (removed), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` → Projects — panel with schedule → **Wiring Upload** shows View/Replace; panel with PDF → **Drawing** → PDF shows inline viewer; DWG shows download message.

---

## 2026-07-08 — Fix — Status workspace live data refresh

- **Summary:** Status tab now always reflects live DB/API state — no stale projects, frames, assignments, KPIs, or review status. Unified `loadWorkspaceData()` fetches projects + all frames + `supervisorApi.allPanels()` together. Polls every **12s** via `useReadOnlyPoll` (pauses when tab hidden; refetches on `visibilitychange` + window `focus`). Refetches when Status tab becomes active (`isActive` prop); Status section stays mounted (hidden) so cross-tab `dwes:frames-changed` events update in background. Manual Refresh reloads full workspace. Panel column uses `compactPanelDisplayName` (matches Projects dropdown). Projects/Technician Workflow emit `emitFramesChanged` on create/delete/upload/assign/deassign/changeover.
- **Root cause:** Projects + frames loaded once on mount only; assignments polled separately every 12s without visibility/focus guards; Refresh button only re-fetched assignments; long panel reference titles shown verbatim in Status table.
- **Files:** `ReviewApprovalWorkspace.tsx`, `ReviewApprovalSection.tsx`, `SupervisorDashboard.tsx`, `useReadOnlyPoll.ts`, `ProjectsTab.tsx`, `TechnicianWorkflowModal.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` → Projects — delete panel → Status tab shows updated panel count immediately; stay on Status — KPI/progress updates within 12s; panel names show compact `=H001` labels with full title on hover.

---

## 2026-07-08 — Feature — Supervisor View Wiring schedule (superseded)

- **Summary:** ~~Added **View Wiring** button~~ — superseded by merged Upload+View modals above.
- **Files:** `ViewWiringScheduleModal.tsx` (removed), `WiringScheduleMappingGrid.tsx` (`readOnly` prop), `ProjectsTab.tsx`, `design-system.css`
- **Restore point:** Dirty `main` (no commit)

---

## 2026-07-08 — Fix — Excel Wiring Upload parses all worksheet rows

- **Summary:** Per `dwes_fix_excel_parse_all_rows.md`: Excel wiring upload now reads **all** data rows from the selected sheet for Full View, preview chips, and import — not a 3-row sample. Fixed off-by-one that dropped S.NO 1 (first data row misclassified as sub-header). `readHeaders` returns full worksheet data (up to 10k rows) plus `data_row_count`; length values preserve unit suffix (`2.5m`); whitespace trimmed on cells; string terminals preserved.
- **Root cause:** Two stacked defects — (1) `readHeaders` originally used `rows.slice(dataStart, dataStart + 3)` (only 3 preview rows); source had been partially updated to 5000 but `dataStartRow()` still used a brittle digit heuristic that treated the first real data row (S.NO `1`) as a wire-spec sub-header, skipping it; (2) Full View correctly rendered whatever `sample_rows` contained — the bug was upstream in parsing, not rendering.
- **Persistence:** `uploadMapped` / `parseWiringSheet` share the same `dataStartRow` fix — import writes full `cables[]` to frame JSON via `FrameStore.save` (unchanged path; now receives all rows).
- **Files:** `excel-headers.ts` (`isSubHeaderRow`, aligned `dataStartRow`), `upload.service.ts`, `parse-wiring.ts` (`normalizeLength`), `FramesTab.tsx`, `backend/scripts/verify-excel-parse.mjs`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0; `node backend/scripts/verify-excel-parse.mjs` → 400 rows, S.NO 1–400; manual: upload `_H00+R.xlsx` → badge **400 rows**, Full View scrolls S.NO 1–400, Validate & Import → panel holds 400 cables.
- **Flagged (not changed):** Full View renders all rows in DOM (no virtualization) — acceptable for ~400–650 rows; flag if larger schedules stutter. Validation issue row indices may diverge from grid when parse drops empty rows (pre-existing).

---

## 2026-07-08 — Fix — Project Report pdf.js inline renderer

- **Summary:** Replaced iframe+blob URL approach (still showed Chromium "Open" placeholder) with internal **pdf.js** canvas renderer. PDF bytes are fetched via authenticated axios blob, loaded as `ArrayBuffer`, and all pages render to stacked canvases inside `PdfDocumentViewer`. Toolbar controls (zoom, fit width/page, page nav, search, fullscreen, download) are wired to the renderer. Inline **Retry** on fetch/render failure; no external Open button or window.
- **Root cause:** Prior fix (`asPdfBlob()` + iframe `blob:` URL + PDF hash fragments) cannot embed PDFs inline in Chromium/Edge — the browser shows its built-in blob placeholder (PDF icon, UUID, blue Open button) instead of rendering pages inside an iframe. MIME normalization alone does not fix this. Backend `Content-Disposition: attachment` is irrelevant once bytes are fetched client-side.
- **Dependency:** `pdfjs-dist@4.10.38`; worker via `pdf.worker.min.mjs?url` (Vite bundles worker chunk).
- **Files:** `PdfDocumentViewer.tsx`, `ProjectPdfPreviewModal.tsx`, `design-system.css`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` → Status → Project Report — actual PDF pages inline; no Open-button placeholder.
- **Flagged (not changed):** Backend report endpoints still send `Content-Disposition: attachment` (harmless for pdf.js fetch); search jumps to matching page but does not highlight text spans.

---

## 2026-07-08 — Fix — Supervisor Projects Active Panel dropdown

- **Summary:** Active Panel dropdown on Supervisor Projects tab now shows only compact panel tags (`=H001`, `=E01`) for the selected project — no combined project–panel reference titles. Dedupes frames that share the same compact name (prefers wired frame / shortest stored name). Duplicate detection uses compact keys so `=H001` vs a long legacy title is flagged. Wiring upload no longer overwrites `=`-prefixed panel names with `project.name`.
- **Root cause:** Dropdown rendered raw `panel_name`; wiring upload replaced `=H001`-style names with the full project reference title when `panelName.startsWith('=')`.
- **Files:** `projectDisplay.ts`, `panelDuplicates.ts`, `ProjectsTab.tsx`, `DuplicatePanelWarning.tsx`, `upload.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` → Projects — panel dropdown shows `=H001` / `=E01` only; changes when project changes.

---

## 2026-07-08 — UI — Project Report inline PDF viewer

- **Summary:** Replaced broken Project Report preview UX (browser blob fallback with PDF icon, UUID, and external **Open** button) with an embedded authenticated PDF viewer inside `ProjectPdfPreviewModal`. JWT blob fetch is normalized to `application/pdf`, rendered in an iframe with Chrome PDF view hashes, and wrapped in a DWES toolbar (zoom, fit width/page, page nav, search hint, fullscreen, download). Modal opens in fullscreen by default with compact/expand toggle and footer download preserved.
- **Root cause (superseded):** Blob URLs created without an explicit PDF MIME type caused Chromium to show the generic download/open placeholder instead of inline rendering. **Superseded by pdf.js fix above** — iframe+blob cannot embed inline in Chromium regardless of MIME type.
- **Files:** `PdfDocumentViewer.tsx` (new), `ProjectPdfPreviewModal.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` → Status → Project Report — PDF visible inline; zoom/fullscreen/download work; no Open-button placeholder.

---

## 2026-07-08 — Fix — Excel Wiring Upload full-view rendering

- **Summary:** Per `dwes_debug_fullview_render.md`: fixed Full View grid not filling the modal viewport (blank/clipped data rows, broken scroll). Root cause was a broken flex height chain — nested stacked fullscreen `Modal` plus `height: 0` / `flex: 1 1 auto` on `.wu-grid-wrap--fullview` collapsed the scroll container. Full View now swaps content inside the existing upload modal (no nested modal); scroll area uses `flex: 1 1 0%`; `modal-box-fullscreen .modal-body` gets `flex-1`; fullview table uses `table-layout: auto` (was conflicting with `width: max-content`). Sticky header / frozen `#` column backgrounds reinforced for fullview rows.
- **Files:** `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Flagged (not changed):** Row count in chips reflects `sample_rows` from `readHeaders` (up to 5000 data rows per sheet) — if a file shows fewer rows than expected, verify Excel sheet content / header detection before changing parser logic. Import/persistence unchanged.
- **Verify:** `/supervisor` → Excel Wiring Upload → mapping → **Full view**: grid fills viewport, all rows scroll vertically, columns scroll horizontally, sticky headers + frozen `#` column work, mapping dropdowns/checkboxes/search respond, **Exit full view** returns to inline mapping; `npm run build` exit 0.

---

## 2026-07-08 — QA — Stabilization pass (verify · debug · test · harden)

- **Summary:** Per `dwes_stabilization_verify_debug_test_harden.md`: Phase 0–7 inventory and health check across DWES after recent UI/report/modal changes. Frontend `npm run build` + `npm run lint` and backend `npm run build` all exit 0. Panel completion report PDF on rebuilt backend is ~66 KB standalone (no GA appendix); stale `:3001` dev process still served pre-refactor ~15 MB wiring+GA PDF and returned 404 for `completion-report`. Meta overlap fixed in source (`drawMetaGrid` / `.pcr-meta-grid`). Security findings triaged (report-only). Corrected stale JSDoc on `frames/:id/report-pdf`.
- **Files:** `backend/src/frames/frames.controller.ts` (comment), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Manual:** Restart `npm run dev:all`; browser smoke-test `/`, `/technician`, `/supervisor`; confirm GA merge policy; triage Phase 6 security list.

---

## 2026-07-08 — Brand — App icon matched to canonical Ingenious logo

- **Summary:** Per `dwes_app_icon_brand_match.md`, regenerated the full app icon set from the canonical Ingenious Network globe mark (`src/assets/logo-icon.svg` / `public/logo.svg`) instead of the abstract blue-tile wiring motif. White rounded tile matches `CompanyLogo` topbar pill; exact logo colors (`#2E9DAA`, `#6DCFD4`, `#1B2958`, etc.). Updated `index.html` (SVG favicon + `favicon.ico` fallback, 180×180 Apple touch icon), `manifest.webmanifest` theme/background (`#1B2958` / `#FFFFFF`), and extended `generate-app-icons.mjs` to emit `favicon.ico` and `apple-touch-icon.png`.
- **Files:** `public/app-icon.svg`, `public/favicon.svg`, `public/favicon.ico`, `public/app-icon.ico`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/apple-touch-icon.png`, `scripts/generate-app-icons.mjs`, `index.html`, `public/manifest.webmanifest`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Delivery path:** PWA (`manifest.webmanifest`) + browser favicon + Windows desktop shortcut (`app-icon.ico` via `npm run shortcut:create`). No Electron packager.
- **Flag:** `logo-full.png` referenced by `CompanyLogo` is not present under `public/` (SVG source exists). Existing desktop shortcuts / installed PWAs cache the old icon — reinstall PWA or re-create shortcut to refresh.
- **Verify:** `npm run icons:generate` + `npm run build` exit 0.

---

## 2026-07-08 — UI — Global popup/modal shell redesign

- **Summary:** App-wide modal modernization per `dwes_global_popup_modal_redesign.md` (Path A — shared `Modal` primitive). Unified backdrop (`rgba(0,0,0,0.45)` + blur), 16px-radius elevated surface, width ladder (sm 420 / md 560 / lg 720 / xl 900), 90vh max-height with pinned header/footer, bold title + optional subtitle, 44px close control, fade+scale entry (`prefers-reduced-motion` safe). `PauseReasonModal` migrated onto shared shell; Technician Workflow narrowed to `lg` with panel context subtitle. High-contrast segmented tabs, status pills, and warning banners refreshed in workflow/pause content styles. `AppDialogProvider` confirm/alert icons use tokened `.dlg-icon-wrap`.
- **Files:** `Modal.tsx`, `AppDialogProvider.tsx`, `PauseReasonModal.tsx`, `TechnicianWorkflowModal.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Breaking:** None — all `Modal` props preserved; optional `subtitle` added. Technician Workflow `size` changed `team` → `lg` (appearance only).
- **Verify:** `npm run build` exit 0; smoke-test Technician Workflow (3 tabs), Pause reason popup, one confirm/delete via `useAppDialog`.

---

## 2026-07-08 — Report — Project Completion Report spec alignment (panel PDF + preview)

- **Summary:** Aligned panel **Project Completion Report** with `dwes_project_completion_report_redesign.md`: PDF zones reordered (header → meta grid → personnel → KPI centerpiece → timeline → remarks → sign-off → footer); fixed overlapping meta layout via proper two-column grid; mid-change technician block only when reassignment exists; Frame ID in header ref; login/logout times from `session_log`; footer with confidential note, generated timestamp, and page number. Added `GET /projects/:code/frames/:id/completion-report` JSON endpoint. On-screen preview (`ReportPreviewModal`) now renders matching executive layout via `PanelCompletionReportPreview` with PDF + XLSX export. Detailed per-cable XLSX export unchanged.
- **Files:** `panel-completion-report-pdf.ts`, `panel-completion-report.helper.ts`, `wiring-document.service.ts`, `frames.controller.ts`, `PanelCompletionReportPreview.tsx`, `ReportPreviewModal.tsx`, `api.ts`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Missing data (placeholders when absent):** Region/location (no `@dwes-meta`), technician login/logout (`session_log` empty), client representative name (signature line blank by design), supervisor/technician remarks when none recorded.
- **Flag:** Project-level PDF (`/projects/:code/report-pdf` without frame) remains the separate multi-panel `report-pdf.ts` dossier.
- **Verify:** Restart backend; `/supervisor` → Status → panel report preview; Projects → Reports → PDF; `npm run build` + `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — UI — Excel Wiring Upload full-view Excel-like redesign

- **Summary:** Redesigned the wiring schedule **Full view** overlay for a true Excel-like review experience: grid fills the fullscreen modal (`flex-1` + `height: 0` scroll container), `variant="fullview"` on `WiringScheduleMappingGrid` with `width: max-content` table layout so all columns render, removed inline `max-width` truncation in full view, sticky checkbox/header/mapping rows on vertical scroll, frozen `#` index column with freeze-edge shadow on horizontal scroll, drag-to-resize column handles (pointer events, session-persisted `columnWidths` in `UploadFrameModal`), compact toolbar/banner. Inline mapping grid unchanged (`variant` default `inline`).
- **Files:** `WiringScheduleMappingGrid.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Excel Wiring Upload → mapping → **Full view**: scroll all rows/columns, headers stay pinned, `#` column frozen, drag column borders to resize; `npm run build` exit 0.

---

## 2026-07-08 — Brand — Premium desktop app icon redesign

- **Summary:** Redesigned `public/app-icon.svg` for enterprise-grade Windows/PWA use: brand-blue tile gradient (`#1B4FD8` → deep navy), refined specular depth, rim-light border, and bolder teal wiring mark (orbit + cable pair + junction hub) optimized for 16–256 px legibility. Aligned `public/favicon.svg` to the same mark. Regenerated `app-icon.ico` and PWA PNGs via `npm run icons:generate`; maskable safe-zone background updated to brand blue.
- **Files:** `public/app-icon.svg`, `public/favicon.svg`, `public/app-icon.ico`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `scripts/generate-app-icons.mjs`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run icons:generate` + `npm run build` exit 0; icon reads as blue tile with teal diagonal at 16 px, full wiring detail at 256 px.

---

## 2026-07-08 — UI — Excel Wiring Upload full view + hidden column filter

- **Summary:** Excel Wiring Upload mapping step: column filter dropdown hidden from toolbar (`.wu-filter--hidden`; `columnFilter` state and grid logic unchanged, default `'all'`). Added **Full view** toolbar button (`Maximize` icon) opening a stacked fullscreen `Modal` with the same `WiringScheduleMappingGrid` props, minimal bar (sheet/row/column chips, search, **Exit full view**), validation banner when preview exists, and sticky worksheet grid for maximum review area.
- **Files:** `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects → Excel Wiring Upload → mapping step: no filter dropdown; Full view opens overlay; mapping/checkboxes sync; `npm run build` exit 0.

---

## 2026-07-08 — UI — Supervisor Projects toolbar shorter action labels

- **Summary:** Shortened Supervisor Projects tab action toolbar button labels for a more compact toolbar: **Wiring Upload**, **Workflow**, **Drawing**, **Reports**, **Users** (unchanged: **New Project**). Icons, classes (`pj-btn-primary pj-action-btn`), gating, and handlers unchanged; tooltips updated where they referenced old names.
- **Files:** `ProjectsTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects tab toolbar shows new labels; `npm run build` exit 0.

---

## 2026-07-08 — UI — Workspace shell & design-system modernization

- **Summary:** Modernized workspace navigation and content area via design tokens and shared CSS: larger bolder typography (nav ~15px semibold, page titles ~26px, section headers ~18–22px), dark slate text (#0F172A primary, #334155 secondary), premium gradient active nav pill + left accent, refined cards (12px radius, #CBD5E1 border, soft shadow), dashboard hero gradient top band, stronger app-section headers and Projects tab info labels/values. No business-logic or API changes.
- **Files:** `tokens.css`, `theme-palettes.css`, `index.css`, `design-system.css`, `tabs.css`, `themes.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run build` exit 0; smoke-test `/`, `/supervisor`, `/technician` — `#root` renders with updated nav typography and card surfaces.

---

## 2026-07-08 — UI — Excel Wiring Upload unified design system

- **Summary:** Rebuilt the entire **Excel Wiring Upload** mapping popup under a single `.wu-*` design language aligned with DWES form inputs, chips, and upload headers. Replaced inconsistent controls with unified toolbar (search + filter), KPI chips, validation banner, field legend chips, custom 16px checkboxes (fixes global 44px touch-target blowout), sticky worksheet grid with column-state colors, and compact mapping selects. High-contrast light theme throughout.
- **Files:** `WiringScheduleMappingGrid.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects → Excel Wiring Upload → mapping step; consistent styling across checkboxes, filters, chips, grid, footer; `npm run build` exit 0.

---

## 2026-07-08 — UI — Excel Wiring Upload compact column selection + contrast

- **Summary:** Redesigned **Excel Wiring Upload** column selection: removed bulky card grid; compact per-column checkboxes now sit directly above each Excel header in the worksheet grid, with a master **Select All** checkbox in the row-index column. Column filter dropdown: **All**, **Selected**, **Required**, **Unselected**. Higher-contrast light theme — darker text, 2px borders, color-coded column states (selected/mapped, required, unselected, idle), stronger checkboxes and mapping selects for tablet/laptop review sessions.
- **Files:** `WiringScheduleMappingGrid.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects → Excel Wiring Upload → mapping step: inline checkboxes, master select, column filters, contrast; `npm run build` exit 0.

---

## 2026-07-08 — UI — Technician Workflow dashboard-scoped selection

- **Summary:** **Technician Workflow** now follows the same project + panel gating as Excel Wiring Upload, Drawing Upload, and Report: supervisor selects project and panel on the Projects tab first; the toolbar button stays disabled until both are selected. The modal no longer includes Project/Panel dropdowns — it inherits the dashboard selection and shows a compact context card with status badge (Unassigned, Assigned, In Progress, Paused, Completed, Changeover Eligible), assigned technician, cable count, and KPI chips. Workflow tabs remain **Assign**, **De-assign**, and **Mid Changeover** only.
- **Files:** `TechnicianWorkflowModal.tsx`, `ProjectsTab.tsx`, `SupervisorDashboard.tsx`, `SupervisorAlertStrips.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects → select project + panel → Technician Workflow enabled; modal shows context card without dropdowns; `npm run build` exit 0.

---

## 2026-07-08 — UI — Status workspace collapsible project cards

- **Summary:** Redesigned supervisor **Status** workspace for scale: compact collapsible project cards with KPI chips in the header, expandable panel grids (status, technician, progress, review/QC, icon actions), scrollable panel area for large projects, dedicated **Project Report** section per card, Expand/Collapse all controls.
- **Files:** `ReviewApprovalWorkspace.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Status → collapse/expand projects; panel actions and project report; `npm run build` exit 0.

---

## 2026-07-08 — UI — User Management premium redesign

- **Summary:** Rebuilt supervisor **User Management** modal: removed horizontal-scrolling table in favor of responsive card grid with summary chips and prominent **Edit User** actions. **Edit User** popup reorganized into section cards (User Details, Credentials, Panel Assignment, Account Status, Delete) with compact spacing, badges, and tablet/laptop-friendly layout.
- **Files:** `UsersTab.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → User Management → card grid, edit flow, password reset, panel assign/remove; `npm run build` exit 0.

---

## 2026-07-08 — UI — Technician Workflow simplification + Status tab

- **Summary:** Removed separate **Panel Verification** from supervisor assignment flows. Excel wiring upload now auto-validates frames on import (`compare_status: validated`). **Technician Workflow** redesigned as a compact premium modal with **Assign**, **De-assign**, and **Mid Changeover** only. Renamed **Review & Approval** sidebar tab to **Status**.
- **Files:** `TechnicianWorkflowModal.tsx`, `AssignTechnicianModal.tsx`, `FramesTab.tsx`, `SupervisorDashboard.tsx`, `ReviewApprovalSection.tsx`, `SupervisorAlertStrips.tsx`, `upload.service.ts`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Upload schedule → assign without verify step; `/supervisor` → **Status** tab; Technician Workflow three segments; `npm run build` exit 0.

---

## 2026-07-08 — UI — Review & Approval unified workspace

- **Summary:** Removed **Overall Panel Status** sidebar tab. **Review & Approval** is now the single centralized supervisor workspace: all projects with full display titles and nested panel/subpanel rows in modern cards, live execution status (12s poll), wiring progress, legacy assignment approval, supervisor review (approve / QA-QC / rework), per-panel completion report preview, read-only **Project Report** PDF popup, and **Submit to Director** when all completed panels are approved. Added `projectsApi.submitToDirector`.
- **Files:** `ReviewApprovalWorkspace.tsx`, `ProjectPdfPreviewModal.tsx`, `ReviewApprovalSection.tsx`, `SupervisorDashboard.tsx`, `api.ts`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Review & Approval only (no Panel Status tab); project cards show panels with actions; Project Report PDF popup; `npm run build` exit 0.

---

## 2026-07-08 — UI — Technician Workflow consolidated modal

- **Summary:** Assignment, de-assignment, and mid-changeover are unified in a **Technician Workflow** button on the Projects toolbar (next to Excel Wiring Upload). Wide modal with Assign / Active / Changeover sections; verify-before-assign, assignment cards with remove, and inline changeover form. Removed **Assignments** and **Mid-Changeover** from supervisor sidebar navigation.
- **Files:** `TechnicianWorkflowModal.tsx`, `SupervisorDashboard.tsx`, `ProjectsTab.tsx`, `SupervisorAlertStrips.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects → Technician Workflow; alert strip opens changeover section; sidebar no longer shows Assignments / Mid-Changeover.

---

## 2026-07-08 — UI — Excel Wiring Upload full-screen worksheet grid

- **Summary:** Redesigned supervisor Excel Wiring Upload mapping step as a **full-screen Excel-like workspace**: complete worksheet rows (up to 5000), sticky dual-row headers (column name + mapping dropdown), sticky row index, search, column/row filters, validation highlighting in-grid, unified validate + import flow. Removed separate checkbox strip and validate step — mapping dropdowns are the column selection UI.
- **Files:** `WiringScheduleMappingGrid.tsx`, `wiringSystemFields.ts`, `FramesTab.tsx`, `Modal.tsx`, `design-system.css`, `upload.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Supervisor → Projects → Excel Wiring Upload → full worksheet grid, map columns, Validate & Import; `npm run build` exit 0.

---

## 2026-07-08 — Report — Project Completion PDF executive redesign

- **Summary:** Panel completion report PDF rebuilt as a **single-page** portrait A4 executive layout: navy header with DWES logo, status badge, KPI summary cards, completion progress bar, two-column project/personnel and wiring/timeline sections, compact remarks, three-column approval sign-off, and confidential footer. Uses `@dwes-meta` location/month when present; voltage from frame or project code. Post-process trims accidental overflow pages via pdf-lib.
- **Files:** `panel-completion-report-pdf.ts`, `panel-completion-report.helper.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Restart backend (`npm run backend` or `dev:all`), supervisor Projects → Report PDF → one page, print-ready; `npm --prefix backend run build` exit 0.

---

## 2026-07-08 — Fix — Panel report download filename (Windows-safe)

- **Summary:** Report PDF/Excel filenames use `Report_<ProjectCode>_<Panel>.ext` instead of the long legacy project title. Sanitizer strips `&`, `=`, en-dashes, collapses underscores, and avoids duplicate panel segments. Applied on supervisor download, backend PDF generation, and Excel export.
- **Files:** `reportFilename.ts`, `report-filename.ts`, `ProjectsTab.tsx`, `wiring-document.service.ts`, `supervisor.controller.ts`, `ReportPreviewModal.tsx`, `CHANGELOG.md`
- **Example:** `Report_132KV33KV_KSA_RIYADH_2026_001_H001.pdf`

---

## 2026-07-08 — UI — Project Information Card structured layout

- **Summary:** Info card shows labeled fields (Substation, Client, Location/Region, Month/Year, Project code, Numbering, Status, Panels) instead of one long dash-separated title. Client shown once. New projects store substation name in `name` and location/month in encoded `description` metadata. Legacy long titles parsed for display. Project auto-selected after create. Dropdown uses short `Substation · Client` label.
- **Files:** `ProjectsTab.tsx`, `projectDisplay.ts`, `design-system.css`, `CHANGELOG.md`
- **Verify:** Create project → card populates immediately with clean fields; legacy projects still readable.

---

## 2026-07-08 — UI — Per-panel metadata on create, add panel, info card

- **Summary:** New Project form captures **Panel name**, **Panel type**, **Voltage level**, and **System type** separately for each panel (stored per frame). Project code uses panel 1 voltage. **Add Panel** on project info card + `POST /api/projects/:code/frames`. Info card shows selected panel metadata from stored values; voltage falls back to project code segment for legacy panels only when frame field is empty.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `api.ts`, `frames.controller.ts`, `frames.service.ts`, `projects.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Create project with 2 panels (different voltages) → select each panel → info card updates; Add Panel on existing project; `npm run build` exit 0.

---

## 2026-07-08 — Fix — Supervisor panel list loading race

- **Summary:** Selecting Active project now sets `loadingPanels` synchronously and clears stale panel list, preventing a one-frame flash of "No Panels Available" before frames API returns. Session auto-restore uses the same pattern; clearing project selection resets loading state.
- **Files:** `ProjectsTab.tsx`, `CHANGELOG.md`
- **Verify:** `/supervisor` → select project → panel dropdown shows "Loading panels…" then panel names (no false empty state).

---

## 2026-07-08 — UI — New Project popup redesign (supervisor)

- **Summary:** Redesigned supervisor New Project modal: two-column responsive layout (wide modal). Mandatory: Project / Substation Name, Panel Name / Panel Type (single field, allows `=`), Voltage Level. Client beside project name; voltage beside panel field. Combined Location / Region and Month / Year fields. Sequence renamed to Project Numbering. Live preview of auto-generated project name (`Name – Client – Panel – Voltage – Location / Region – Month / Year`) stored on create.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects → New Project; fill fields; preview updates; create succeeds; `npm run build` exit 0.

---

## 2026-07-08 — Branding — Desktop icon (premium compact mark)

- **Summary:** Redesigned `app-icon.svg` for Windows desktop: navy gradient tile (`#1B2958` / `#0F2557`), bold teal wiring mark (single orbit + two cable strokes + hub) aligned with Ingenious Network / report branding. Removed fine triple-orbit lines for legibility at 16–48 px. Regenerated `app-icon.ico` and PWA PNGs; ICO pad color updated to `#1B2958`.
- **Files:** `public/app-icon.svg`, `scripts/generate-app-icons.mjs`, `public/app-icon.ico`, `public/icons/*.png`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run icons:generate`; `npm run build` exit 0. Refresh desktop shortcut: `powershell -File scripts/fix-desktop-shortcut.ps1` (or F5 desktop / re-pin).

---

## 2026-07-08 — UI — Projects single info card (panel-scoped metadata)

- **Summary:** Supervisor Projects tab shows one project information card below action buttons. Removed duplicate identity bar and panel table. Card highlights active project name, then panel name/type and per-panel voltage level / system type for the selected panel. Edit/Delete target selected panel (or project when no panel). Panel metadata stored on frames (`voltage_level`, `system_type`) with extended patch-panel API.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `mock-store.ts`, `projects.service.ts`, `frames.service.ts`, `frames.controller.ts`, `upload.service.ts`, `api.ts`, `ProjectPanelSelect.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → Projects; select project + panel; single card shows all fields; `npm run build` exit 0.

---

## 2026-07-08 — UI — Projects panel list identity + empty state

- **Summary:** Panel list shows full created project name and selected panel/subpanel in identity bar and table columns. High-contrast blue `Selected` badge. Empty project panels show "No Panels Available" (project remains). Panel delete confirms it removes only the panel, not the project.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `CHANGELOG.md`

---

## 2026-07-08 — UI — User Management table column balance

- **Summary:** Tighter team-mgmt table: Panel column 16% (was 24%), Name 44%, reduced cell padding, w-fit panel badges, wider modal (1080px / 96vw) to use available width without Panel–Edit gap.
- **Files:** `UsersTab.tsx`, `design-system.css`, `CHANGELOG.md`

---

## 2026-07-08 — FEAT — Panel Project Completion Report (live PDF)

- **Summary:** Supervisor panel PDF export (`/frames/:id/report-pdf`) now generates a **Project Completion Report** from live DWES data (assignments, cable progress, sessions, rework) instead of the wiring schedule document. Status logic: Not Assigned, Not Started, In Progress, On Hold, Completed. Includes KPI cards, execution metadata, login/logout log, remarks, and sign-off. Matches `Prompt.md` spec.
- **Files:** `panel-completion-report.helper.ts`, `panel-completion-report-pdf.ts`, `wiring-document.service.ts`, `frames.controller.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Restart backend → Supervisor → Projects → select project + panel → Report → PDF; filename `Report_<Project>_<Panel>.pdf`.

---

## 2026-07-08 — UI — User Management table + unified Edit popup

- **Summary:** User list table uses tighter column balance (Panel 24%, Edit 8%); single icon Edit per row (Delete removed from list). Edit opens comprehensive **User Management** popup: profile + username, panel assign/change, activate/deactivate, password reset, and delete user. Supervisors can update technician usernames via API.
- **Files:** `UsersTab.tsx`, `design-system.css`, `users.service.ts`, `users-rbac.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` → User Management; balanced columns; Edit opens full management modal; `npm run build` exit 0.

---

## 2026-07-08 — UI — User Management modal responsive redesign

- **Summary:** Team Management modal uses `team` size (up to 1024px), inherits base modal flex/overflow layout, fixed-layout table with percentage-only column widths (no horizontal scroll), single vertical scroll region, compact badges and icon action buttons (labels on wide screens). Edit + Delete (deactivate) always visible in Actions column on tablet/laptop. Card layout on narrow phones.
- **Files:** `UsersTab.tsx`, `Modal.tsx`, `design-system.css`, `CHANGELOG.md`
- **Verify:** `/supervisor` → Projects → User Management; all columns visible on laptop/tablet; `npm run build` exit 0.

---

## 2026-07-08 — FEAT — Projects panel list, duplicate guard, upload headers

- **Summary:** Panel dropdown lists only the selected project's panels (name only). Dedicated panel/subpanel table below action buttons with Edit/Delete. Duplicate names highlighted with warning and upload/report block. Wiring and drawing modals show prominent project + panel identity header.
- **Files:** `ProjectsTab.tsx`, `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `UploadTargetHeader.tsx`, `DuplicatePanelWarning.tsx`, `panelDuplicates.ts`, `design-system.css`, `frames.controller.ts`, `frames.service.ts`, `api.ts`, `CHANGELOG.md`
- **Verify:** `/supervisor` → Projects; `npm run build` exit 0.

---

## 2026-07-08 — FIX — Topbar project/user pill text contrast

- **Summary:** Project code and user full name on light header pills now use dark high-contrast tokens (`--topbar-pill-text` / `--t-header-pill-text` → slate-900) with muted secondary labels; theme overrides added for arctic, aurora, and generic `[data-theme]` so no palette forces light gray on white pills.
- **Files:** `design-system.css`, `themes.css`, `theme-palettes.css`, `aurora.css`, `CHANGELOG.md`
- **Verify:** `npm run build` exit 0; check topbar project pill + user card on `/supervisor`, `/admin`, `/technician`.

---

## 2026-07-08 — FEAT — Supervisor Projects panel selector + DWES icon refresh

- **Summary:** Added Active Panel dropdown beside Active Project on supervisor Projects tab; Excel Wiring Upload, Drawing Upload, and Report stay disabled until both are selected. Reports use panel-scoped PDF/Excel (`reportPdf` + `panelReportXlsx`); wiring upload sends optional `frame_id` to populate the selected panel frame. Redesigned `app-icon.svg` (compact teal orbital mark, high-contrast navy tile) and regenerated `.ico`/PWA PNGs. Supervisor hero subtitle now matches admin/director (`full_name · employee_id`).
- **Files:** `SupervisorDashboard.tsx`, `ProjectsTab.tsx`, `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `design-system.css`, `public/app-icon.svg`, `scripts/generate-app-icons.mjs`, `api.ts`, `upload.controller.ts`, `upload.service.ts`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Verify:** `/supervisor` → Projects — project + panel selectors; gated toolbar; panel report download; hero matches `/admin`. Re-run desktop shortcut script if icon cached. `npm run build` exit 0.

---

## 2026-07-08 — FIX — supervisor Projects action toolbar sizing

- **Summary:** Tightened `.pj-actions-grid` so toolbar buttons stay 40px tall (override `pj-btn-primary` 48px) and use `flex: 0 1 auto` instead of stretching full row width.
- **Files:** `design-system.css`
- **Verify:** `/supervisor` → Projects — compact action row, no ballooning buttons.

---

## 2026-07-08 — FIX — Supervisor hero matches admin/director

- **Summary:** Removed `dashboard-hero--supervisor` dark gradient override; Production Supervisor header now uses the shared default `dashboard-hero` surface (same layout, typography, and contrast as System Administrator and Operations Director).
- **Files:** `SupervisorDashboard.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Verify:** `/supervisor` vs `/admin` vs `/director` — white card hero, dark title, blue badge, readable subtitle.

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

## 2026-07-08 — FIX — Workspace sidebar height (reinforced)

- **Summary:** Replaced unreliable `min-height: 100%` on `.dash-sidebar` with `calc(100dvh - var(--dash-topbar-height))` and matched `.dash-main` min-height so Workspace column and main content stay equal on short and tall project pages.
- **Files:** `src/styles/design-system.css`
- **Verify:** tablet-landscape — `/supervisor` → Projects, `/technician`, `/admin`; sidebar border/background runs full column height beside main content.

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
