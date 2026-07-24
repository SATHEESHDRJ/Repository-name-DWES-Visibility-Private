# DWES Project Status

**Last updated:** 2026-07-24 (Remove panel 3D model feature + Supervisor GA Upload/GA View rename on branch `change/remove-3d-and-rename-ga-2026-07-24` in worktree `DWES-remove-3d-ga`; baseline `9f6a4a4`; FE+BE builds green; backend tests 83/83; deploy blocked — no git `origin`. Dirty Demo Lab worktree preserved on `change/3d-model-demo-lab-2026-07-22`. Earlier — 2026-07-15 Release-readiness / Device Preview / Mid Change notes below.)  
**Repo:** `C:\Users\sathe\OneDrive\Desktop\DWES` (+ clean worktree `DWES-remove-3d-ga`)  
**Detailed history:** `PROGRESS.md` (feature log) · **Change log:** `CHANGELOG.md`

---

## Git / restore points

| Item | State |
|------|--------|
| Repository | Branch `main` (baseline commit `294cc2e`; **no `origin` remote configured yet**) |
| OCI deploy | **Readiness confirmed** — deploy pending credentials; [GO-LIVE-REPORT.md](docs/GO-LIVE-REPORT.md). **Superseded for provider choice** by the 2026-07-13 provider-neutral assessment (OCI signup blocked) — kept as reference implementation |
| Hosting assessment (2026-07-13) | **Complete — approval pending.** [docs/hosting/](docs/hosting/) (15 docs). Recommended: Option C — Cloudflare Pages + Railway (volumes) + Neon PG 18 + R2, ≈ $5–7/mo; Option B = $0 pilot rehearsal. Gate 0 in [FINAL_DEPLOYMENT_CHECKLIST.md](docs/hosting/FINAL_DEPLOYMENT_CHECKLIST.md) |
| Human queue | [docs/HUMAN-ACTIONS.md](docs/HUMAN-ACTIONS.md) (production path) · [docs/CLOUD-ONBOARDING.md](docs/CLOUD-ONBOARDING.md) (dev/demo path — start here for a fresh cloud setup) |
| Go-live command | `npm run go-live:plan` (preview) → `npm run go-live:preflight` → `npm run go-live` |
| Orchestrator | **Hardened 2026-07-10** — secret redaction, origin/gh fail-fast, `--plan-only`, health-gated post-deploy ([CHANGELOG](CHANGELOG.md)) |
| Dev/demo deploy | **Added 2026-07-10** — push-to-main CI/CD to OCI VM `dwes.ingenious-network.com`; native on-VM build, health-gate + auto-rollback ([docs/DEV-DEPLOY.md](docs/DEV-DEPLOY.md)). **Blocked on cloud accounts** (no GitHub `origin`/auth, no OCI VM, DNS still pointing at Turbify cPanel) — see onboarding guide above. |
| Autonomous log | [docs/AUTONOMOUS-SESSION.md](docs/AUTONOMOUS-SESSION.md) |
| Checkpoint | `PREFLIGHT_BLOCKED` — fill secrets in `deploy-secrets.local.env` |
| Decisions log | [docs/DEPLOY-DECISIONS.md](docs/DEPLOY-DECISIONS.md) |

**Launcher restore point (2026-07-09):** Branch `change/production-startup-2026-07-09` (no commit requested).

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
| **Supervisor** — Three-action technician workflow (Assign, pre-start Remove, post-start Mid-Changeover) + green/yellow/blue/red status indicators; backend interlocks and progress/history preservation covered by tests | **DONE** (2026-07-12) |
| **App-wide** — Workspace hero header layout (title/subtitle/badge spacing, no ascender clipping) | **DONE** (2026-07-08) |
| **App-wide** — Liquid Glass design system (selective glassmorphism on shells, cards, modals, forms) | **DONE** (2026-07-08) |
| **App-wide** — Bento Grid layouts (role dashboards, KPI strips, user mgmt, upload sections) | **DONE** (2026-07-08) |
| **App-wide** — Dense data tables/grids exempt from glass blur (wrappers only) | **DONE** (2026-07-08) |
| **App-wide** — Popup typography modernized (medium-weight body + readable `--t-muted` secondary text) on all dialogs except User Management + workspace modals; unlayered rule in `themes.css` | **DONE** (2026-07-11) |
| **App-wide** — Layout stability: viewport-fill is now pure flexbox (removed `calc(100dvh - --dash-topbar-height)` magic numbers); `--dash-topbar-height` measured live by `AppShell` ResizeObserver; mobile drawer offset from the real topbar height. Fixes tablet-portrait topbar-wrap overlap (was 87px) + height mismatch (was 63px). Verified 0 h-overflow / 0 trapped-fixed across roles @1440 & 768 | **DONE** (2026-07-11) |
| **App-wide** — Dashboard data refresh: event-driven (`dwes:frames-changed`, `dwes:workflow-changed`, `dwes:documents-changed`) + 45 s idle poll; no 4 s rogue intervals | **DONE** (2026-07-09) |
| **App-wide** — Project removal uses one permanent-delete workflow across Supervisor and System Admin (single warning + one checkbox + Cancel/Delete Project Permanently) | **DONE** (2026-07-11) |
| **Supervisor** — Delete Panel confirmation modal (unified `DeleteConfirmModal`, checkbox ack, backup-first API) | **DONE** (2026-07-09) |
| **Supervisor** — Remove Project now uses permanent delete only (single warning + checkbox + Cancel/Delete Project Permanently) | **DONE** (2026-07-11) |
| **Supervisor** — Digital Wiring Monitor (fullscreen read-only schedule grid + cable inspector + KPI dashboard) | **DONE** (2026-07-09) |
| **App-wide** — Unified delete confirmation (`DeleteConfirmModal`: impact, scopes, backup status, checkbox; no type-phrase) | **DONE** (2026-07-09) |
| **Admin** — Project deletion now uses the same minimal permanent-delete modal as Supervisor (no precheck matrix/options) | **DONE** (2026-07-11) |
| **Admin** — Hard Reset / Hard Reset DB / Reset All Projects remain phrase-gated exceptions | **DEFERRED** (2026-07-09) |
| **Supervisor** — hero header matches admin/director (default `dashboard-hero`) | **DONE** |
| **Supervisor** — Projects tab View Drawing / Digital Wiring View auto-enable after upload (API-validated, `documents-changed` event) | **DONE** (2026-07-09) |
| **Supervisor** — Projects Active Panel dropdown (compact `=H001` labels only; project-scoped dedupe) | **DONE** |
| **Supervisor** — Duplicate panel delete removes frame + DB refs; auto-refresh all workspaces | **DONE** (2026-07-08) |
| **Supervisor** — wiring upload targets selected panel (`frame_id`) | **DONE** |
| **Supervisor** — Wiring Upload + Drawing modals: View / Replace when file exists (no separate View button) | **DONE** (2026-07-08) |
| **Supervisor** — Unified `FileViewer` (PDF/image/Excel) + metadata bar in upload popups | **DONE** (2026-07-08, spec pass) |
| **Supervisor** — Global duplicate panel name guard (UI + API 409) blocks wiring/drawing/reports/workflow until resolved | **DONE** (2026-07-08; drawing modal + toolbar gating aligned in master verify pass) |
| **Supervisor** — Delete Panel uses unified checkbox confirmation (phrase still sent to guarded API) | **DONE** (2026-07-09) |
| **Supervisor** — Panel ID shown in upload headers + viewer; duplicate-name upload confirm | **SUPERSEDED** — hard block + rename/select resolution (2026-07-08) |
| **Supervisor** — Replace upload: confirm + progress warning + backups before overwrite | **DONE** (2026-07-08) |
| **Supervisor** — Mid-Changeover Availability banner removed from dashboard chrome (workflow modal retained) | **DONE** (2026-07-09) |
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
| **Supervisor** — Technician Workflow modal (assign / deassign / changeover) | **SUPERSEDED** — Smart Assignment Center (2026-07-09) |
| **Supervisor** — Smart Assignment Center (dense MES workspace: KPI strip, assignment board, compact tech cards, Assign Best, filters, auto-next queue, parallel/mid-changeover badges) | **DONE** (2026-07-09) |
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
| **Supervisor** — Status workspace live refresh (12s poll, tab-activate refetch, `dwes:frames-changed`, compact panel names) | **SUPERSEDED** — event-driven `useDwesRefresh` + 45 s idle fallback (2026-07-09) |
| Viewport / shell scroll fixes | **DONE** |
| **Stabilization pass** — frontend + backend production builds | **PASS** (2026-07-08) |
| **Final QA pass (2026-07-09)** — `npm run build` | **PASS** (exit 0, post delete-modal fix) |
| **Final QA pass (2026-07-09)** — SPA route HTTP smoke (`/`, role routes, admin sub-routes) | **PASS** (all 200) |
| **Final QA pass (2026-07-09)** — role JWT login (supervisor, admin, tech, director, qaqc) | **PASS** |
| **Final QA pass (2026-07-09)** — `report-pdf` + `completion-report` + `delete-precheck` + role APIs on `:3001` | **PASS** (PDF ~66 KB; `director/stats`, `tech/my-panels`, `admin/diagnostics`, `qaqc/stats`) |
| **Refresh validation (2026-07-09)** — grep audit (no 3–4 s dashboard polls) | **PASS** |
| **Refresh validation (2026-07-09)** — `useDwesRefresh` on all role dashboards | **PASS** |
| **Refresh validation (2026-07-09)** — missing `emitWorkflowChanged` at assignment paths | **FIXED** (3 files) |
| **Refresh validation (2026-07-09)** — idle poll loading flicker (Projects/QAQC panels) | **FIXED** (silent background reload) |
| **Refresh validation (2026-07-09)** — `npm run build` | **PASS** (exit 0) |
| **Refresh validation (2026-07-09)** — browser idle/event network QA (`cursor-ide-browser`) | **BLOCKED** — MCP tab lost; author DevTools checklist required |
| **Final QA pass (2026-07-09)** — browser visual/modal/viewport QA (`cursor-ide-browser`) | **BLOCKED** — MCP tab lost after create; author manual checklist required |
| **Final QA pass (2026-07-08)** — `npm run build` | **PASS** (exit 0) |
| **Final QA pass** — SPA route HTTP smoke (`/`, role routes, admin sub-routes) | **PASS** (all 200) |
| **Final QA pass** — role JWT login (supervisor, admin, tech, director, qaqc) | **PASS** |
| **Final QA pass** — `completion-report` + `report-pdf` + `delete-precheck` on `:3001` | **PASS** (200; PDF ~66 KB) |
| **Final QA pass** — browser visual/modal/viewport QA (`cursor-ide-browser`) | **BLOCKED** — MCP tab lost after create; author manual checklist required |
| **Stabilization pass** — panel completion report PDF (no GA merge) | **PASS** on `:3001` (~66 KB `report-pdf`) |
| **Stabilization pass** — completion-report JSON endpoint | **PASS** on `:3001` (200 with valid `frame_id`) |
| **Stabilization pass** — report meta grid overlap | **FIXED** in `panel-completion-report-pdf.ts` + `PanelCompletionReportPreview` CSS grid |

---

## Config / docs map (for agents)

| Purpose | Path |
|---------|------|
| **Project skill (always apply)** | `.cursor/rules/dwes-project-skill.mdc` |
| **Project skill index + CPI** | `.cursor/skills/dwes-project/SKILL.md`, `improvement-review.md` |
| **Project profile (stack/domain)** | `.cursor/rules/dwes-profile.mdc` |
| **MCP servers** | `.cursor/mcp.json` |
| Setup & ports | `README.md`, `DEPLOY-LAN.md` |
| Desktop launch Dev/Prod + HMR | `scripts/LAUNCH.md` |
| Feature progress (long form) | `PROGRESS.md` |
| Changelog | `CHANGELOG.md` |
| Cursor rules | `.cursor/rules/*.mdc` |
| Backup (git preferred) | `scripts/BACKUP.md` |
| Fingerprint setup | `DWES_ENABLE_FINGERPRINT_LOCAL.md` (if present) |

---

## Developer experience / IDE (2026-07-09)

| Item | Status |
|------|--------|
| `.vscode/extensions.json` (oxlint, Tailwind CSS IntelliSense, Prisma, Postgres, EditorConfig, …) | **DONE** |
| `.vscode/settings.json` (workspace TS SDK, oxlint, no Prettier/ESLint format-on-save) | **DONE** |
| `.vscode/launch.json` — FE Vite, BE Nest `--debug`, attach `:9229`, compound Full stack | **DONE** |
| `.vscode/tasks.json` — `dev:all`, build FE/BE, lint, typecheck, prisma generate, backup dry-run | **DONE** |
| `.editorconfig` · `.cursorignore` · `.nvmrc` (24) · `engines` node≥22 | **DONE** |
| Lint = **oxlint** only (no Prettier) | **CONFIRMED** |
| Electron | **OUT OF SCOPE** (browser shortcut launchers) |

**Debug FE+BE:** Run and Debug → **DWES: Full stack (FE + BE)** (or `npm run dev:all` + Chrome at `http://localhost:5175`). Backend inspector on Nest `start:debug` (default `:9229`).

---

## Desktop launcher (2026-07-09)

| Item | Status |
|------|--------|
| Default desktop shortcut = **Dev** (Vite HMR `:5175` + Nest `start:dev`) | **DONE** |
| Silent VBS / no CMD windows — launcher spawns Vite/Nest **directly as `node <cli.js>`** (no `npm→cmd.exe` shell) | **DONE** (2026-07-11 — hardened; empirically verified 0 visible windows vs. 1 `cmd.exe` for the old npm-shell path) |
| Prod launcher (`Start DWES Prod (Hidden).vbs`, `npm run launch:prod`) | **DONE** |
| Health wait (`GET /api/health`) before browser | **DONE** |
| Duplicate prevention (reuse healthy stack; free wrong-mode FE only) | **DONE** |
| Logs under `logs/` (`launcher.log`, `backend.log`, `frontend.log`) | **DONE** |
| Autostart Task Scheduler (`DWES App` task → `start-dwes-silent.vbs` → hidden launcher; both BE+FE detached) | **REGISTERED** (2026-07-11; desktop `DWES.lnk` → `Start DWES (Hidden).vbs`; legacy visible-frontend `DWES-startup.bat` + `DWES Backend` task retired) |
| Docs | `scripts/LAUNCH.md`, `README.md` How to start |

---

## Backup & recovery (2026-07-09)

| Item | Status |
|------|--------|
| Daily backups to `Backup/YYYY-MM-DD_HH-mm` inside project | **DONE** |
| Excludes `node_modules`, `dist`, `.git`, `Backup`, caches, logs | **DONE** |
| Pre-backup disk space check (`minFreeGb` 5, configurable) | **DONE** |
| Retention: 21 backups / 30 days max age (configurable) | **DONE** |
| Post-backup verification + `backup-report.json` | **DONE** |
| `npm run backup`, `backup:dry-run`, `backup:verify`, `backup:pre-op` | **DONE** |
| Pre-op backup before dev hard reset + `deploy:lan*` | **DONE** |
| Task Scheduler registration (`register-backup-task.ps1`, daily 02:00) | **READY** (author must register) |

**Commands:** `npm run backup` · `npm run backup:verify` · `powershell -File scripts/register-backup-task.ps1`

---

## Open flags

1. **Author manual QA (required):** `cursor-ide-browser` MCP could not retain a tab for automated visual QA (2026-07-08 and **2026-07-09** — tab create OK, navigate fails). **Refresh validation DevTools checklist:** (a) Login each role; open Network, filter `Fetch/XHR`, enable Preserve log. (b) Idle **15+ s** on `/supervisor` Projects, `/technician`, `/director`, `/qaqc` — confirm **no** repeating `/api/*` every 3–4 s; at most one burst at ~45 s idle or on tab focus. (c) Trigger assign/deassign/changeover, wiring cable action, inspection submit, panel upload — confirm **one debounced** refetch (~300 ms), not a cascade. (d) Confirm project/panel selection, scroll position, and open modals survive idle background refresh. Also smoke at 1440 / 1280 / 768–1024 px: Login; `/admin`; `/supervisor` (Projects + Status; modals); `/director`; `/technician`; `/qaqc`. Confirm workspace headers, glass off dense grids, no console JS errors.
2. **IT-1 live data:** `frame_1783506467856` (`=H00+R`) holds **399** cables (imported before S.NO-1 fix). Re-upload `_H00+R.xlsx` → Validate & Import for 400.
3. **GA merge decision:** `report-pdf` now serves standalone completion report (no GA). `generateFrameDocument()` still contains GA-append logic but has **no route** — author to confirm whether to expose as separate “full package” export or remove dead code.
4. **Demo passwords** in `backend/src/main.ts` seed — do not deploy without rotation.
5. **Merge policy:** Agents create `change/*` branches; author merges to `main` after review.
6. **Wiring & Drawing spec (2026-07-08):** Drawings are **project-scoped** in backend — panel picker gates UI but `projectsApi.drawings` lists project files. Image drawing upload (PNG/JPG/SVG) not in supervisor picker. `uploadedBy` not in file store (metadata bar shows `—`). Populated popup opens viewer directly + **Replace** footer.
7. **Security triage (report-only, not fixed):** see master verify report in `CHANGELOG.md` 2026-07-08 entry — seed creds, `DEMO_MODE`, `/api/login-hints`, `.env` in tree, large client bundle, frontend role routing without server substitute.
8. **Hard Reset DB (dev only):** Admin → Settings → **Hard Reset DB** when `import.meta.env.DEV` + backend `DEMO_MODE=true` (or `ALLOW_DEV_HARD_RESET=true`). Runs full project backup to `Backup/` first, then pg_dump + upload archive to `uploads/backups/`; wipes operational data + session log + WebAuthn; re-seeds 5 canonical projects; preserves user accounts + `uploads/backups/`.
