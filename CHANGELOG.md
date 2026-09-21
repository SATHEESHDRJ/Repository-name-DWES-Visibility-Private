## 2026-09-20 — Supervisor Status Selected Panel de-dupe

- Removed repeated project/panel titles under Active selectors (identity stays in dropdowns).
- Removed Completed/Total/Remaining matrix under progress (Technician Activity owns assignee; progress block + SRC/DST only).
- Supplemental evidence: `after-supervisor-status-selected-desktop.png`; owner gallery `after/index.html`. Overall still **PENDING OWNER VISUAL ACCEPTANCE**.

## 2026-09-19 — Crimping matrix Prep % label

- Renamed stripping/crimping matrix `Progress %` → `Prep %` so it is not mistaken for overall wiring progress (Wire Number remains the panel position).

## 2026-09-19 — URL forward history fix + evidence re-proof

- ProjectsTab URL sync: hydrate guards + `replace` on automatic mirror (remount no longer wipes forward).
- Live CDP: Projects → Status → back → forward all PASS; regression smoke all 200.

## 2026-09-19 — Director progress de-dupe + Admin health label

- Director Live Status: removed duplicate KpiRing beside linear progress (one % surface).
- Admin health strip: group label `Headcount` (no longer echoes Settings “Users and roles”).
- Re-captured AFTER gallery (20 PNGs).

## 2026-09-19 — Technician assignment KPI de-dupe + AFTER re-capture

- Current Assignment: single Completed/Total/Remaining/Progress matrix + bar (removed chip-strip duplicate and progress fields from meta grid).
- Re-captured full AFTER gallery (20 PNGs) after command-bar reorder + KPI de-dupe.

## 2026-09-19 — Supervisor Projects command bar reorder

- Reordered Projects toolbar into workflow order: New Project → Users → Add Panel → Edit → Wiring Upload → GA Upload → Digital Wiring View → Drawing View → Workflow.

## 2026-09-19 — Premium enterprise UI/UX recovery (Supervisor / Tech / Director / Admin)

- Industrial dashboard density + glass dial-back; no duplicate command CTAs (supervisor single command bar; technician mission KPI strip removed while wiring is open).
- URL-addressable nav: `?tab=` / `?project=` / `?panel=` / technician `?view=` via `useDashboardUrl` (back/forward history).
- confirmAsync industrial density polish; Cut/Strip portfolio stays **PARTIAL** (no fake aggregate card).
- Evidence: `docs/evidence/uiux-recovery/` (BEFORE 20 + AFTER 20 + `FINAL_VERDICT.md` **PENDING OWNER VISUAL ACCEPTANCE**).

## 2026-09-19 — LIVE ENDPOINT: DEVICE paint + Match 1 of N + drawing index

- TB/DEVICE paint: no cell ovals; DEVICE footprints via `manualMapToCandidate` (`PHYSICAL_DEVICE` / INTERNAL from notes); eligible view set includes `PHYSICAL_DEVICE`.
- Match 1 of N: multi-candidate matches keep peers + Previous/Next (FE no longer wipes `count>1`); prefer INTERNAL/REAR over FRONT.
- Drawing index service + Solar Wadi seed (`uploads/drawing-index/003/…`); rejects LEGEND/BOM for auto paint.
- Canonical prep events mapper (`WIRE_CUT` / `SRC_STRIPPED` / …) + dual-write on tech audit log.
- Wire 20.16:E: Source **H74** resolved (Match 1 of 2); Destination **KF87L** unresolved (directory-only; not aliased to F87L). Evidence: `docs/evidence/live-endpoint/WIRE_2016E_MAPPING_STATUS.md`.
- Regression: Wire 021/D1 Match still returns 87STUB + QDC1.

## 2026-09-19 — LIVE TB analysis lifecycle chip (no forever in-progress)

- Technician LIVE ENDPOINT banner no longer treats empty/unfetched status as permanent “in progress”.
- Explicit chip states: **QUEUED / PROCESSING / READY / PARTIAL / FAILED** with real failure reason when FAILED.
- Tests: `tests/live-tb-analysis-lifecycle.test.mjs`.

## 2026-09-19 — Assignment dual-source fix + Mid Change route + transfer lock

- Restored missing `POST /api/supervisor/mid-changeover`; reassign-before-start + Mid Change both publish via EventsInterceptor (`old_assignment_id` / `new_assignment_id`).
- Mid Change closes prior row as `mid_changed` (VARCHAR(20)); receiver stays `assigned` with `handover_from_id` (ASSIGNED_VIA_MID_CHANGE in audit).
- `assertWritableAssignment` blocks cable/start/pause/resume/complete on transferred rows (previous tech cannot continue).
- Workflow `decorateWithWiringAssignment` heals WIRING stage assignees from `tech_assignments` so UI never shows Assigned + Not Assigned.
- Browser accept (Solar Wadi 003 / FEEDER-1): Reassign before start + Supervisor Mid Change after start — both passed.

## 2026-09-19 — Supervisor FE: Reassign / Mid Change confirm modals

- `supervisorApi.reassignBeforeStart` wired; Assign / Reassign / Mid Change use stacked `Modal` confirmations (no `window.confirm`).
- `PanelAssignmentModal`: lifecycle-aware Already Assigned (B) with Reassign (C) / Mid Change (D); initial Assign opens Confirm Technician Assignment (A).
- `PanelWorkflowWorkspaceModal`: prefers `panel_wiring_assignment` for synced labels; Reassign / Mid Change CTAs; WIRING stage assign confirms via Modal A; not-started conflict routes to Reassign.

## 2026-09-19 — Supervisor reassign-before-start + WIRING stage sync

- `TechService.assignFrame` / `changeover` sync `panel_workflow_stage_assignees` for WIRING via public `syncWiringStageAssignee`.
- New `POST /api/supervisor/reassign-before-start` (prod_supervisor) for virgin assignments only; Mid Change unchanged after start.
- Lifecycle helpers in `common/assignment-lifecycle.ts`; panelActivity + panel workflow attach `lifecycle` / action flags / `panel_wiring_assignment`.
- Tests: `backend/test/assignment-reassign-before-start.test.cjs`.

## 2026-09-18 — Whole-Wire Preparation (PREPARE WIRE)

- Technician confirms one complete wire (cut + strip + crimp) via PREPARE WIRE / CONFIRM WIRE PREPARED.
- New `POST /api/tech/crimping/prepare-wire` + `markWirePrepared` (atomic applicable ends; open ends N/A; rework-safe attribution).
- STRIPPING/CRIMPING modules and Group View use whole-wire prepare (no four-button tech completion).
- KPI strip: To Prepare / Prepared / Rework / Ready / Progress %; report title CRIMPING / WIRE PREPARATION REPORT.
- Evidence: `docs/evidence/crimping-global/DWES_WHOLE_WIRE_PREPARATION_COMPLETION.md` (34/34 tests).

## 2026-09-18 — Crimping finish (CR-07 UI + polish)

- Wired `supervisorApi.setCrimpingRework` in Supervisor Crimping Data detail (Mark Strip/Crimp Rework + required reason).
- `getCrimpingReport` projects `reworkHistory`; Rework filter + KPI on supervisor/tech surfaces; Director `crimping_rework` column.
- QA Inspection Form opens same Crimping Data view (`allowSetRequired=false`).
- Evidence/docs: PROJECT_STATUS stale Pending rows cleared; CR-05→CR-10 completion note updated.

## 2026-09-04 — UI-01 Premium Modern Brand Lockup — FROZEN

- Owner visual approval 2026-09-04 (branding exception only).
- Compact official logo ~108–128px (`clamp(108px, 7vw, 128px)`); reduced white container (pad ~6–7px).
- Company one line `INGENIOUS NETWORK FZC` (~21–27px); muted descriptor `DIGITAL ENGINEERING PLATFORM`; single cyan accent line.
- Refined eyebrow; company/product separation; product title remains primary. Auth/Login card/palette unchanged.
- Evidence: `docs/evidence/ui-login-showcase/premium-brand-lockup/`.
- UI-02B not started.

## 2026-09-04 — UI-01 Final Brand Size Correction — FROZEN (superseded by premium lockup)

- Prior Owner approval for ~145–160px logo / one-line company; superseded by premium compact lockup above.
- Evidence retained: `docs/evidence/ui-login-showcase/final-brand-size-correction/`.

## 2026-09-04 — UI-01 Brand Header Micro-Refinement — FROZEN (superseded by final size correction)

- Prior Owner approval for lockup modernization; logo ~192px / two-line company later corrected by final size exception above.
- Evidence retained under `docs/evidence/ui-login-showcase/` for comparison.

## 2026-09-04 — UI-01 visual correction (palette + straight title) — FROZEN (superseded into brand freeze)

- Restored previous theme hero blue via `--login-bg-dark: var(--t-login-hero)` (Ingenious `#091A40 → #0C224F → #1D4ED8`); retuned atmosphere/cards to `--t-login-hero-*`.
- Product title is one line on ≥768px: `DIGITAL WIRING EXECUTION SYSTEM` (responsive size; wrap only on narrow mobile).
- Master layout preserved; wire graphic still removed; auth unchanged. Included in Owner-approved FROZEN login presentation.

## 2026-09-04 — Master UI-01 Login Showcase (wire graphic removed) — FROZEN

- Removed SOURCE/DEST / Wire 001–003 showcase component and layout entirely.
- Left hero rebuilt with abstract technical atmosphere (grid/glow/geometry) — no fake wiring data.
- Capability cards: REAL-TIME EXECUTION / DIGITAL WORKFLOWS / COMPLETE TRACEABILITY (3-column glass).
- Unified utility rail; cool-light auth surface; “Sign in to continue to DWES”; `--dwes-*` tokens.
- Evidence: `docs/evidence/ui-login-showcase/` (incl. 1600×900). Owner visual confirmation recorded 2026-09-04 — **FROZEN**.

## 2026-09-04 — UI-01 Premium Login / Product Showcase — FROZEN

- Redesigned `/` login presentation into Ingenious Network FZC + DWES product showcase (≈55/45 split).
- Abstract SVG SOURCE→DEST wiring visual (no fake production data); three capability cards; compact utilities/clock.
- Auth logic frozen (store, `POST /api/auth/login`, JWT, redirect, biometric enroll gate unchanged).
- Friendly inline credential/network errors; design tokens `--login-*`; `prefers-reduced-motion` honored.
- Evidence: `docs/evidence/ui-login-showcase/`; tests: `tests/login-showcase.test.ts`.

## 2026-09-04 — CR-05→CR-10 Supervisor / Director / QA / PDF / Freeze

- CR-05: Supervisor Crimping Data View in Status (`CompactStatusWorkspace`) with filters, drill-down, Crimping Required, PDF download — consumes `getCrimpingReport`.
- CR-06: `summarizeCrimpingKpis` adds rework/open counts; Director monitoring consolidated panels include crimping_* KPIs (required denominator) + Stripping/Crimping KPI tile.
- CR-07: `markPrepReworkRequired` + `POST /supervisor/crimping/:id/rework`; history preserved; audit `crimp_rework`; no DDL.
- CR-08: Formal landscape PDF `crimping-report-pdf.ts` + `GET .../crimping-report/:id/pdf`.
- CR-09: Reuses assignment SSE / sessionStorage module restore (no WebSockets).
- CR-10: Freeze regression tests `technician-module-freeze.test.cjs`; evidence doc under `docs/evidence/crimping-global/`.

## 2026-09-04 — Global Stripping + Crimping + Crimping Report

- Four Technician modules on one assignment: DIGITAL WIRING (frozen) | STRIPPING | CRIMPING | CRIMPING REPORT.
- Additive canonical crimping-leg fields via upload mapping (`source_crimp_leg_*` / `dest_crimp_leg_*`); missing → NOT AVAILABLE; never inferred from wire size/color.
- Single global `getCrimpingReport` projection + `GET /api/tech/crimping-report/:id` (tech ownership 403) and supervisor mirror route.
- Complete engineering Crimping Report UI (leg columns + execution status); multi-project T1–T5 in `crimping-report.test.cjs`.
- No WiringSchemeDB DDL; E01+R1 remains fixture-only (no production project-name branches).

## 2026-09-04 — CR-04A–D Stripping + Group View + Technician Report

- Nested `crimping.source|destination` with independent `strippingStatus` / `crimpingStatus` (+ attribution). Flat CR-01→CR-04 data normalized without inventing stripping.
- Same-end gate: crimp blocked until strip (`SOURCE_STRIPPING_REQUIRED` / `DESTINATION_STRIPPING_REQUIRED`); wiring unlock requires all applicable strip+crimp COMPLETE.
- Technician Wire View: SOURCE/DEST STRIPPED + CRIMPED; Group View by `sourceEquipment → destinationEquipment`; bulk actions with per-wire skip reasons.
- In-app STRIPPING & CRIMPING REPORT (workspace REPORT tab + sidebar Crimping Report); KPIs for Src/Dst strip & crimp + Ready.
- APIs: `operation` on `/tech/crimping/action`; new `/tech/crimping/bulk-action`. Unit tests 12/12. No DDL / no DB reset.

## 2026-09-03 — Crimping before Wiring (CR-01…CR-04)

- Additive `cable_status[i].crimping` JSON (no WiringSchemeDB DDL) with per-end Source/Destination state, overall, attribution, and legacy grandfather stamp.
- Hard per-wire gate: Crimping-required wires must finish applicable crimp ends before Wiring `FINISHED` / complete mutations (`CRIMPING_NOT_COMPLETED`).
- Technician workstation: `[ CRIMPING ] | [ WIRING ]` mode toggle, SOURCE/DEST CRIMPED actions, mode-specific KPI row, gate banner + GO TO CRIMPING; session mode persisted per assignment.
- Supervisor Review & Approval: **Crimping Required** multi-select modal (Select unfinished / Clear / Apply) via `/api/supervisor/crimping/:assignmentId/required`.
- Backend unit tests: `backend/test/crimping.test.cjs` (10/10). Verify at `http://localhost:5275/technician` and Supervisor Review panel overview.

## 2026-08-19 — Technician modal overlay covers full viewport (no sidebar shadow)

- Removed the `html.tech-fn-modal-open .modal-overlay/.tech-equip-filter-root/.tech-skipped-filter-root { left: 16.5rem }` shift that left the dark sidebar rail un-dimmed while a technician function modal was open.
- The sidebar rail (dark navy `#0C224F`) was staying fully visible next to the dimmed content, reading as a stark "shadow" block on the left of every Tag Cable-Wise / Skipped Wire / Equipment filter popup.
- Modal backdrops now cover the full viewport (`inset: 0`) so the sidebar is dimmed along with the content — no more dark block.
- Behaviour change: sidebar function buttons are no longer clickable while a function modal is open; close the modal (Escape / Close) before switching functions.
- Scope: Technician Dashboard modal overlays only; verify at `http://localhost:5275/technician` (Tag Cable-Wise Filter, Skipped Wire Filter, Equipment Filter).

## 2026-07-30 — LIVE TB universal analysis: real text only + schedule/drawing mismatch

- Nest PDF fallback matches expected physical TB headers against PDF **literal** text only (not compressed binary), preventing false hits (e.g. random `X9` bytes).
- Expected headers include embedded schedule TBs (`TERM_*` like `X321:17` → `X321`) and exclude equipment tags.
- Analysis `result_summary` records `headers_found` / `headers_missing`; full miss → `SCHEDULE_DRAWING_MISMATCH` failure reason.
- LIVE TB banner: *"The wiring schedule TB could not be found in the assigned panel GA drawing."* when the active wire’s physical TBs are absent from the GA text.
- Python CLI no longer promotes placeholder geometry to HIGH (no fake marker seeding).
- Repro case Wire 030/D3 used only for verification — no hardcoded project/TB/geometry.

## 2026-07-30 — LIVE TB compact oval overlay + auto-zoom

- LIVE TB highlight is a compact red (Source) / blue (Destination) oval on the TB group centre — not a large rectangle over legend or surrounding area.
- Opening LIVE TB VIEW auto-zooms and pans the GA to the matched TB location.
- Oversized/placeholder marker boxes are clamped to a small oval at the reported centre.

## 2026-07-30 — LIVE TB VIEW physical TB resolution (not equipment)

- LIVE TB match resolves only **physical** terminal-block headers (X-series / embedded TB refs such as `X317:10`).
- Equipment endpoints (`74IO`, `K01`, relays, contactors) are no longer treated as TB strips for match or expected-header detection.
- Seeded 74IO/K01 fixture markers no longer paint as a successful LIVE TB detection.
- Wire chip / banner distinguish equipment ends vs physical TB headers.
- Scope: LIVE TB VIEW + TB match/expected-headers; not a final automatic-detection geometry pass.

## 2026-07-28 — Correction Centre download name + View button

- Download Excel now uses a professional filename with the full project name (e.g. `SHUNOOF-DEWA-DXB-UAE-002__Panel-H001__…`), not a `frame_*` basename.
- Correction table **View** button is a compact horizontal icon+label control matching View Excel.
- Scope: Technician Correction Centre only; verify at `http://localhost:5280/technician`.

## 2026-07-28 — View Excel landscape spreadsheet viewer

- Fixed Correction View Excel modal: overrides the 34rem `.swm-modal` width so the viewer is large landscape (~96vw × ~90vh).
- Spreadsheet-primary layout; compact single-row sheet tabs and toolbar; detail panel defaults collapsed when the focused wire has no correction (≤~320px when open).
- Opens **WIRING SCHEDULE** by default; Correction Centre hidden while Excel is open.
- Scope: Technician View Excel UI only; verify at `http://localhost:5280/technician`.

## 2026-07-28 — Compact vertical status row + inline EQUIP STATUS

- Progress matrix cards are vertical (label top, large bold value below) in one equal-height wrapping grid.
- EQUIP STATUS sits in that row immediately after Wire Number (opens existing popup); separate button row removed.
- Short labels OPEN SRC / OPEN DST; equipment card shows ALL or selected name.
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-28 — Equipment Status live popup polish

- Removed the ALL EQUIPMENT badge beside the EQUIPMENT STATUS trigger.
- Equipment Status popup now shows a LIVE indicator and colour-coded Overall Status pills (In Progress / Attention Required blink; Completed with Open Ends soft-pulses).
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-28 — Equipment Filter / Status from schedule ferrules

- Equipment Filter and Equipment Status list Source (`DEV_TBLK_A`) plus Destination derived from `IEC_FERR_B` (`IEC_FERR_A` fallback), preserving names that contain `/` (e.g. `T23/H23`).
- Replaced the Equipment Wiring Status 9-card strip with an **EQUIPMENT STATUS** trigger + searchable popup (per-equipment totals/status via existing helpers).
- Filter selection clears automatically when the equipment is absent from the newly loaded Project/Panel schedule.
- Scope: Technician UI only; no DB/API/Excel mapping changes. Verify at `http://localhost:5280/technician`.

## 2026-07-28 — Equipment Wiring Status card grid

- Replaced the continuous Equipment Wiring Status text strip with a compact 9-card grid below the main Wire Number / KPI row.
- Cards: Selected Equipment, Wiring Status (wider), Finished, Pending, Skipped, Open Source, Open Destination, Corrected, Progress (ring + bar).
- Same equipment-filter calculations and status rules; main KPI cards unchanged.
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-28 — Internal Device Looping sidebar entry

- Moved **Internal Device Looping** from the DWS header into the Technician left sidebar under Equipment Filter (`NOT CONFIGURED` badge).
- Same read-only popup; no looping data, wiring, or Equipment Filter behaviour changes.
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-28 — Project-panel Correction Centre / View Excel

- CORRECTION opens a project-and-panel **Correction Centre** (all panel corrections) while showing the active wire.
- View Excel / Download Excel stay available on any active wire; they load/download the latest corrected project-panel workbook (or the original schedule when none exists).
- View Excel modal ~85% × 85%, frozen headers, collapsible detail panel, focus corrected wire/cell or scroll to the active wire; yellow/amber highlights retained.
- Scope: Technician correction Excel UI + correction preview/download fallback only; wiring progress/status/mapping unchanged.
- Verify at `http://localhost:5280/technician`.

## 2026-07-28 — Internal Device Looping entry (UI-only)

- Added compact **Internal Device Looping** button in the DWS **top bar** only (`NOT CONFIGURED` badge).
- Opens a read-only popup: looping data will be configured/linked later by the Production Supervisor; reserved field sections stay empty.
- No looping sample data, wiring/DB/Excel/API changes; Equipment Filter, Equipment Wiring Status, matrix, and actions unchanged.
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-27 — Action bar OPEN SIDE (no NEXT)

- FINISHED and SKIP remain separate save actions (each advances to next pending wire).
- Replaced OPEN SOURCE / OPEN DESTINATION with one **OPEN SIDE** confirmation popup (Source or Destination → Cancel / Confirm).
- No NEXT button; PREVIOUS / HISTORY / PAUSE unchanged; compact centred medium action buttons.
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-27 — Dense one-screen matrix (no duplicate wire specs)

- Removed always-visible Wire Colour / Size / Length fields under the cable visual; values show once as `COLOUR · SIZE · LENGTH` with compact Edit for corrections.
- Tightened DWS header, progress strip, matrix and action bar spacing for less vertical scroll.
- Scope: Technician UI only; verify at `http://localhost:5280/technician`.

## 2026-07-27 — Project/Panel ID in Digital Wiring Schedule header

- Moved Project + Panel identification into the DWS workspace header (`PROJECT… | PANEL: …`).
- Removed the duplicate SectionHeader banner while the schedule is embedded (Panels / Tablet / Full View / filters).
- Scope: Technician UI only (OCI-derived); verify at `http://localhost:5280/technician`.

## 2026-07-27 — Compact Technician workspace density

- Status strip: equal-height Wire Number + KPI cards with medium labels/numbers.
- Action bar: medium touch-friendly buttons; one row ≥960px, two columns 600–959px, stack &lt;600px.
- Single Wire Matrix: content-hugging card, reduced padding/blank space; elevated Cable/Wire center and open-end indicators retained.
- Scope: Technician UI only (OCI-derived); verify at `http://localhost:5280/technician`.

## 2026-07-27 — Compact Single Wire Matrix + open-end visuals

- Technician matrix: reduced empty space; balanced Source / Cable / Destination; medium tablet-readable labels/values.
- Elevated center **Cable / Wire Details** (bordered surface, stronger hierarchy, larger cable visual).
- OPEN SOURCE / OPEN DESTINATION show orange-red / indigo-purple endpoint indicators (both when both open); driven by existing `cable_status` + notes; persists across refresh / Previous / Resume / filters / SSE.
- Scope: Technician UI only in OCI-derived repo; verify at `http://localhost:5280/technician`.

## 2026-07-27 — Inline single-wire corrections (Technician Matrix)

- Replaced Correction/Edit popup with **inline Edit** beside permitted matrix fields (original / new / mandatory reason / Save / Cancel).
- Footer **HISTORY** button + Corrected badge open read-only history with file path, View Excel, Download Excel.
- Corrections still write only under `uploads/<PROJECT>/Corrections/`; original frame Excel untouched; corrected copy gets yellow cells + Excel comments with full audit text.
- Secured download `GET /api/tech/cable-corrections/:id/excel` for technician (owner) and Supervisor/QA/QC/Director (read).

## 2026-07-27 — Tablet-first Single Wire Digital Wiring Matrix

- **One active wire only** in Technician main execution workspace (no multi-row Excel table in single-exec).
- **Modern full-page matrix**: Source Details (red) | Cable / Wire Details (large 2D visual) | Destination Details (blue); Additional Wire Details for leftover `_raw` columns; empty optional fields show `—`.
- Field coverage from mapped cable + `_raw`: S.NO, PNLNO_A, DEV_TBLK_A/B, TERM_A/B, TERMSIDE_A/B, IEC_FERR_A/B, REFRNCE, colour/size/length, sign, remarks — no schema or Excel mapping changes.
- Compact status cards + active-wire history band + START/FINISHED/SKIP/OPEN*/PREVIOUS/PAUSE|RESUME action bar (handlers/API unchanged).
- Scope: OCI-derived repo Technician UI only; verify at `http://localhost:5280`.

## 2026-07-26 — Technician Digital Wiring Schedule: matrix card + corrections

- **Compact status matrix** above the schedule: Wire Number, Equipment-Wise Filter, Total / Finished / Skipped / Open Source / Open Destination / **Corrected** (reduced padding; no-wrap labels).
- **Action bar**: FINISHED | SKIP | OPEN SOURCE | OPEN DESTINATION | **CORRECTION/EDIT** | PREVIOUS | PAUSE/RESUME — balanced gradient buttons; local status + poll refresh (no full page reload).
- **Single-wire matrix card**: Source | Cable Visual | Destination with ferrules, colour/size/length, status, Corrected badge.
- **Correction/Edit workflow** (technician overlay only): modal with project/panel/wire/parameter/existing/corrected/reason/tech/timestamp; rejects empty reason or identical values; history popup; Corrected badge + field highlight.
- **Persistence**: additive `cable_status.corrected` + notes/`tech_audit_log`; file store under `uploads/<PROJECT>/Corrections/` (`*-corrections.json`, `correction-register.xlsx`, `*_corrected.xlsx`). Original frame JSON and source Excel are **not** overwritten.
- Scope: Technician Dashboard after supervisor assignment only (OCI production source tree).

## 2026-07-20 — Production TLS diagnosis (self-signed IP cert still active)

- **Live cert** (inspected from this PC): `Subject=CN=193.123.79.209`, `Issuer=CN=193.123.79.209` (365-day IP-only bootstrap from `deploy-demo-from-windows.ps1 -IpOnly`). Chrome/curl/`Invoke-WebRequest` fail hostname validation (`SEC_E_WRONG_PRINCIPAL` / not trusted). `/healthz` over TLS still returns `ok` when verification is skipped.
- **Nginx repo config** is correct: `dwes.ingenious-network.com` vhost uses `/etc/nginx/ssl/fullchain.pem` + `privkey.pem` (host mount `${DATA_ROOT}/ssl/nginx`). Replacing those PEMs with Let's Encrypt fixes trust without app rebuild.
- **`init-letsencrypt.sh`**: removed silent `|| true` on certbot; fail loudly + nginx log tail on error.
- **`sync-letsencrypt-to-nginx.sh`**: `nginx -t`, reload, print cert subject/issuer/dates after copy.
- **`production-ssl-from-windows.ps1`**: rewritten UTF-8; DNS check, sync nginx/cert scripts, run init-letsencrypt, certbot dry-run, local `curl`/`Invoke-WebRequest` verify.
- **Blocked from agent**: SSH :22 times out (security list allows `86.98.142.46/32` only). **Run on your PC:** `powershell -NoProfile -ExecutionPolicy Bypass -File infra\oci\scripts\production-ssl-from-windows.ps1` then confirm Chrome padlock.

## 2026-07-20 — OCI production canonical host + Let's Encrypt finalize (prep)

- **Nginx** (`infra/nginx/conf.d/dwes.conf`): canonical `dwes.ingenious-network.com`; HTTP on public IP redirects to domain HTTPS; default HTTPS uses `ssl_reject_handshake` so bare IP no longer serves a different app with a mismatched cert.
- **Compose** (`infra/docker/docker-compose.yml`): mount live nginx config from repo (reload without rebuilding frontend image).
- **PWA**: `public/manifest.webmanifest` absolute production URLs; `public/sw.js` version `20260720-prod-1` purges legacy caches on activate.
- **Scripts**: `production-oci-finalize.sh` (backup, LE, certbot renewal, `DEMO_MODE=false`, PWA static sync); `production-ssl-from-windows.ps1` driver (UTF-8).
- **Blocked**: Cursor/agent egress cannot reach SSH :22 (rule is `86.98.142.46/32` only). Run finalize from your PC: `production-ssl-from-windows.ps1`.

## 2026-07-20 — OCI IP-only deploy resume (maintenance VM)

- Fixed `TopbarProfileMenu.tsx` UTF-16 encoding and restored the Topbar dropdown component (Docker frontend build was failing on missing/invalid TS).
- `deploy-demo-from-windows.ps1`: LF-only remote env script (CRLF broke `cd /opt/dwes`); IP-only path bootstraps self-signed PEMs under `DATA_ROOT/ssl/nginx` before compose up.
- VM **`193.123.79.209`**: `docker compose` images built; Postgres restored from synced `backend/backups/cutover_20260709_2211.dump`; API healthy; nginx serves `/healthz` locally. **Open OCI ingress 80/443** if the public IP still times out from your PC.

## 2026-07-20 — OCI public IP migration (maintenance VM)

- Active OCI target: **`ingenious-dwes-prod-maintenance-01`**, public IP **`193.123.79.209`**, DNS **`dwes.ingenious-network.com`** → same IP. Canonical deploy/SSH: `infra/oci/scripts/OCI-CURRENT-TARGET.md`.
- Replaced **`84.235.240.255`** / default **`ssh-key-2026-07-19`** references in OCI scripts and docs with **`193.123.79.209`** / **`ssh-key-2026-07-20`**. No Certbot or live stack changes in this doc-only/config update.

## 2026-07-20 — Excel tests migrated off undeclared `xlsx` package

- `backend/test/{async-job-handlers,cable-visual-flow,excel-parser-regression}.test.cjs` built fixture workbooks with `require('xlsx')`, which was never declared in any package.json — all three crashed on load. Fixture builders rewritten to `exceljs` (the declared production library; `SafeExcelReader` deliberately avoids SheetJS/xlsx). Builders became async (`wb.xlsx.writeBuffer()`); assertions unchanged; no upload business logic touched.
- `excel-parser-regression` header-position test now feeds its aoa directly to the pure `findHeaderRow`/`dataStartRow` helpers instead of round-tripping through `XLSX.read`.
- Full backend suite: **193/193 pass** (previously 177/180 with the 3 files failing on `Cannot find module 'xlsx'`).

## 2026-07-20 — Workflow diagnose repair (Flat 3D honesty checks)

- Repaired UTF-16 high-byte corruption in `backend/src/panel-model/workflow-diagnose.ts` and `auto-extract.ts` (em-dash → `\x14`, ellipsis → `&` in check messages) and rewrote UTF-16-encoded `backend/test/auto-extract.test.cjs` as UTF-8 (it previously crashed the test runner).
- `runWorkflowDiagnose` now reports honest blockers: `schedule_tags` FAILS when zero schedule devices match the drawing (missing-tag evidence attached), new `terminals_detected` / `ducts_detected` warnings when terminal rows or wire ducts are undetected, new `revision_match` FAIL when the conversion run's recorded `drawing_revision` differs from the current package revision, and new `flat3d_run` FAIL surfacing a FAILED run's `failureReason`.
- Removed fabricated passes: `checksum_unchanged` no longer claims a match when the stored drawing checksum is absent (warns "provenance not verifiable" instead); `approved_2d_fallback` fails when no drawing is stored; GLB structural check now uses `validateGlbBuffer` (magic + version) with unreadable-file handling.
- `applySafeAutoFixes` no longer claims "Trimmed whitespace" after dedup index shifts — it reports a trim only when a label actually had stray whitespace.
- Provenance plumbing: `Flat3dConversionOptions.drawingRevision` added; `PanelModelService.convert()` passes `pkg.revision` and the service forwards `--drawing-revision` to `python -m flat3d.cli`, so future run manifests record the source revision for the `revision_match` check.
- New `backend/test/workflow-diagnose.test.cjs` (16 tests: blockers, no-fabrication paths, GLB validation, safe auto-fixes). WiringSchemeDB untouched (no migrate/db push).

## 2026-07-20 — Technician Full View fullscreen (Digital Wiring Schedule)

- **Full View** sidebar mode now portals the Excel reference schedule to `document.body` with `dwf-full-view-root` and `html.dwf-full-view-active` (hides AppShell), matching Tablet View immersion.
- **Return to Web View** control restores embedded web layout; Escape also exits full view.
- Removed `70vh` cap on full schedule table when in viewport fullscreen (`design-system.css`).

## 2026-07-20 — Auto Extract & Fill (3D GA / 2D Drawing View)

- `backend/src/panel-model/auto-extract.ts` — full-document scan of all panel 2D sources; confidence-tagged fields; exact schedule tag keys; Auto Fix report.
- `POST .../model/auto-extract` and `POST .../model/auto-fix` (supervisor).
- `PanelGaDrawingModal` Side-by-Side Verify: **Auto Extract & Fill** + **Auto Fix** with source/confidence hints.

## 2026-07-20 — Flat 3D Drawing Conversion Pipeline (Phase 2 — CAD-first path)

- Added `backend/src/flat3d-conversion/` module: `flat3d-conversion.types.ts` (stage constants, interfaces), `flat3d-conversion.service.ts` (orchestration), `flat3d-conversion.module.ts`.
- `Flat3dConversionService.runConversion()`: copies source DWG/DXF immutably into `uploads/<code>/flat3d/<frameId>/<runId>/source.*`, spawns `python -m flat3d.cli` (env `DWES_PYTHON`, `DWES_FLAT3D_SCRIPT_ROOT`, `DWES_LIBREDWG_BIN_DIR`, `DWES_FLAT3D_TIMEOUT_MS`), reads `report.json` + `model.glb` from output dir; PDF input returns `FAILED / APPROVED_2D_ONLY` immediately without spawning CLI.
- `PanelModelService.convert()`: CAD-first branch added — when primary drawing is DWG/DXF and `Flat3dConversionService` is injected, runs flat3d pipeline first; on `READY_FOR_REVIEW` persists `verification_required` model with Flat 3D GLB; on hard failure persists `conversion_failed`; PDF / APPROVED_2D_ONLY fallback continues to existing parametric path. **No auto-publish; no schema migrations.**
- `FramesController`: added `GET /api/projects/:code/frames/:id/model/flat3d/latest` and `POST /api/projects/:code/frames/:id/model/flat3d/convert` (supervisor only).
- `FramesModule`: imports `Flat3dConversionModule`.
- `AppModule`: imports `Flat3dConversionModule`.
- `src/services/api.ts`: added `panelModelFlat3dLatest` and `panelModelFlat3dConvert`.
- `Panel3dModelWorkspaceModal.tsx`: Convert step adds CAD-first honesty note; shows overlay metrics (device match %, positional deviation, missing device count) from latest flat3d run; existing PDF/parametric path and approve flow unchanged.
- `backend/test/flat3d-conversion.test.cjs`: unit tests for stage constants, PDF rejection, missing file, unsupported format, special chars in device names, and graceful Python-not-found failure.

## 2026-07-20 — Hybrid Panel 3D Model (Phase 1)

- Supervisor **3D Model** action on Project Information (gated after wiring schedule) opens `Panel3dModelWorkspaceModal`: Upload → Convert → Map → Validate → Approve, reusing existing upload, convert/approve APIs, GA mapping, engineering package, and `PanelGaDrawingModal` / R3F viewers.
- Technician Digital Wiring Schedule header gains read-only **Cable Digital Twin** (modal entry; not an inline OT pane).
- No new 3D viewer dependency: evaluated model-viewer / Online3DViewer / xeokit — kept existing `@react-three/fiber` + `EngineeringModelViewer` (MIT, already integrated, tablet quality path exists).
- `VITE_ENABLE_PANEL_3D=true` documented in `.env.example`; local `.env` created for Flat/Engineering tabs.
- Workflow rule updated: twin modal via header is allowed; inline DWS twin remains disallowed.
- Git CLI not on PATH — no change branch created this session.
## 2026-07-20 — Unified design system across devices

- Added `src/styles/device-unity.css` so canvas/body/native controls follow `data-theme` / `data-mode` on every viewport.
- ThemeProvider now applies theme via `useLayoutEffect` + shared `applyDocumentTheme` (including `color-scheme`).
- Removed portrait Digital Wiring table card-grid restyle; tablet keeps the same table chrome with horizontal scroll.
- Tokenized project-gate, KPI value, wiring CVP/full-view/open-end labels, tabs active icons, and Project Edit menu surfaces.
- Sidebar Material/3D icons use the same filled weight/size at all breakpoints (layout rail still responsive).
- Fixed depth-icon selector from incorrect `data-theme="dark"` to `data-mode="dark"`.
- Sales Director was not added (unsupported role). AppShell structure unchanged.
## 2026-07-19 — Revoke DuckDNS demo hostname (await exact DNS)

- Removed assumed hostname `ingeniousdwes.duckdns.org` and deleted `.env.demo-duckdns.example`.
- Deploy default domain restored to `dwes.ingenious-network.com`; pass `-Domain <exact-host>` only when DNS is ready.
- Kept SSH paste-script pubkey fix and pre-TLS DNS A-record check. OCI HTTPS deploy waits for author DNS.

## 2026-07-19 — DuckDNS demo deploy blocked (SSH + DNS)

- Target: `https://ingeniousdwes.duckdns.org` on OCI `84.235.240.255`.
- **SSH:** still `Permission denied (publickey)` for both local keys; TCP 22 reachable; 80/443 closed.
- **Fixed** `vm-paste-authorized-keys-ubuntu.sh` to embed the pubkey that matches `.oci-ssh/ssh-key-2026-07-19.key` (was wrongly embedding `dwes-demo-oci`).
- **DNS:** `ingeniousdwes.duckdns.org` is NXDOMAIN — must create DuckDNS subdomain → VM IP before Let's Encrypt.
- Added `infra/docker/.env.demo-duckdns.example`; `deploy-demo-from-windows.ps1` now defaults DuckDNS domain, selects DuckDNS env template, and **refuses TLS until DNS A record matches PublicIp**.
- Docs: `FREE-HTTPS-DEMO-HOSTNAME.md` DuckDNS option A. Deployment not complete — awaiting manual SSH key paste + DuckDNS create.

## 2026-07-19 — Xiaomi tablet standalone app and touch navigation

- Insecure LAN HTTP now shows **HTTPS Required** with the exact trusted HTTPS URL;
  it no longer implies that a browser shortcut will open as a standalone PWA.
- Digital Wiring Schedule tablet fullscreen now allows vertical touch scrolling in
  both orientations and preserves horizontal table scrolling/pinch gestures.
- Approved Drawing PDF now uses native one-finger touch scrolling and supports
  two-finger zoom while retaining mouse/pen drag-to-pan and toolbar zoom.
- Added Xiaomi/Android mkcert CA trust and Chrome **Install app** steps to
  `DEPLOY-LAN.md`; no authentication, API, RBAC, database, or wiring-state logic changed.
- Verified production build, PWA tests (3/3), lint (exit 0 with pre-existing
  warnings), trusted HTTPS secure context, root-scoped service worker, API health
  200, no mixed-content resources, and tablet CSS overflow/touch behavior.

## 2026-07-19 — LAN access fix: IPv4 bind + Public-profile firewall

- **Root cause of "works on host, not on tablet":** (1) active Wi‑Fi profile was **Public**, so Windows Firewall blocked inbound LAN; the old rule targeted **Private** only. (2) No inbound rule existed for port **5175**. (3) Vite bound `::` (IPv6) via `--host`.
- `scripts/ensure-lan-firewall.ps1` now creates inbound TCP allow rules for 5175/5173/3001/4173 on **Any** profile (Domain/Private/Public), repairs older Private-only rules, reports each adapter's network category, and flags AP/client isolation.
- Added `dev:lan` script (`vite --host 0.0.0.0 --port 5175`); `scripts/start-lan-mode.mjs` runs it via `concurrently` (single quoted shell string) so FE binds **IPv4 0.0.0.0**, not `::`.
- Fixed `.mjs`/`.ps1` files re-saved as UTF-16 (encoding bug) back to UTF-8. `print-lan-url.mjs` footer notes all-profile firewall + client-isolation caveat.
- Verified from LAN IP `192.168.0.164`: FE 200, backend `/api/health` 200, Vite `/api` proxy 200, CORS preflight 204 (`Allow-Origin` echoes LAN origin), app `fetch('/api/health')` ok, `#root` mounts. No business-logic/API/RBAC/auth changes.

## 2026-07-19 — Universal Local Network Mode

- Added `npm run lan` (`scripts/start-lan-mode.mjs`): auto-detect private LAN IPv4, bind FE/BE on `0.0.0.0`, print Frontend/Backend/Health URLs, optional Windows Firewall helper.
- Shared detection in `scripts/lan-network.mjs` (skips `169.254.*`); `print-lan-url.mjs` and `launchers/START-DWES-LAN.bat` no longer hardcode a Wi‑Fi IP.
- `npm run lan:firewall` → `scripts/ensure-lan-firewall.ps1` (Private profile TCP 5175/3001/4173).
- Backend startup LAN banner skips link-local addresses. No business-logic / API / RBAC changes; frontend still uses relative `/api` + Vite proxy.

## 2026-07-19 — Free HTTPS demo hostname (sslip.io) prep

- Added `infra/docker/.env.demo-sslip.example` and `infra/oci/scripts/FREE-HTTPS-DEMO-HOSTNAME.md` for `\<IP\>.sslip.io` + existing Let's Encrypt path.
- Deploy still blocked until VM has matching `authorized_keys` for `ssh-key-2026-07-19` (see `vm-paste-authorized-keys-ubuntu.sh`).

## 2026-07-19 — OCI demo SSH: matching key pair + IP-only deploy

- Scripts use only `.oci-ssh/ssh-key-2026-07-19.key` (+ `.pub`); no fallback to unrelated key names.
- `vm-paste-authorized-keys-ubuntu.sh` installs current matching pubkey under `/home/ubuntu/.ssh` (700/600, ubuntu:ubuntu, duplicate-safe).
- `deploy-demo-from-windows.ps1 -IpOnly` targets `http://<PublicIp>/` without Let's Encrypt / DNS.
- `copy-ssh-pub-to-clipboard.bat` / `test-demo-ssh.bat` / `deploy-ip-demo.bat` keep commands separate (no `-IpOnlyGet-Content`).

## 2026-07-19 — OCI demo: proper domain + instance naming

- Added `infra/docker/.env.demo.example`: `DEMO_MODE=true`, `dwes.ingenious-network.com`, `RP_NAME='DWES'`.
- `deploy-demo-from-windows.ps1` uses demo env template, sets `RP_NAME=DWES`, prefers SSH key `.oci-ssh/ingenious-dwes-prod-01` (legacy `dwes-demo-oci`), documents TLS deploy to **https://dwes.ingenious-network.com/**.
- PuTTY/SSH helpers and Cloud Shell inject messages use instance key name `ingenious-dwes-prod-01`.
- Fixed `deploy-secrets.local.env.example` and `docs/HUMAN-ACTIONS.md` to canonical hyphenated domain (was `dwes.ingeniousnetwork.com`).

## 2026-07-19 — PuTTY quick-start (demo VM)

- Added `SIMPLE-SSH-PUTTY.md`, `open-demo-vm-putty.bat`, `copy-cloudshell-paste.bat`; UTF-8 `CLOUDSHELL-PASTE-ADD-SSH.txt` wraps `cloudshell-inject-ssh-via-agent.sh`.

## 2026-07-19 — OCI SSH key rotation (demo host)

- Rotated demo SSH public key in Cloud Shell inject helpers to match Windows `.oci-ssh/dwes-demo-oci.pub` (`ssh-key-2026-07-19` RSA).
- `cloudshell-inject-ssh-via-agent.sh` / `cloudshell-add-ssh-key.sh` accept `PUB_KEY` override; `CLOUDSHELL-PASTE-ADD-SSH.txt` and `README-DEMO-HOST-SSH.md` updated for me-dubai-1 paste workflow.

## 2026-07-19 — OCI Dubai demo host bootstrap scripts

- Added VM bootstrap + Windows deploy helpers for light demo on `ingenious-dwes-prod-01` (E5.Flex 2/12, Dubai): `infra/oci/scripts/bootstrap-demo-vm.sh`, `deploy-demo-from-windows.ps1`, `cloudshell-inject-ssh-via-agent.sh`, `cloudshell-add-ssh-key.sh`, `cloudshell-open-ports-hint.sh`, `README-DEMO-HOST-SSH.md`.
- SSH private keys stay under ignored `.oci-ssh/`. Hosting blocked until Instance Agent inject or Console Connection installs `dwes-demo-oci.pub` on the VM.

## 2026-07-19 — Technician Dashboard header formatter

- Technician Dashboard header now uses canonical project display format with dynamic fields, matching the New Project creation preview and Production Supervisor logic. Project name and panel name are bolded. Fields are only shown if they have real values (no empty separators, repeated names).

## 2026-07-19 — Shared premium report action button styling

- Unified **View Report**, **Export PDF/XLSX**, **Download PDF**, and related report CTAs under `.dwes-report-action-btn` / `.dwes-report-export-btn` (indigo view + slate export, hover/focus/disabled, dark theme). No workflow or label changes.

## 2026-07-19 — Supervisor Status Workspace typography emphasis

- Status Workspace KPIs, matrix dynamic values, selected-panel summary, and Active Project/Panel fields use shared `sws-*` / scoped matrix weights: 700 for names, KPIs, progress % and technician; 600 for panel/cable counts and status pills; 500 for column headings and field labels. Layout, colours, and workflows unchanged.

## 2026-07-19 — Operations Director sidebar + flat submitted register

- Restored the shared `DashboardShell` / `dash-sidebar` navigation for Operations Director with a single active item, **Submitted Panels**.
- Removed the oversized inner `dash-module` wrapper so the section heading and responsive project smart-card grid sit directly in the workspace (no large empty panel).
- Project cards now show a labeled **Client** hierarchy (optional **Location** when present in API data); panel rows unchanged (**View Report** only).

## 2026-07-19 — Operations Director smart-card grid

- Restyled the existing grouped submitted-project register as compact responsive smart cards: three columns on wide desktop, two on tablet, and one on mobile.
- Preserved the Director header, submitted-panel grouping, read-only permissions, SSE refresh, APIs, and existing `View Report` behavior.

## 2026-07-19 — QA/QC under development, director submit fix, compact director/supervisor cards

- **Panel assignment not found (Submit to Director):** `ProjectsService.submitToDirector` now resolves the latest assignment by `project_code` + `frame_id` (or by id within project) without excluding hidden technician-dashboard rows; director register uses latest assignment id per panel.
- **Director dashboard:** read-only submitted register only — one compact project card per project with nested panels and **View Report** (existing `ReportPreviewModal`); global KPIs/large workspaces removed from this page.
- **Supervisor Status live matrix:** panel rows show **total** and **completed** cable counts; project rows show panel count and completed count; assignment lookup keyed by `project_code::frame_id`.
- **Additive API:** `GET /api/supervisor/project-live-summary` (read-only, cached) for compact smart-card payloads.
- **QA/QC dashboard:** badge **Under Development**; production supervisor director submit remains available when `QA_QC_WORKFLOW_ENABLED` is false (unchanged gates).

## 2026-07-19 — Repository-clean follow-up: frontend build fix, test root-cause fix, async Excel/PDF jobs

Follow-up to the Redis infrastructure audit below. Full detail in the report's "Addendum (2026-07-19)" section: `docs/DWES-REDIS-INFRASTRUCTURE-AUDIT-REPORT.md`.

- **Frontend build fixed (was exit 2, now exit 0):** removed an unused variable in `DiagnosticsTab.tsx`; fixed a literal-type-widening TS error in `PanelsTab.tsx`; fixed 11 `@apply <plain-class>` call sites in `design-system.css` that Tailwind v4 rejects outright (unrelated pre-existing bug the TS fixes exposed one build stage later). Zero visual change, 55/55 frontend tests pass.
- **Backend test fixed at the root cause:** `ProjectsService.submitToDirector per-panel writes one audit when wiring is complete` had a stale test fixture (wired the fake assignment onto `findFirst`, which that code path never calls — the real code correctly uses `findMany`+`orderBy`+`take:1` to get the *latest* assignment for a frame). Fixed the fixture, not the implementation. Added a companion idempotent-retry regression test for the same branch (one audit row, one SSE publish, `idempotent: true` on replay).
- **Real async Excel/PDF processing added**, gated by `DWES_ASYNC_EXCEL_PROCESSING` / `DWES_ASYNC_REPORT_GENERATION` (both default off): new `JobsService.registerHandler` pluggable-handler mechanism (mirrors the existing `ga-foundation/job-queue.service.ts` pattern) lets `UploadService`/`WiringDocumentService` supply real job logic that calls their exact existing synchronous methods — zero duplicated parsing/report logic, zero change to any existing endpoint. 8 new tests, including a real end-to-end `.xlsx` upload through the job queue.
- Backend: 169/169 tests pass. Frontend: 55/55 tests pass, build exit 0.

## 2026-07-18 — Redis infrastructure audit: defect repair + real-Redis runtime verification

Audited the existing Redis/BullMQ/Pub-Sub/cache/idempotency infrastructure (backend/src/jobs, backend/src/common/cache, backend/src/events, backend/src/common/guards/idempotency.interceptor.ts, backend/src/common/health.service.ts). No new Redis client, queue, cache, or event bus was introduced — all fixes are inside the existing modules.

- **Critical fix:** `JobsService.updateJobProgress` wrote a `progress` field that has no column on `background_jobs` — every Postgres write threw and was silently swallowed, freezing every BullMQ-backed job (including `backup_export`) at `QUEUED` forever even though the work genuinely ran. Confirmed live against Postgres before and after the fix.
- **Idempotency:** concurrent duplicate requests (same `X-Idempotency-Key`) previously got an immediate `409`; they now wait for the in-flight request and replay its exact result. Verified live: 10 concurrent requests across two backend instances → 1 mutation, 1 audit row, identical response body on all 10.
- **Event duplication:** a replayed idempotent response could still re-trigger `EventsInterceptor` (duplicate SSE publish + cache invalidation). Fixed with an explicit `req.__dwesIdempotentReplay` marker, independent of global-interceptor ordering.
- **Health/readiness:** `/api/health/ready` now reports live Redis status for the queue, cache, and SSE fan-out, and an additive `ready`/`degraded` distinction (existing `status` field unchanged for compatibility). Verified live: stopping Redis flips `degraded: true` within one request; the app stays up and serves traffic throughout.
- **Reconnect accuracy:** `DashboardCacheService` and `JobsService` previously latched Redis-active flags at startup and never revisited them — a later outage was invisible to health checks and idempotency locks would fail closed. Now tracked via ioredis `ready`/`error` listeners; verified live stop/restart of Redis with automatic recovery (<1s) and zero duplicate jobs/mutations across the transition.
- **DWG conversion:** the generic job queue's `dwg_convert` type fabricated a fake "converted" result; it now fails with a clear configuration error (the app's real DWG path is `ga-foundation`'s `CadProviderRegistry`/LibreDWG, already correct). Unknown job types now fail clearly instead of silently completing with an empty result.
- **`backup_export`:** replaced a blocking `spawnSync` (freezes the whole Node event loop — HTTP, SSE heartbeats, DB health checks, BullMQ lock renewal — for up to 10 minutes) with a non-blocking `spawn`.
- Dashboard cache reads (`supervisor:allPanels`, `director:core`/`stats`/`projectsSummary`) switched from memory-only `get()` to `getAsync()` so a warm Redis entry is actually reused across instances.
- Documented `REDIS_URL` and the per-subsystem enable flags in `backend/.env.example` (previously undocumented).
- New tests: `backend/test/idempotency-interceptor.test.cjs`, `backend/test/dashboard-cache.test.cjs`, `backend/test/jobs-service.test.cjs`.

Real-Redis runtime verification (Windows-native `redis-server.exe`, two backend instances on :3002/:3003, same Postgres DB): BullMQ job lifecycle QUEUED→PROCESSING→COMPLETED, cross-instance Redis Pub/Sub delivery, 10-way concurrent idempotency, Redis cache cross-instance reuse, and full stop/restart resilience all confirmed with live evidence (see audit report).

## 2026-07-18 — Top-bar profile card + supervisor Project Information layout

- Global header user profile (`Topbar.tsx`): permanent white 3D-style capsule (`topbar-user-card--profile`) with dark readable name, @username, and role in all themes; size, position, auth, and actions unchanged.
- Supervisor Projects: removed nested “Project & Panel Overview” wrapper; overview grid renders directly inside `Project Information` with the same data and actions.

## 2026-07-18 — Background `backup_export` wired to real backup

- `JobsService.runBackupExportJob` runs `scripts/backup.ps1` (same as `npm run backup`) with `DWES_BACKUP_TRIGGER=background-job`; job result includes parsed `backup-report.json` from the latest backup folder.
- `POST /api/jobs/backup-export` (Production Supervisor, System Administrator) enqueues the job; Operations Centre **Full backup** button calls it.
- Exit 0/2 treated as success (2 = warnings); exit 1 fails the job. Windows + PowerShell required.

## 2026-07-18 — Unified DWES loading indicator (UI only)

- Added reusable blue 3D-style circular loader (`DwesLoadingIndicator` and helpers in `src/components/ui/Skeleton.tsx`, re-exported from `DwesLoadingIndicator.tsx`).
- Replaced plain-text, skeleton-table, and inconsistent spinners across role dashboards, modals, PDF/file viewers, twins, and wiring workspaces with centered in-card loaders; technician wiring keeps schedule visible under a light overlay while saving.
- CSS: `.dwes-loader*` tokens in `design-system.css`. No API, business logic, layout shell, or workflow changes.

## 2026-07-18 — Technician Single-Wire action buttons (SKIP & OPEN END)

- **SKIP button:** Renamed the `Next / Complete Wire` action button to `SKIP` in the single-wire execution view. Its exact existing Next/Complete functionality (`doCableAction('complete')`) remains unchanged.
- **OPEN END button:** Replaced the separate `Source End Open` and `Destination End Open` buttons with a single `OPEN END` button placed beside `SKIP` on the right.
- **Open End business workflow:** Clicking `OPEN END` marks the current cable as completed with an open end (calling `doCableAction('source_end_open')` under the hood). The status chip displays `Open End` with the orange `open-src` tone.
- **Report integration:** Updated the panel completion report helper (`panel-completion-report.helper.ts`) to correctly count completed open-end cables (by checking both `st.openEnd` and legacy partial states). The reports (PDF and dashboard previews) are updated with the project, panel, cable/row ID, technician, and timestamp details from the audit log and per-cable notes.

## 2026-07-18 — Top-bar action tiles: theme / fingerprint / logout redesign

- The three action buttons are now uniform premium tiles: 36×36 (logout wider with label), 10px radius, per-hue gradients with crisp top/bottom bevels — glass slate theme tile, saturated blue fingerprint, red logout — plus hue-matched glow on hover, pressed inset on active, `:focus-visible` rings.
- Icons switched from the 3D WebP pack to professional monochrome **Material Symbols** glyphs (`palette`, `fingerprint`, `logout`) with white high-contrast rendering and subtle depth shadow; menu/close and dashboard icons unchanged.
- All behaviour preserved: tooltips, aria labels, theme menu + switching, fingerprint panel (incl. §1.5 disabled/unsupported/error variants kept authoritative via `:not()` guards), logout flow.
- Profile card, clock, logo, header size/background untouched (re-verified 44px cards, content intact).
- Files: `Topbar.tsx` (3 icon swaps + import), `themes.css` (§1.6 tile styling).

## 2026-07-18 — Top-bar right-side controls premium 3D refresh

- User card, actions capsule (theme / fingerprint / logout), and clock card unified at **44px** height, 12px radius, layered 3D gradient surfaces with inset highlights and professional shadows; hover deepens shadow, buttons lift on hover and press on active; `:focus-visible` rings added.
- Fixed pre-existing defect: capsule buttons were inflated to 48px by the global button touch-target floor and bled out of the 38px capsule; now explicit 36px with pinned `min-height`/`min-width` (repo-known pattern).
- Theme button is a raised glass tile; fingerprint and logout keep their gradients and all state variants (enrolled dot, disabled/error); clock digits 16px with stronger contrast.
- Scoped entirely under `[data-theme] .topbar-controls` in `themes.css` — logo, brand, nav tabs, sidebar, and left side untouched; all behaviour (profile modal, theme switch, passkey panel, logout, live clock) unchanged.
- Verified live: equal heights/no overlap/no clipping at 1440×900 and 1024×768; 8/8 functional checks.

## 2026-07-18 — Technician DWS 3D cable visual + centred label & headers

- **Cable Visual (active single-wire row only):** thin line replaced with a 3D-style straight single-core cable — CSS-gradient insulation cylinder in the row's `WIRE COLOR` (bi-colour e.g. GREEN/YELLOW renders as longitudinal stripe) with stripped copper conductor tips at SRC/DST. No external image, watermark, or 3D library.
- Diameter is proportional to `WIRE SIZE` (`wireSizeCableDiameter`: 12–26px @ zoom 1; 1.5→16px, 2.5→20px); width stays length-proportional; scales with the existing `--dwf-cv-zoom` row zoom.
- `Colour · Size · Length` label is slightly larger (15px @ zoom 1) and exactly centred beneath the cylinder for every cable length/colour/size/column width and zoom (path group now `justify-content: center`).
- Single-wire header: checkbox + Excel header name centred as a pair per column (horizontal + vertical); Full Wiring View and supervisor tables stay left-aligned.
- Full Wiring View / supervisor mini cells, Excel headers/data, hide/show persistence, workflow controls, progression, APIs, and layout unchanged.
- Files: `CableVisualPath.tsx`, `wiring-utils.ts` (additive helper), `design-system.css`.

## 2026-07-18 — Technician DWS hidden columns persist per technician

- Single-wire view column hide/show now survives cable navigation, pause/resume, page refresh, dashboard reopen, and logout/login: hidden-column ids are stored in `localStorage` under `dwes_dwf_hidden_columns:<userId>` (per technician account, per device).
- Re-checking a hidden column restores it at its original Excel position (existing ordered-filter rendering unchanged); unhiding everything removes the storage key.
- Ids not present in the current schedule are kept, so a column stays hidden when the technician returns to a schedule that has it; a different technician on the same device is unaffected.
- Excel data, APIs, workflow, layout, zoom, Full Wiring View, and supervisor views unchanged.
- Files: `DigitalWiringFrame.tsx` only.

## 2026-07-18 — Technician DWS active-row zoom + larger Cable Visual default

- Cable Visual in the single-wire execution view is larger by default (18px path, 12px label, bigger SRC/DST terminals, thicker data-driven wire stroke) and centred in its column.
- Two small dark Zoom In / Zoom Out buttons sit in the white exec toolbar (between **Full Wiring View** and the cable counter), approximately above the CABLE VISUAL column; compact 28×24px, exempt from the global 48px touch-target floor.
- Zoom scales the **entire active cable row** together (all Excel cell values, fonts, padding, row height, illustration, SRC/DST labels, colour·size·length label) via a `--dwf-cv-zoom` CSS variable set inline on the row; steps 0.15, clamped 0.7–1.6, default 1.0; state local to the view.
- Table header, Excel headings, column order, Full Wiring View, action bar, progression, APIs, and data binding unchanged; oversize rows use the existing horizontal scroll (no page overflow, no column misalignment).
- Files: `DigitalWiringFrame.tsx`, `CableVisualPath.tsx` (optional `zoom` prop, default 1 — supervisor/full-view call sites unaffected), `design-system.css`.

## 2026-07-18 — Technician Panels heading shows live Project — Panel

- Technician Dashboard section heading uses live assignment selection: `Project Name — Panel Name` (prefers `project_name` over `project_code`).
- Generic **Panels** title only when no panel is selected/assigned; updates immediately when the selected assignment changes.
- Nav tab label stays **Panels**; heading rendered via `SectionHeader` + `hideTabSectionHeader` (same pattern as Supervisor/Director).

## 2026-07-18 — Cable Visual driven by Excel row colour / size / length

- Cable Visual Path now resolves colour, size, and length from the selected wiring-schedule row (`_raw` + supervisor mapping), so the illustration matches the Excel cells after upload.
- Revised schedule re-uploads refresh technician DWS and supervisor preview automatically (`onFramesChanged`).
- Unit test: `tests/cable-visual-data.test.ts` (ENOWA headers + mapped aliases + metric update).

## 2026-07-18 — Excel-aligned Cable Visual placement (ENOWA)

- Cable Visual sits between source ferrule (`IEC_FERR_A`) and destination ferrule (`IEC_FERR_B`) per `=H00+R.xlsx` column order.
- Upload parse keeps that empty Excel column as **Cable Visual**; UI injects the same slot for older frames that dropped it.
- Technician Digital Wiring Schedule: mid-row compact illustration; Full Wiring View mini path column.
- Supervisor Digital Wiring Schedule preview: same Cable Visual column (colour + length bar) after upload.

## 2026-07-18 — Remove technician dashboard 2D Operational Twin button

- Removed the **2D Operational Twin** action from Technician Dashboard `PanelsTab` (button, modal mount, and exclusive open state).
- Digital Wiring Schedule, Current Assignment, Mid Change, Complete/Submit/Hide flows unchanged.
- `CableDigitalTwinModal` / OT2D components and APIs remain in the repo (not deleted); supervisor twin entry points unchanged.

## 2026-07-18 — Dashboard 3D icon migration (CC0)

- Role dashboards (Supervisor, Technician, QA/QC, Admin, Director), workspace sidebar, and topbar controls now use filled 3D **3dicons.co V1 Color/Dynamic** WebP icons (CC0-1.0 commercial use).
- Assets live under `src/assets/dashboard-icons/` with LICENSE + `manifest.json`; rendered via `DashboardIcon` + typed registry.
- Unique source asset per semantic function; Material Symbols retained for non-dashboard workflow UI (forms, wiring workstation, modals, viewers).
- Validation: `node scripts/validate-dashboard-icons.mjs`.

## 2026-07-18 — Technician Digital Wiring Schedule one-cable redesign

- Clean DWS header: project name, panel name, panel type, Acknowledge/Start, Pause, Tablet View (KPI/timer/twin removed from this page).
- Permanently removed Operational Twin content from Digital Wiring Schedule (OT2D/OT3D/twin modal/button).
- Single active cable shows supervisor-selected Excel columns; modern single-conductor illustration (colour/size/length/ferrule/sign).
- Action bar: Previous · Source End Open · Destination End Open · Next/Complete Wire.
- Open-end actions complete the cable with additive `openEnd` + note + audit (`cable_src_open` / `cable_dst_open`) in `cable_status` JSON — no schema migration.
- Pause / Mid Change workflows unchanged.

## 2026-07-17 — Demo 3D from front + rear GA faces only

- Engineering Convert Step 3: **Demo 3D from faces only** builds a panel box textured with enrolled Front + Rear layout images (no mapping, no wiring, not Approved Exact Route).
- Full OT3D preview remains separate; when OT3D is not ready, Demo 3D opens automatically if both faces exist.
- Default panel mm 800×2000×600 until GA asset-set dimensions are set.

## 2026-07-17 — Engineering: one multi-page GA PDF for front + rear

- Convert Step 1 default: **One PDF (front + rear pages)** — same file (e.g. H00+R) enrolled as Front and Rear sources; pick different pages when cropping.
- Separate front/rear files remain available as an alternate mode.

## 2026-07-17 — Engineering: GA layout-only convert with visible front/back preview

- **Convert GA → 3D Operational Twin** is now the default Engineering tab (wiring schedule moved to optional tab).
- **Step 1:** Quick upload front + rear GA layout PDFs (`GaLayoutQuickUpload`) — drawing only, no Excel required.
- **Visible 2D preview strip** (`GaFacePreviewStrip`) shows enrolled front and rear faces before 3D preview.
- **Preview 3D** required before **Approve & release** is enabled (supervisor eye verification).
- Face save in GA enrollment emits workflow refresh so previews update immediately.

## 2026-07-17 — Supervisor Engineering: Convert / Preview / Approve OT3D

- Production Supervisor **Engineering** button (Projects tab) opens `EngineeringWorkspaceModal` with:
  - **Package upload** — wiring schedule + Flat 2D GA layout (not cover-only / not schematic-as-geometry).
  - **Convert to 3D Operational Twin** — embeds `GaFoundationWorkspace` (GA Foundation nav tab stays hidden), Preview via `engineeringApi.operationalTwin3d` + `OperationalTwin3D`, Approve via `gaApi.release`.
- Honest Twin Not Ready when geometry/mapping/release incomplete; no fabricated cubes. Phase 3 auto PDF→device extract still not production-ready.
- Assign technician + wiring schedule unchanged; OT3D for assigned tech still gated by release + `VITE_ENABLE_OPERATIONAL_TWIN_3D`.

## 2026-07-17 — Remove Approved Drawing from Technician Dashboard

- Removed the **Approved Drawing** dashboard action and classic `PanelGaDrawingModal` open path from technician `PanelsTab.tsx` only.
- Preserved **Digital Wiring Schedule** and **2D Operational Twin** on the technician dashboard. Supervisor drawing upload/view and twin-internal drawing paths unchanged.

## 2026-07-17 — OT3D: do not close Cable Digital Twin on 3D readiness 403

- Fixed `PanelGaDrawingModal`: when `VITE_ENABLE_OPERATIONAL_TWIN_3D` is on, an OT3D API 403/404 (e.g. GA not released) no longer calls `onClose()` and dismisses the whole modal. 2D Operational Twin stays open; 3D shows its unavailable / Twin Not Ready fallback only.
- Technician access path unchanged: no dedicated dashboard “3D” button — OT3D embeds under Digital Wiring Schedule and under the **2D Operational Twin** / Cable Digital Twin `ot2d` surface when the flag is enabled.

## 2026-07-17 — Hide GA Foundation from Production Supervisor nav

- Removed the **GA Foundation** tab from Production Supervisor dashboard navigation (`SupervisorDashboard.tsx`). Projects + Status remain. `GaFoundationWorkspace` / `DrawingsTab` code retained (not deleted) for later re-enable.

## 2026-07-17 — Restore Approved Drawing on Technician Dashboard

- Restored **Approved Drawing** as a third dashboard-only action beside Digital Wiring Schedule and 2D Operational Twin (`PanelsTab.tsx`).
- Opens classic read-only drawing viewer (`PanelGaDrawingModal` without twin mode). Closes on panel/project delete. Not added to other roles.

## 2026-07-17 — Enterprise Twin Phase 2 polish + release checklist

- **Upload Engineering Package:** shows bold **TOTAL CABLES** from `readHeaders` and PDF **DRAWING PAGES** inventory before upload; guides supervisor to GA Foundation after package.
- **GA Foundation release gate:** explicit readiness checklist (GA confirmed, mapping confirmed, schedule present, finalization queue clear); blocks release while unresolved exceptions remain; clarifies Twin Not Ready / 2D fallback until release.

## 2026-07-17 — Enterprise Twin Phase 1–2 (Director demo track)

- **Phase 1 unblock:** Live 3D flag enabled locally (`VITE_ENABLE_OPERATIONAL_TWIN_3D=true`, `VITE_OT3D_QUALITY=tablet` in UTF-8 `.env.local`); GA Foundation tab mounted in Supervisor dashboard; Cable Digital Twin modal loads OT3D when released; `technicianId` preserved for `my_wires` Mid Change attribution; Twin Not Ready when GA/mapping incomplete; 2D fallback retained.
- **Phase 2 start:** New **Upload Engineering Package** toolbar action + `EngineeringPackageUploadModal` — uploads approved drawing then hands Excel into existing `UploadFrameModal` mapping workflow; separate Wiring Upload / Drawing buttons kept as fallbacks.
- Login `#root` verified rendering (blank-screen issue cleared for clean session).

## 2026-07-17 — 2D/3D Operational Twin audit, cleanup, and readiness fixes

- Standardized **Twin Not Ready** messaging (`src/constants/twinMessaging.ts`) across 2D modal fallback, 3D viewer, and assignment empty states.
- 3D Operational Twin now refuses to render legacy/unreleased GA payloads (`isOperationalTwin3dReady`); shows **Twin Not Ready** instead of synthetic legacy geometry.
- OT3D execution wire state now scopes to the requesting technician assignment (prevents cross-technician execution bleed).
- Removed confirmed-unreferenced twin code: `GaDrawingViewModal`, `DigitalTwinMappingEditor`, `EngineeringImportModal`, `mappingDrafts.ts`, and `scripts/_tmp_*.cjs` scaffolds.
- Retained intentional 2D fallback (`OperationalTwin2D` + Mode B schematic) and flag-gated Flat/Engineering 3D tabs (`VITE_ENABLE_PANEL_3D`).

## 2026-07-17 — Centralized permanent-delete (project & panel)

- Extended `backend/src/common/project-delete.util.ts` with **`permanentlyDeletePanel`** (transactional twin/GA/QA/assignment purge + tombstone + file cleanup) alongside existing **`permanentlyDeleteProject`**.
- Wired supervisor/admin project delete and panel `remove` / `deleteFrameGuarded` through the shared orchestration paths; added `permanent_delete` audit rows after purge.
- Role guards: Production Supervisor **and** System Administrator on project DELETE and panel delete/precheck/guarded routes.
- SSE: `EventsInterceptor` now treats `POST …/hard-delete` and `POST …/delete-guarded` as **`deleted`** so all role dashboards drop stale selections via `useServerEvents` → `emitFramesChanged`.
- Confirmation copy updated for accurate project/panel scope (twin, QA, Mid Change, files retained vs removed).

## 2026-07-17 — Technician assignment isolation

- Only the assigned technician may access panel work: shared `assertTechnicianAssignedToFrame` guards engineering twin APIs and GA correlation-map; SSE audience re-reads assignments per event (no stale 10s cache).
- Technician UI shows **NO PANEL WORK ASSIGNED** with no action buttons when unassigned; assignment SSE immediately refreshes and revokes prior technician access; twin/wiring modals close on 403/404 or assignment events.
- Supervisor, QA/QC, Director, and Admin permissions unchanged.

## 2026-07-17 — Technician stale-state fix after project/panel delete

- Backend `myPanels` / `myAssignmentDetail` now filter orphaned assignments (inactive/deleted project or blocked panel) and return clean 404 for invalid IDs.
- Technician dashboard clears stale `selectedPanel`, wiring workstation, twin modals, and live-wiring store on SSE `frames-changed` delete events; silent refresh no longer preserves removed assignments.
- `WiringWorkstation` aborts in-flight loads, exits on 404/410, and stops the “Loading wiring schedule…” loop when an assignment is deleted mid-session.
- Shared `assignmentMatchesDeletion` helper aligns panel/project delete handling across technician UI and storage purge.

## 2026-07-17 — Project Status → Project State (read-only)

- Renamed user-facing **Project Status** labels to **Project State** / **Project state** (Overview FieldGrid, Edit Project modal, director Excel/CSV headers for `project_state`).
- Edit Project modal: Project State is **read-only** badge (automatic from assignment/workflow); removed editable `<select>` and `projectsApi.setState` on save.
- Preserved DB column `project_state`, Status Workspace nav label, and `PROJECT_STATUS.md` doc title.

## 2026-07-17 — Technician Dashboard: single Current Assignment card

- Removed **My Assigned Panels** list from the Technician Dashboard (`PanelsTab.tsx`); only one **Current Assignment** card remains.
- Project name + panel name shown prominently; essential details (type, voltage, client, assigned time, cables, state, progress) kept on the card.
- Compact **No Panel Assigned** empty state when none assigned; Digital Wiring Schedule / 2D Operational Twin stay disabled until an active assignment exists.
- Complete / report / hide actions moved onto the Current Assignment card; Mid Change strip and SSE refresh via existing `useDwesRefresh` preserved.

## 2026-07-17 — Panel Report consolidation (remove Project Executive Report)

- Removed **Project Executive Report** card and `ProjectPdfPreviewModal` wiring from supervisor Status workspace (`CompactStatusWorkspace.tsx`); per-panel **Panel Report** remains with multi-panel rows unchanged.
- Standardized user-facing name to **Panel Report** everywhere (Status card title, preview modal, on-screen preview header, PDF/Excel export title via `PANEL_REPORT_TITLE` in `panel-completion-report.helper.ts`).
- Cleaned unused **Overall Project Report** row from legacy `ReviewApprovalWorkspace.tsx`. Backend project-level `report-pdf` API preserved (no route removal).
- **Verify:** `npm run build` exit 0; grep confirms no user-facing "Project Executive Report" or "Panel Report - Live".

## 2026-07-17 — Excel Wiring Upload: show all rows + direct upload

- Fixed `readHeaders` so worksheets return full `sample_rows` / `data_row_count` (regression had empty `rows: []`), preserving the first cable row.
- Removed worksheet search/filter UI; Select All + column checkboxes remain for column choice.
- Replaced Validate & Preview with direct **Upload Wiring Schedule**; essential checks only (file, headers, required mapping, non-empty rows).
- Header shows **TOTAL CABLES: [count]** plus parsed / selected / mapped / unmapped column chips.

## 2026-07-17 — Supervisor Drawing toolbar opens upload modal

- Toolbar **Drawing** button now opens `PanelDrawingUploadModal` for the active project/panel (2D slot), with toast guards when none selected.
- **Drawing View** still opens `PanelGaDrawingModal`; upload success refreshes drawing availability.

## 2026-07-17 — Shared action status popups

- Added `ActionStatusPanel` and upgraded `AppDialogProvider` confirms with entity, action summary, removal list, status badge, and progress.
- Standardized destructive confirms to **Cancel** + **Delete Permanently**; replaced remaining `window.confirm` with shared dialogs; upload drawing modals show clear Uploading/Completed/Failed status.

## 2026-07-17 — Status Workspace All Projects / Selected Panel

- Redesigned Status Workspace into two views: **All Projects** (KPI row + expandable project/panel rows) and **Selected Panel** (Technician Activity + Panel Report details).
- Live data from projects, frames, and supervisor assignments; SSE/workflow refresh preserved; no duplicated other-panel report list in Selected Panel.

## 2026-07-17 — Topbar login-theme colour alignment

- Added `--t-login-hero-stop-*` palette tokens and composed `--t-header-bar` (darker navy→indigo gradient), border, shadow, and accent from active login-hero tokens.
- Wired `[data-theme] .topbar` and design-system fallbacks to `--t-header-bar`; removed hard-coded topbar gradient fallback.
- Preserved layout, controls, user card, clock, and aurora role theme overrides.

## 2026-07-17 — Shared compact dashboard header card

- Redesigned `DashboardPageHeader` as a compact elevated rounded card (tinted background, border, shadow) within the content column.
- Title + role/employee ID stacked left; workspace badge as right-aligned pill; tablet-safe wrap without clip.

## 2026-07-17 — Project & Panel Overview compact card

- Replaced four stacked section headers (Project Summary, Selected Panel, Assigned Technician, Wiring Progress) with one `Project & Panel Overview` card in supervisor Projects tab.
- Responsive 2-column grid on tablet; technician and wiring progress span full width in compact rows.
- Status badges (Not Started, Not Assigned) and slim progress bar; filled icons in group labels.

## 2026-07-17 — Controlled project data reset + full deletion cascade

- Extended `backend/src/common/project-delete.util.ts` with comprehensive project purge (engineering/GA/Twin tables, workflow data, session logs, uploads, MockStore caches).
- Wired purge into `admin.service.ts` (`resetAllProjects`, `hardResetProject`, `hardDeleteProject` precheck) and `dev.service.ts` (`hardReset`).
- Added `backend/scripts/project-data-reset.mjs` for backup, inventory, wipe, zero-count verification, and smoke test.
- Executed one-time reset: 1 project, 493 session_log rows, 1 file_hash, 2 upload folders removed; 41 users preserved.
- Backend tests: 137/137 pass; `npm run build` exit 0.

## 2026-07-17 — Shared working-page action buttons (compact, uniform height)

Unified Supervisor Projects toolbar + Project Information actions: same 36px/44px height, 18px icons, 10px radius, auto width (no flex-grow or fixed min-width stretch), left-aligned wrap. Shared `.pj-action-btn__icon` / `__label` structure on all nine buttons.

- **Files:** `design-system.css`, `buttons.css`, `themes.css`, `ProjectsTab.tsx`
- **Build:** `npm run build` exit 0

---

## 2026-07-17 — Supervisor project toolbar uniform action buttons

New Project, Wiring Upload, Workflow, Drawing, and Users now share fixed dimensions (9.75rem × 36px desktop / 44px touch), equal icon column, centered labels, and consistent filled 18px icons via `.pj-action-btn` / `__icon` / `__label` in `design-system.css` and `ProjectsTab.tsx`. Wrap preserved on narrow widths.

- **Build:** `npm run build` exit 0
- **Git:** no commit

---

## 2026-07-17 — Launcher fix: blank window on “already running”

When the stack was already healthy, `launch-dwes.mjs` could open a second chromeless window via `--app-id` (no URL) or duplicate `--app=` instances — often blank on Windows. Now always opens `--app=<url>`, and when services are up prefers focusing an existing DWES Chrome/Edge window before spawning a new one.

- **File:** `scripts/launch-dwes.mjs`
- **Verify:** `node --check scripts/launch-dwes.mjs`; re-run desktop **DWES — Start Application** while stack is up

---

## 2026-07-17 — Shared compact sidebar modernization (icons, labels, wrap)

Fixed clipped sidebar icons/labels on the fixed 5.75rem compact rail: filled Material Symbols (Workspace + nav), larger icon boxes (28px nav / 24px workspace), two-line label wrap with `-webkit-line-clamp: 2`, improved vertical rhythm, and clearer inactive icon contrast. Width unchanged; no expand/collapse. Scope: `Sidebar.tsx`, `design-system.css`, `icons.css`, `tabs.css` only.

- **Build:** `npm run build` exit 0
- **Browser:** login required (backend not running in verify session); manual smoke on `/technician`, `/supervisor`, `/qaqc` at 768px+ recommended
- **Git:** no commit

---

## 2026-07-17 — Project completion & report package (Live 3D Twin + Panel Completion)

Master handoff and panel completion operational guides for stakeholders and pilot leads. Re-verified: typecheck/build/lint PASS; backend **137/137**; frontend focused **55/55** (`test:ot3d` **26/26**); combined **192/192**. Release: **READY FOR CONTROLLED PILOT** (PASS WITH WARNINGS).

- **Docs:** `docs/DWES-LIVE-3D-TWIN-PROJECT-COMPLETION-REPORT.md`, `docs/DWES-PANEL-COMPLETION-REPORT-GUIDE.md`, expanded `LIVE-3D-TWIN-POST-IMPLEMENTATION-FINAL-REPORT.md`, `DWES-WHOLE-PROJECT-HARDENING-FINAL-REPORT.md` (test matrix)
- **Code fixes (same session):** 3D live painting, correlation-map API, supervisor Operational Twin tab, TS/lint clean
- **Regenerate docs:** `node scripts/write-handoff-docs.cjs`
- **Git:** no commit

---

## 2026-07-17 — Whole-project hardening pass

H0-H16 audit per DWES_Whole_Project_Hardening_FINAL.md. Lint restored (removed corrupt scripts/_inspect-enowa-xlsx.mjs). Full regression: backend 137/137, frontend focused 55/55, lint exit 0, npm audit 0 prod vulns. Release: READY FOR CONTROLLED PILOT.

- Docs: DWES-WHOLE-PROJECT-HARDENING-* reports
- Git: no commit

---

# DWES Changelog

Append-only log of scoped changes. Each entry includes a restore-point reference when git is in use.

Format: `YYYY-MM-DD` ? prompt/source ? summary ? files ? restore point ? flags

---

## 2026-07-17 — Post-implementation verification (Live 3D Twin)

Independent V0–V10 verification per `DWES_Post_Implementation_Verification_Hardening_FINAL.md`. Automated: typecheck/build PASS, backend **137/137**, frontend focused **55** (ot3d 26 + twin/state/panels/schematic/pwa). Removed corrupt temp `scripts/write-twin-files.*` (DEF-001). Security: no Critical/High in feature paths. Release decision: **READY FOR CONTROLLED PILOT**.

- **Docs:** `LIVE-3D-TWIN-POST-IMPLEMENTATION-*`, `LIVE-3D-TWIN-SECURITY-REVIEW.md`, `LIVE-3D-TWIN-PERFORMANCE-REPORT.md`, `LIVE-3D-TWIN-DEFECT-REGISTER.md`, `LIVE-3D-TWIN-E2E-VERIFICATION-MATRIX.md`
- **Open:** authenticated E2E (DEF-003), tablet FPS (DEF-004), my_wires filter (DEF-002)
- **Git:** no commit

---

Implemented panel-scoped GA Foundation per `DWES_Phase0_Phase1_Foundation_Implementation_FINAL.md`: immutable PDF/DWG/DXF uploads, PDF.js page/crop face workflow, PostgreSQL-backed GA Asset Set and Mapping Catalog, deterministic correlation with exception-only finalization, background CAD conversion jobs (LibreDWG external-process), and server-enforced release gate on TechService wiring actions for enrolled panels. Supervisor UI: `GaFoundationWorkspace` on Drawings tab.

- **Backend:** `backend/src/ga-foundation/*`, `upload.service.ts`, `tech.service.ts`, `schema.prisma`, migration `20260717121500_live_3d_twin_phase1`
- **Frontend:** `GaFoundationWorkspace.tsx`, `DrawingsTab.tsx`, `gaApi` in `api.ts`
- **Tests:** `backend/test/ga-foundation.test.cjs` (10); full backend **127/127** PASS
- **Docs:** `docs/LIVE-3D-TWIN-PHASE-1-PROGRESS.md`, `docs/LIVE-3D-TWIN-PHASE-1-REPORT.md`
- **Build:** `npm run build` exit 0; `npm run typecheck` PASS
- **Lint:** pre-existing FAIL (`scripts/_inspect-enowa-xlsx.mjs` invalid UTF-8)
- **Git:** no commit (dirty worktree overlap; author review)

---

## 2026-07-17 — Workspace header bar fix (Projects + all roles)

Fixed the Supervisor **Projects** tab header to match **Project Information** / **Project Summary** style: unlayered `.workspace-section-heading` CSS (light bar, bold dark-blue `#1B2958` title, icon, spacing). Wired `WorkspaceSectionHeading` with `FolderKanban` icon on Projects; `SupervisorSectionHeader` now delegates directly; tab `SectionHeader` moved inside `nav-tab-panel`; Technician + Admin tab descriptions enabled.

- **Files:** `design-system.css`, `tokens.css`, `themes.css`, `SupervisorDashboard.tsx`, `SupervisorSectionHeader.tsx`, `DashboardShell.tsx`, `TechnicianDashboard.tsx`, `AdminDashboard.tsx`, supervisor section headers
- **Build:** pending verification

---

## 2026-07-17 — Shared bold blue dashboard + workspace header typography

Refined main dashboard headers and workspace/card section headers across all five role dashboards: **medium-large bold blue** (`#1D4ED8`) titles via shared tokens, improved title/subtitle/badge spacing and grid alignment on tablet+.

- **Tokens:** `--dwes-header-title-blue`, `--dwes-header-title-size-section`, `--dwes-header-title-size-page` in `tokens.css`
- **Main header:** page title `clamp(1.5rem–1.75rem)` bold blue; subtitle `#475569`; badge grid-aligned right on title row (768px+)
- **Workspace/card headers:** `WorkspaceSectionHeading`, `.card-title`, `.app-section-title`, `.pj-project-info-section-title` → medium-large bold blue
- **Roles:** Supervisor, Technician, QA/QC, Operations Director, System Administrator (Sales Director excluded)
- **Files:** `tokens.css`, `design-system.css`, `themes.css`
- **Build:** pending verification

---

## 2026-07-17 — Shared navy dashboard + workspace header typography (superseded)

Standardized main dashboard headers and workspace/card section headers across all five role dashboards: large bold **#1B2958** navy titles, aligned title/subtitle/badge rows, light card-header bands for internal sections.

- **Main header:** `clamp(1.375rem–1.875rem)` title, subtitle `#475569`, badge right-aligned on title row
- **Workspace/card headers:** `WorkspaceSectionHeading` — larger navy titles, light `#F8FAFC` band + border
- **Also:** `.card-title`, `.app-section-title`, `.pj-project-info-section-title` → navy
- **Roles:** Supervisor, Technician, QA/QC, Operations Director, System Administrator (Sales Director excluded)
- **Files:** `design-system.css`, `themes.css`, `WorkspaceSectionHeading.tsx`, `SectionHeader.tsx`
- **Build:** `npm run build` exit 0

---

## 2026-07-17 — Login app-name premium gradient + shimmer

Elevated the login brand title (**DWES** / **Digital Wiring Execution System**) with a white→ice→teal logo-palette gradient, soft glow, and a slow 9.5s shimmer motion (disabled under `prefers-reduced-motion`).

- **Files:** `src/styles/design-system.css`, `src/styles/themes.css`
- **Verified:** login `/` — `background-clip: text`, animation `login-brand-title-shimmer` on acronym + name; auth/layout unchanged
- **Git:** no commit

---

## 2026-07-17 — Branded desktop/PWA window identity

Updated the browser/PWA window title to **DWES — Digital Wiring Execution System | Ingenious Network FZC** and strengthened the small-size app icon used by desktop shortcuts, browser tabs, and PWA windows.

- **Native window controls:** intentionally remain OS-owned and unchanged; this Vite/PWA app does not replace Windows minimize, maximize, or close controls.
- **Title-strip branding:** document title, PWA manifest name, and navy `theme_color` align with the Ingenious Network palette.
- **App icon:** canonical Ingenious orbital mark is now framed by a deep-navy tile and white inset for clear recognition at title-bar/favicon sizes.
- **Generated assets:** refreshed `favicon.ico`, `app-icon.ico`, PWA icon PNGs, and Apple touch icon from `public/app-icon.svg`.
- **Files:** `index.html`, `public/manifest.webmanifest`, `public/app-icon.svg`, `public/favicon.svg`, generated `public/icons/*`, `public/favicon.ico`, `public/app-icon.ico`, `tests/pwa-install.test.mjs`
- **Verification:** `npm run icons:generate` ✓ · `npm run test:pwa` ✓ (3/3) · `npm run build` ✓
- **Git:** no commit (not requested)

---

## 2026-07-17 — Ingenious Network primary theme + switcher trim + stale-session fix

Set **Ingenious Network** as the primary application theme with light sidebar/content surfaces and navy/teal chrome accents. Theme switcher (login + topbar) shows **Ingenious Network** and **Default** only; Arctic/Harbor/Graphite remain in CSS but hidden from menus. One-time migration (`dwes-primary-ingenious-20260717`) promotes saved sessions to `ingenious` + `light`; inline bootstrap in `index.html` applies theme before React paint to fix stale cached UI.

- **Primary load:** `ingenious` + `light` (retired switcher ids map to ingenious).
- **Light surfaces:** sidebar, page canvas, cards, tables, panels (`#E8ECF0` / `#FFFFFF`).
- **Dark chrome only:** global topbar (`--t-header` navy gradient), workspace section headers (`#1B2958`), key action controls (teal/navy `--color-primary-*`).
- **Removed dark content mode** for Ingenious — cards/tables stay light in both light/dark mode toggles.
- **Login + topbar switcher:** `THEME_SWITCHER_THEMES` = Ingenious Network + Default only.
- **Debug / verify:** build exit 0; hard refresh recommended once if service worker cached old CSS (`Ctrl+Shift+R`).
- **Files:** `ThemeProvider.tsx`, `LoginPage.tsx`, `Topbar.tsx`, `theme-palettes.css`, `themes.css`, `index.html`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Build:** `npm run build` — exit 0
- **Git:** no commit

---

## 2026-07-17 — Ingenious Network theme + restore Harbor/Graphite

Added switchable **Ingenious Network** brand theme (deep navy, teal, white, light grey) sourced from `public/logo.svg`. Restored **Harbor** and **Graphite** to the theme switcher per user request to keep existing themes available.

- **Theme id:** `ingenious` — display name **Ingenious Network** in login + topbar palette menus.
- **Brand hex (logo.svg):** navy `#1B2958`, teal `#2E9DAA`, variants `#248892` / `#6DCFD4` / `#2A7A8A` / `#1B7080`, white `#FFFFFF`, light grey canvas `#E8ECF0`.
- **Switcher themes:** Default, Arctic, Harbor, Graphite, Ingenious Network (Default remains first load).
- **Tokens:** `theme-palettes.css` — full `--t-*` palette + `[data-mode="dark"]` content variant for Ingenious; Harbor/Graphite palettes re-imported from backup.
- **Login:** theme-tinted liquid mesh blobs for Harbor / Ingenious; hero uses `--t-login-hero`.
- **Light sidebar:** Ingenious + Harbor get teal active states under `[data-mode="light"]`.
- No routes / permissions / business logic changes. No commit.
- **Files:** `ThemeProvider.tsx`, `theme-palettes.css`, `themes.css`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Build:** `npm run build` — exit 0
- **Git:** no commit (not requested)

---

## 2026-07-17 — Light reusable sidebar + topbar breathing room (theme-token driven)

Apply a light, reusable sidebar and dashboard header across all role dashboards. Theme-token driven so dark mode keeps the existing dark navy chrome.

- **Sidebar:** light surface in light mode (`[data-mode="light"]` override of `--t-sidebar-*` tokens — white→slate gradient, slate text, subtle border, brand-blue active pill with white text). Dark mode unchanged (Default/Arctic base values). Existing nav items, pin, labels-under-icons (tablet), profile/settings entry preserved.
- **Topbar:** slightly increased global height + spacing for breathing room — `--topbar-control-h` 44→46px (mobile/tablet), 46→48px (desktop); padding 1.25/1.125rem → 1.375/1.25rem (mobile/tablet), 1.5rem → 1.625rem (desktop); `--dash-topbar-height` fallback 5.5→5.75rem, 6→6.25rem; `.topbar-inner` gaps nudged. Branding, profile pill, utility icons, clock/date preserved. Topbar stays dark navy brand chrome in both modes (works in light + dark).
- **Shared dashboard header:** already unified via `DashboardShell` → `PageHeading` → `DashboardPageHeader` for all 5 roles (Supervisor, Technician, QA/QC, Operations Director, System Administrator). Sales Director excluded. No change needed — confirmed consistent, responsive, theme-token driven.
- New tokens: `--t-sidebar-toggle-bg`, `--t-sidebar-active-text` (default + arctic + light-mode override). Hardcoded `rgba(255,255,255,0.06)` / `#FFFFFF` in sidebar toggle/active link replaced with tokens.
- Themes: Default + Arctic preserved. Harbor/Graphite still backed up in `theme-backup-harbor-graphite.css` (not imported). No schema / API / commit.
- **Files:** `src/styles/theme-palettes.css`, `src/styles/design-system.css`, `src/styles/themes.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Skipped (concurrent worker):** `src/pages/supervisor/tabs/ProjectsTab.tsx` and related Project Information components — not touched.
- **Build:** `npm run build` exit 0.
- **Git:** `git` not on PATH; no branch/commit.

---

## 2026-07-17 — Supervisor Project Information: remove duplicate Re-upload + reorganize

Production Supervisor Projects tab: Project Information had a duplicate **Re-upload Wiring Schedule** control (re-upload already lives in Wiring Upload / UploadFrameModal).

- Removed Project Information `WiringScheduleStatus` row (Upload / Re-upload) and the Replace Wiring Schedule confirm modal from this card only.
- Projects header **Wiring Upload** and FramesTab / UnifiedUploadModal re-upload flows unchanged.
- Reorganized Project Information into glanceable groups: action bar (Add Panel, Digital Wiring View, Drawing View, Edit + doc badges), Project Summary, Selected Panel, Assigned Technician, Wiring Progress + current work-state status.
- Compact progress strip from `panelActivity` (completed / total / remaining / %). No schema / API / commit.
- **Files:** `ProjectsTab.tsx`, `PanelTechnicianActivity.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** `git` not on PATH; no branch/commit.

---

## 2026-07-17 — Login left panel: remove vertical accent rail

User feedback: remove the thin glowing vertical cyan/blue divider on the login left brand panel.

- Removed `login-brand-rail` markup from `LoginPage.tsx` and deleted unused `.login-brand-rail` CSS (3px vertical gradient accent). Auth and other login content unchanged. No commit.
- **Files:** `LoginPage.tsx`, `design-system.css`, `CHANGELOG.md`

---

## 2026-07-17 — Login left panel: flatten glass + remove QC bullet

User feedback: login left brand panel must not look elevated/floating; remove QC feature from Login only.

- Flattened left brand content: removed frosted glass sheet/rim, elevated glass card (shadow, blur, glowing border, rounded float). Brand content is flush with the panel background; subtle vignette + accent rail retained (no glow).
- Removed Login-only feature bullet “QA / QC verification & reports” (and its list icon usage). QA/QC elsewhere in the app unchanged. Support note still uses ShieldCheck.
- Themes remain Default + Arctic. No entrance delay. Auth / WebAuthn unchanged. No commit.
- **Files:** `LoginPage.tsx`, `design-system.css`, `themes.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** `git` not on PATH; no branch/commit.

---

## 2026-07-17 — Login brand panel elevation + themes Default/Arctic only

Elevated login left brand panel for a stronger first impression; trimmed UI themes to **Default** + **Arctic**.

- Login left panel: deeper stage vignette, elevated glass card, accent rail, stronger typography hierarchy, badge/logo/feature presence; ambient aurora drift (~24s, no entrance delay); `prefers-reduced-motion` respected.
- Themes: Harbor + Graphite removed from `APP_THEMES` / switcher; retired users fall back to Default. Palette CSS backed up to `src/styles/theme-backup-harbor-graphite.css` (not imported).
- Auth / WebAuthn / credentials / demo paths unchanged. No cloud / DDL / commit.
- **Files:** `LoginPage.tsx`, `design-system.css`, `ThemeProvider.tsx`, `theme-palettes.css`, `theme-backup-harbor-graphite.css` (new), `themes.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** skip branch if `git` unavailable; no commit.

---

## 2026-07-17 — Shared dashboard page header (all roles)

One reusable `DashboardPageHeader` for Production Supervisor, Technician, QA/QC, Operations Director, and System Administrator. **Sales Director excluded** (not a supported role).

- Rewrote `DashboardPageHeader.tsx` as clean UTF-8 shared component (title/subtitle/badge/aside/live).
- `PageHeading` continues to re-export it for `DashboardShell`.
- Unified CSS: `.dashboard-page-header` + legacy `.dashboard-hero` / `.page-heading*` use theme tokens (no hardcoded `#1D4ED8` / `#64748B`); role-specific `dashboard-hero--technician` / `admin-dashboard-hero` overrides neutralized.
- Removed `heroClassName` special casing from Admin + Technician dashboards; preserved titles/badges/`heroLive`.
- Aligned layout `PageHeader` to the same visual classes.
- No cloud / DDL / commit.
- **Files:** `DashboardPageHeader.tsx`, `PageHeading.tsx` (unchanged re-export), `DashboardShell.tsx`, `PageHeader.tsx`, `AdminDashboard.tsx`, `TechnicianDashboard.tsx`, `design-system.css`, `index.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** no commit (not requested).

---

## 2026-07-17 — Modern layout colours for all (Default baseline)

Shared token refresh for a modern, high-contrast professional look across login, AppShell chrome, and role dashboards.

- **Default** remains first / loads for everyone (`dwes-app-theme`); carefully modernized: cooler slate canvas `#D2DCE8`, solid navy chrome `#0C224F`, stronger card borders `#475569`, brand-blue accents `#93C5FD` (no cyan bleed, no purple).
- **Optional** Arctic / Harbor / Graphite polished for clearer canvas vs white cards and stronger muted text.
- **Chrome wiring:** AppShell topbar/sidebar/login rim accents use `var(--t-header-icon-accent)` instead of hardcoded Arctic cyan — themes switch cleanly.
- **tokens.css:** Operations Director badge fallback blue (was purple).
- Login stays snappy (no liquid delay). No cloud / DDL / commit.
- **Files:** `theme-palettes.css`, `themes.css`, `design-system.css`, `tokens.css`, `tabs.css`, `ThemeProvider.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** `git` not on PATH in this environment — no branch/commit.

---

## 2026-07-16 — Technician Operational Twin: PDF-primary redesign

Critical redesign: technician Operational Twin is driven by the **approved panel PDF** (primary), not fake Excel schematic boxes or fabricated 3D.

- **PDF layout twin:** `OperationalTwin2D` renders the panel’s approved 2D drawing (pdf.js first page) with a schedule colour + length-aware SRC→DST overlay. No Engineering/Flat 3D fabrication (`VITE_ENABLE_PANEL_3D` unchanged / off).
- **Cable path:** `CableVisualPath` + overlay use `wireColorHex` + `cablePathVisualMetrics` / `buildLengthAwareWirePath` so each cable’s stroke colour/code and length shape the path (not a generic grey line).
- **Clutter removed (technician compact):** zoom/fit/focus/trail toggles and reverse-legend chrome stripped; single Full view control kept. Fake schematic device rectangles are not shown when a PDF is present.
- **Drawing fetch:** `DigitalWiringFrame` loads `projectsApi.panelDrawing` + `panelDrawingSlotFile('2d')`. `PanelGaDrawingModal` twin tab passes the same PDF blob when available.
- **DWG:** TYPE-01.zip inspected (secondary reference only) — not parsed in-app; future path. Desktop `Drawing\*.pdf` remain the operational reference.
- **Preserved:** Previous/Start-Pause-Resume/Complete/Skip/Complete Panel, Mid Change, KPI, RBAC, single-wire schedule. No cloud, no DDL, no commit.
- **Files:** `OperationalTwin2D.tsx`, `CableVisualPath.tsx`, `DigitalWiringFrame.tsx`, `wiring-utils.ts`, `PanelGaDrawingModal.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** no commit (not requested).

---

## 2026-07-16 — Login instant (no liquid delay) + icon-rail labels

- **Login:** Removed ~2.8s liquid slide / veil / sheen entrance and morphing blob/aurora motion. Left panel is static navy + light glass; form mounts instantly. Auth, WebAuthn, theme switcher unchanged.
- **Icon rail / collapsed sidebar:** Labels under icons always visible (Status, Project, Panel, etc.) when minimized or on tablet rail — fixed shared `Sidebar` + CSS (was `sr-only` + opacity:0). Applies to all role dashboards via AppShell.
- **Default theme:** Confirmed one-time reset flag `dwes-theme-reset-default-20260716` in ThemeProvider (Default loads; Arctic/Harbor/Graphite optional).
- **Files:** `LoginPage.tsx`, `Sidebar.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** no commit. **Flags:** no cloud; no DDL; no plan edits.

---

## 2026-07-16 — Default theme restored + contrast; optional modern themes

**Default = original DWES look** (solid brand-blue AppShell, clear white cards, stronger borders/icons). Modern liquid-glass themes remain **optional** and switchable — never forced.

- **Themes (4):** `default` (first / loads for everyone) · `arctic` · `harbor` · `graphite`. Persist `localStorage` `dwes-app-theme`. Switcher on login + top-bar lists **Default first**.
- **Contrast:** Default canvas `#D8E0EB` vs white cards; solid `#0F2557` sidebar/header; white chrome icons; stronger card borders (`#64748B`). Optional themes also get clearer canvas + brighter chrome icons.
- **Icons:** default Material weight 500; sidebar inactive icons use full-opacity muted token (not washed grey).
- **Login liquid:** unchanged visually; theme-aware; Default still uses liquid left panel with brand-blue hero tokens.
- **Files:** `ThemeProvider.tsx`, `theme-palettes.css`, `themes.css`, `icons.css`, `Icon.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** no commit. **Flags:** no cloud; no DDL.

**How to switch:** Login palette button or AppShell top-bar Palette → Default / Arctic / Harbor / Graphite.

---

## 2026-07-16 — Force open on Default theme (one-time)

Overnight may have left `arctic` in `localStorage`. ThemeProvider now one-time resets to **Default** (original DWES), then honors user palette picks (Arctic / Harbor / Graphite still switchable).

- **Files:** `src/components/layout/ThemeProvider.tsx`
- **Flag:** `dwes-theme-reset-default-20260716`
- **Git:** no commit (not requested).

---

## 2026-07-17 — Fix pin, login gradient, login theme switch

- **Sidebar pin:** Always-visible pin + collapse controls; persist merge for `sidebarPinned`; pin forces expanded Workspace (including tablet rail override). Filled pin icon when active.
- **Login left:** Modern static gradient mesh (`login-panel-left--gradient`) — no entrance delay; theme-coloured aurora/blobs.
- **Login theme switch:** `setTheme` writes `data-theme` + localStorage immediately; menu z-index/overflow fixed; left panel remounts on theme change.
- **Files:** `Sidebar.tsx`, `useUIStore.ts`, `ThemeProvider.tsx`, `LoginPage.tsx`, `design-system.css`, `CHANGELOG.md`
- **Flags:** no cloud; no DDL; no commit.

---

## 2026-07-17 — Director Workspace sidebar + pinnable nav (all roles)

- **Director:** same AppShell Workspace sidebar as other dashboards (`Live Status` nav item). Previously had zero `tabs`, so Sidebar returned null.
- **All dashboards:** sidebar **Pin** control (persisted `sidebarPinned` in `dwes-ui-storage`). Pin keeps Workspace expanded; collapse unpins when pinned. Shared `Sidebar` used by Supervisor, Technician, Director, Admin, QAQC.
- **Files:** `DirectorDashboard.tsx`, `Sidebar.tsx`, `useUIStore.ts`, `design-system.css`, `CHANGELOG.md`
- **Flags:** no cloud; no schema DDL; no commit.

---

## 2026-07-16 — Login liquid glass + theme switcher (Arctic / Harbor / Graphite)

Critical UI polish: login left panel is industrial **liquid glass** (not flat blue); three full app themes with switcher on login + AppShell top bar.

- **Login liquid:** deep navy/slate base + frosted glass sheet, soft cyan/brand-blue aurora mesh, morphing blobs, caustic drift, one-shot ~2.8s liquid slide + veil + sheen on mount; glass content card; `prefers-reduced-motion` disables motion. Auth / WebAuthn / health ping unchanged.
- **Themes:** `arctic` (slate/navy cyan), `harbor` (steel + teal), `graphite` (charcoal + blue). Persist `localStorage` `dwes-app-theme`. Switch via login palette button or top-bar Palette menu. AppShell topbar/sidebar use theme glass tokens.
- **Director:** simplified live status retained; walkthrough `docs/DIRECTOR-WALKTHROUGH.md` restored UTF-8.
- **Files:** `LoginPage.tsx`, `design-system.css`, `ThemeProvider.tsx`, `Topbar.tsx`, `theme-palettes.css`, `DirectorDashboard.tsx`, `docs/DIRECTOR-WALKTHROUGH.md`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** no commit (not requested).
- **Flags:** no cloud provision; no WiringSchemeDB DDL.

---

## 2026-07-16 — Cloud UI Twin Reports

Implements product UI density, 2D Operational Twin multi-cable live trail, panel completion report densification, local security readiness docs, and ≥70 concurrent tech load guidance. **No OCI resource creation, DNS, Vault fetch, or production deploy.**

- **Cloud gate:** Confirmed zero provision; hosting still blocked until user replies exactly **approve OCI hosting** (+ tenancy credentials). `oci-provision-deploy` cancelled as blocked.
- **UI density (“Dense industrial glass”):** Stronger WCAG text tokens on white; `.text-value` weight ≥600; tighter CompactCard / KPI / director cards; soft blue brand card wash only (no purple AI look, AppShell/sidebar/top bar unchanged).
- **2D twin live trail:** Geometry mode returns prior wires; `OperationalTwin2D` overlays completed/skipped/in-progress routes; current S.No highlighted. Flat/Engineering 3D remain behind `VITE_ENABLE_PANEL_3D`. No WiringSchemeDB DDL.
- **Reports:** Preview zones densified (`.pcr-*`); PDF section/field spacing tightened; Excel section bars denser; branding still via `report-branding.ts` / `CompanyLogo`.
- **Security (local/repo):** JWT missing/weak fails startup (`auth.module.ts` + `main.ts`); `DEMO_MODE` gated via `demo-mode.util.ts`; production checklist documented in `PROJECT_STATUS.md`. No secrets committed; no VM `.env` edits.
- **Load:** `infra/load/k6/tech-70vus.js` + `npm run load:tech70`; `docs/LOAD-TEST.md` updated. Run localhost only when servers are up.
- **Files:** `theme-palettes.css`, `design-system.css`, `themes.css`, `index.css`, `OperationalTwin2D.tsx`, `DigitalWiringFrame.tsx`, `operational-twin.service.ts`, `PanelCompletionReportPreview.tsx`, `panel-completion-report-pdf.ts`, `supervisor.service.ts`, `infra/load/k6/tech-70vus.js`, `scripts/k6-tech70.mjs`, `package.json`, `docs/LOAD-TEST.md`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** no commit (not requested); dirty tree preserved.
- **Flags:** no OCI create; no schema DDL; AppShell preserved.

---

## 2026-07-16 — Tablet UI/UX roadmap (Phases 1–5)

Completes tablet-first UI/UX roadmap across all roles (plan file not edited).

- **Phase 1 (Technician):** Confirmed Approved Drawing removed from dashboard; home = Digital Wiring Schedule + 2D Operational Twin only. Twin modal hides Approved 2D tab + fallback “View Approved Drawing” for technicians (`twinMode`). Supervisor drawing access unchanged. Orphan `GaDrawingViewModal` documented as unused.
- **Phase 2 (Supervisor Status):** `CompactStatusWorkspace` densified with `CompactCard`; CSS conflict fixed (looser `.sws-*` overrides removed); View Report / review / submit touch targets ≥44px; Approve/Rework/Submit APIs unchanged.
- **Phase 3 (Operations Director):** Project cards nest panels grouped Active / In Progress / Completed; KPI remains assigned-cable formula; exactly one panel **View Report** via `ReportPreviewModal` (live progress modal removed); backend `projectsSummary` emits In Progress; styles in `index.css`.
- **Phase 4 (Admin):** Settings chrome trimmed to ops surfaces; orphan `HardResetTab` / `ResetAllProjectsTab` stay unmounted (backend endpoints retained).
- **Phase 5 (QA/QC):** Merged Completed + Reports into **History / Reports**; Review Queue → Inspection Form flow preserved; badge “Interim QC”; denser check rows.
- **Files:** `PanelsTab` (verified), `PanelGaDrawingModal.tsx`, `CableDigitalTwinModal.tsx`, `GaDrawingViewModal.tsx`, `CompactStatusWorkspace.tsx`, `design-system.css`, `DirectorDashboard.tsx`, `director.service.ts`, `index.css`, `AdminSettingsPage.tsx`, `HardResetTab.tsx`, `ResetAllProjectsTab.tsx`, `QAQCDashboard.tsx`, `InspectionFormTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Git:** branch `migration/fastify-perf-ios`; status/diff skipped if `git` binary unavailable; no commit.
- **Flags:** no WiringSchemeDB schema change; AppShell/sidebar/top nav preserved.

---

## 2026-07-16 — Master — 2D Twin / 3D Removal / Enterprise UI (finish)

Completes interrupted Master-2DTwin-3DRemoval-EnterpriseUI work (prompt file missing from Downloads; goals reconstructed from prior session + repo state).

- **Fix:** Cable Digital Twin loaded Operational 2D Twin data but never rendered the `ot2d` tabpane — `OperationalTwin2D` now mounts as the primary twin surface; drawing-package load/errors no longer block the 2D twin tab; "Not Yet Configured" fallback only when ot2d also empty.
- **3D demotion (already gated):** Flat/Engineering/Generated 3D stay behind `PANEL_3D_ENABLED` (`VITE_ENABLE_PANEL_3D`, default off). Twin icon `Boxes` → `Map`.
- **Preserved:** Digital Wiring Schedule Excel row + Cable Visual Path + inline OperationalTwin2D; Approved Drawing; Skip/Mid Change/KPI/RBAC/APIs.
- **Files:** `src/components/ui/PanelGaDrawingModal.tsx` (+ prior session: `features.ts`, `CableDigitalTwinModal.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `GaDrawingViewModal.tsx`, `EngineeringImportModal.tsx`)
- **Git:** skipped (unavailable per author).

---

## 2026-07-16 — Final verification — Technician 2D Twin + Compact UI

Executes `Final-Verification-Prompt.md` (verification-first; minimal defect repairs only).

- **Repairs:** Removed orphaned corrupted `backend/check.{ts,js,d.ts,js.map}` (oxlint parse errors). Restored FE typecheck by aligning Digital Twin mapping editor row shapes, `FileViewerType` + CSV `activeSheet`, and unused imports. Fixed Excel wiring parser off-by-one (`parseWiringSheet` now treats `readSheetData` rows as post-header and applies sub-header skip at index 0). Awaited async parser in `excel-parser-regression.test.cjs`. Removed leftover `sales_demo` / `sales_director` entry from private `demo-accounts.local.json`.
- **Automated:** FE typecheck 0 / lint 0 errors (warnings only) / `npm run build` 0; BE prisma validate+generate 0 / nest build 0 / tests **117/117**; FE `test:twin` 7/7, `test:schematic` 5/5, `test:panels` 10/10, `test:state` 4/4.
- **Browser:** `verify-operational-2d-twin.mjs` **23 PASS / 0 FAIL / 3 SKIP**; `compact-ui-smoke.mjs` **0 failures** (5 roles × 4 viewports); role login diag PASS for tech/supervisor/qaqc/admin + `ops_director1` (director1 disabled locally).
- **Sales Director:** absent from FE roles/routes/admin dropdowns/demo seed; login rejected; RBAC tests assert exclusion.
- **Git:** skipped (unavailable per author) — no `git status`, `git diff`, `git diff --check`, commit, branch, or remotes.
- **Flags:** no intentional API/RBAC/workflow redesign; Mode A twin still not exercisable without published geometry; `SupervisorOperationalTwinMonitor` remains unwired (optional).

---

## 2026-07-16 — Verify + Fix — Operational 2D Twin browser matrix

Completed interactive browser verification for Digital Wiring Schedule + OperationalTwin2D (tech1 / =H001 / assignment 72). Fixed verification-blocking duplicate React terminal keys.

- **Defect fixed:** Mode B schematic terminal ids collided when nested device tags shared colon paths (`87BB`+`X102:2` vs `87BB:X102`+`2` → both `term:87BB:X102:2`). IDs now use `term:{device}::{terminal}`; `SCHEMATIC_GENERATION_VERSION` bumped to **2** so TwinLayoutStore regenerates cache. Frontend circle keys use `${id}#${idx}` as defense.
- **Files:** `backend/src/engineering/schematic-layout.ts`, `tests/schematic-layout.test.ts`, `src/components/technician/wiring/OperationalTwin2D.tsx`, `scripts/verify-operational-2d-twin.mjs`, `docs/OPERATIONAL-2D-TWIN.md`
- **Browser matrix:** 23 PASS / 0 FAIL / 3 SKIP (Mode A no published geometry; theme toggle absent; Complete Cable disabled on already-complete row — Complete passed on earlier matrix run). Viewports 1920×1080, 1024×768, 768×1024, 820×1180 — no horizontal overflow; console clean after fix.
- **API:** authenticated `GET /api/engineering/operational-twin/...` → 200 SCHEMATIC; unauthenticated → 401.
- **Git:** skipped (unavailable per author) — no status/diff/commit/branch.
- **Flags:** no API/RBAC/workflow changes beyond schematic id uniqueness.

---

## 2026-07-16 — UI — Login page non-scrollable responsive fit

Executes `Login-Responsive-Fix-Prompt.md`: viewport-locked Login layout so logo, title, username, password, Sign In, Install App, and support info fit without page scroll across tablet/desktop sizes.

- **CSS:** `design-system.css` login section — `100vh`/`100svh`/`100dvh` lock + `overflow: hidden`; fluid `--login-*` tokens via `clamp()`; height media queries compress gaps/logo/type; stacked brand strip `max-height` caps; landscape short-height side-by-side; PWA `standalone` uses `svh`.
- **Theme:** `themes.css` — support note, clock, install button token remaps for light/dark parity.
- **TSX:** `LoginPage.tsx` — remove conflicting `overflow-x-hidden` / fixed button `minHeight` (CSS owns sizing). Auth/WebAuthn/validation untouched.
- **Git:** skipped (unavailable per author) — no status/diff/commit.
- **Flags:** layout/CSS only; no API/RBAC/auth logic changes.

---

## 2026-07-16 — UI — Modern compact redesign of ALL role dashboards

Executes `Modern-Compact-UI-All-Dashboards-Prompt.md`: density-only layout pass across Production Supervisor, Technician, QA/QC, System Administrator, and Operations Director. No API/RBAC/workflow changes; AppShell / top nav / sidebar / icon rail untouched.

- **Shared primitives:** `PageHeading`, `CompactCard`, `FieldGrid`, `StatChip`, `ActionRow`; `DashboardShell` uses `PageHeading`; `SectionHeader` delegates to dark compact `WorkspaceSectionHeading`.
- **Density CSS:** hero ≤64px; KPI/card/dash-module padding tightened; badges smaller; dark section bars (~36–40px); denser tables; supervisor scope band + FieldGrid project/panel info; technician subtitle = name · EMP-ID; admin settings dark section heads; director KPI icons compact.
- **Git:** skipped (unavailable per author) — no status/diff/commit.
- **Flags:** layout/CSS only; functional behaviour preserved.

---

## 2026-07-16 — Feature — 2D Operational Digital Twin (Mode B schematic + Mode A gate)

Implements `Final-2D-Twin-Cursor-Prompt.md`: technician inline 2D twin with automatic Mode B Excel schematic (always works) and Mode A CAD/published geometry when available.

- **Mode B:** deterministic schematic layout from wiring schedule (`schematic-layout.ts`), persisted under `uploads/<PROJECT>/twin-layouts/*.schematic.json` (db-guard: no WiringSchemeDB DDL).
- **Mode A:** reuses published `panel_models` / device / terminal / duct tables; `CadGeometryAdapter` + `DWES_CAD_GEOMETRY_ENABLED` (default false) — no CAD parser / react-konva / APS bundled.
- **API:** `GET /api/engineering/operational-twin/:projectCode/:frameId?cableRef=`
- **UI:** `OperationalTwin2D` (SVG layers, zoom/pan/fit/focus/fullscreen, status colours) inline in Digital Wiring Schedule; optional `SupervisorOperationalTwinMonitor` read-only.
- **Docs/fixtures:** `docs/OPERATIONAL-2D-TWIN.md`, schematic + geometry sample fixtures.
- **Restore point:** branch `migration/fastify-perf-ios` HEAD `9f6a4a4` (uncommitted prior work retained).
- **Flags:** no commit/push; Mode A CAD parse disabled pending licence approval.

---

## 2026-07-16 — Fix — Production build: invalid `@apply text-muted` in Status Workspace CSS

- `design-system.css` `.sws-report-row-desc`: `.text-muted` is a plain project class (not a Tailwind utility), so `@apply text-muted` failed `vite build` ("Cannot apply unknown utility class"). Replaced with `color: var(--color-text-muted);`, matching the file's existing token pattern. Verified: `npx vite build` exits 0.
- Verified the technician Digital Wiring Schedule single-cable workspace (one-cable SOURCE → CABLE → DESTINATION card, action bar Previous / Pause / Complete Cable / Skip / Complete Panel, Full Wiring View behind secondary button) in-browser against real assignment 72 (=H001, 400 cables) at 1280×900 / 1024×768 / 768×1024 — no overflow, no console errors, no failed API calls, no snap-back across the 30 s sync poll; backend skip/mid-change tests 21/21 pass.

---

## 2026-07-16 — UI — Status Workspace: unified View Report + compact accent headings

- `CompactStatusWorkspace.tsx`: all report rows use one **View Report** button (replaces View Live / View Completed / Report / Generate); existing `ReportPreviewModal` + `ProjectPdfPreviewModal` workflows unchanged.
- `WorkspaceSectionHeading` gains `variant="accent"` (blue/purple compact row); applied to Status Workspace, Technician Activity, Reports & Review.
- `design-system.css`: `sws-*` density classes + accent heading + `sws-view-report-btn`.

---

- Added `.cursor/rules/dwes.mdc` from author download — consolidated rules for roles (no Sales Director), protected workflows, Digital Wiring Schedule / Cable Digital Twin, UI shell protection, workspace headings, popups, security, Prisma, git safety, cloud-neutral deployment planning, verification, and PASS/PASS WITH WARNINGS/FAIL reporting.
- Cross-linked from `.cursor/rules/dwes-project-skill.mdc`.

---

## 2026-07-16 — UI/RBAC — Workspace standardization, compact Project Information, Sales Director removal

Implements prompt-optimized.md sections 1–4 (partial popup rollout — `TabletFields` foundation only).

- **`WorkspaceSectionHeading`** (`src/components/ui/WorkspaceSectionHeading.tsx`): compact dark internal section heading using `--pj-action-bg`; applied to Project Information, Selected Panel, Status Workspace, Director Live Production Overview.
- **Assigned Technician block** (`PanelTechnicianActivity.tsx`): name + Assigned At / Wiring Started / Last Action only; Mid Change preserved in compact `<details>`; pause state retained.
- **Wiring schedule metadata removed** from Project Information card (`WiringScheduleStatus` → upload button only; filename/cable count/upload date no longer shown).
- **Sales Director removed**: frontend `UserRole`/`ROLE_LABELS`/`ROLE_ROUTES`; backend RBAC, director controller (ops-only), frames/users `@Roles`, demo accounts, auth login rejection; cleanup script `backend/scripts/remove-sales-director-users.cjs`; tests updated.
- **Dashboard titles**: Technician → "Technician", QA/QC → "QA/QC", Director → "Operations Director".
- **`TabletFields`**: `required` prop, `AlertCircle` error icons, `isBlank()` helper.
- **Verified:** backend build + guard tests 5/5 pass; frontend `tsc` clean on changed files; full `npm run build` blocked by pre-existing TS errors in `DigitalTwinMappingEditor.tsx`, `FileViewer.tsx`, `PdfDrawingUploadModal.tsx`, `mappingCsvImport.ts` (unchanged by this pass).

---

## 2026-07-16 — Feature — Engineering geometry pipeline: Chennai package → validate → import → review → approve → publish → Flat 3D / Calculated Guidance

Implements the full Engineering-3D data path (joint session: author built `EngineeringImportModal` + supervisor "Import Twin Data" action; AI built the backend pipeline, spec, Flat 3D view, and tests). No DDL; no data imported — the pipeline is live but empty until real Chennai packages arrive.

- **Package spec v1** ([docs/ENGINEERING-PACKAGE-SPEC.md](docs/ENGINEERING-PACKAGE-SPEC.md) + fictitious sample in docs/samples/): one JSON per panel per revision — mm-only units (no silent conversion), panel envelope, devices+terminals with coordinates, duct nodes/segments; engineering symbols (`= + - : / .`) preserved; `DEVICE:TERMINAL` matching is case/whitespace-insensitive.
- **Validator** (`package-validation.ts`, pure): structure/spec checks, dimension ranges, duplicate tags/terminals, coordinate sanity, duct-graph referential integrity + connectivity (disconnected = warning), schedule-match report. Failing validation writes nothing.
- **Import service** (`engineering-import.service.ts`): transactional DRAFT import (`pending_review`, `published_at: null`), route-param ownership enforcement (no cross-panel packages), duplicate-revision rejection, mapping `reviewSummary` (matched/unmatched schedule ends), `approveAndPublish` (supervisor/admin only, re-validates geometry, marks prior published revision **superseded** — history preserved).
- **Endpoints** (`api/engineering/*`): `validate` (dry-run) + `import` [supervisor/admin], `review/:modelId` [+ops_director], `approve/:modelId` [supervisor/admin]; technicians 403 on all import-workflow routes (live-verified).
- **Twin-context hardened**: only **approved + published** revisions are visible (drafts can never change the technician view — live-verified: tech1 still sees Drawing Reference Only with a draft-free DB); per-cable end resolution against the terminal map; **A\* calculated route** through the duct graph via the author's `RoutingService`; approved-exact only from an approved `cable_route_mappings` row (`wiring_row_id = "<frameId>#<sno>"`); full Flat-3D geometry payload (panel/devices/ducts/markers/route) in the response.
- **Frontend**: new `engineeringApi` (central client); twin classification/missing-list now server-authoritative with client asset fallback; new **`FlatPanelView`** (pure-SVG plan view — panel outline, device footprints+tags, duct runs, SRC/DST markers, approved-solid vs calculated-dashed route polyline, label/duct toggles; renders only published geometry, empty-envelope guard); twin gains a `Flat 3D` tab only when the server declares `flat-3d` available. Author's `EngineeringImportModal` (upload → validate → import → review → publish phases) wired to the same endpoints; two in-flight compile errors completed (Upload icon import, unused prop/catch).
- **Verified:** backend build 0 + **118/118** tests (12 new: validator rules, symbol-preserving normalization, zero-write invalid import, ownership + duplicate-revision rejection, draft-not-published invariant, publish RBAC + supersede); FE tsc 0 · lint 0 · build 0 · twin tests 7/7; live: twin-context `drawing-reference` + `[approved-2d]` for tech1, technician import → **403**, twin modal renders server classification with Flat 3D correctly absent, no page errors.

## 2026-07-16 — Fix/Feature — Twin-context 500 repair, Status workspace completion, typography cascade fix (autonomous session, browser-verified)

Local-only on `migration/fastify-perf-ios`; joint author+AI session. Formatter confirmed disabled (byte canaries intact).

- **Cable Digital Twin live repair:** reported "not visible" reproduced as two issues: (1) the dashboard/workstation UI was fully functional in the served app (13/13 acceptance as tech1 — stale browser bundle / prior editor-buffer windows explain the sighting); (2) the REAL defect: `GET api/engineering/twin-context` returned **500** because `schema.prisma` renamed `panel_id`→`frame_id` on 3 new tables while the live DB kept `panel_id`. Fixed without DDL via Prisma `@map("panel_id")` (drawing_assets, panel_models, mapping_issues) + client regen. Endpoint now returns the controlled shape (classification, availableModes, drawingRevision, geometry counts, `missing_requirements`) derived from real drawing packages + geometry-table counts; never a server error for empty geometry. Twin banner gained an expandable "Missing engineering data (N)" explainer (shared `missingTwinRequirements()`); the Not-Yet-Configured fallback now shows the full real cable-details grid + View Approved Drawing / Return / Report Mapping Issue actions. `backend/script.ts` (author scratch) excluded from tsconfig builds.
- **Status workspace (author's `CompactStatusWorkspace`) completed:** the author's new compact Status implementation was adopted as the single live one (AI's parallel rewrite of `ReviewApprovalWorkspace.tsx` remains as unused dead code — nothing imports it). Fixes/additions on the author's component: real `user.id` for session-project scoping (was hardcoded `1`); **per-project panel persistence** via `selectedPanelByProject` + `resolveSelectedPanelId` (browser-verified round-trip); pre-start approval now calls `approve-assignment` (was mis-calling `review`); live read-only report enabled for in-progress panels (was completed-only) with Live/Completed labelling; **other-panel report rows** added; **Reviewer/Approver facts + expandable audit history** (new additive `reviewer_name`/`approver_name`/`rework_by_name` on `allPanels`); **Submit to Director** action (backend-validated); workflow error surface. `panelActivity` additively exposes `technician_logged_out` + `active_seconds`. Verified live: ONE status badge, ONE progress bar, 0 overflow at 1440/1180/1024/820/768/390, panel persisted across tab round-trip, no page errors.
- **Typography cascade fix:** author's semantic token system (`--t-text-*`, role vars in themes.css, `.text-primary/…/.text-disabled` utilities + ~90-file class sweep) had a layer conflict — Tailwind's generated `.text-primary` (**brand blue** from `--color-primary`) and `.text-secondary` (from `--color-secondary`) in `@layer utilities` outranked the semantic classes in `@layer components`. Semantic typography utilities hoisted to **unlayered** rules so they always win. Live-verified: `text-primary`→slate-950 rgb(2,6,23), muted≠secondary hierarchy intact. Dark mode note: arctic is deliberately light-only (`data-mode="light"` warms surfaces; `dark` renders identical base visuals by design) — verified stable under `data-mode="dark"`, no dark palette exists.
- **cable_skip test records reviewed (read-only):** audit ids 297/298, technician 40 (Viju Vijayan), project 001 / panel =H001 (assignment #72), reasons + timestamps intact, author already prefixed both with `[TEST]`. Cable 6 (index 5) confirmed still pending (src/dst false), counts 5/5/400 and KPI unchanged, no duplicate/orphan rows. **Recommendation: retain** as annotated verification history; audit rows are immutable by design; the cable completes through the normal workflow.
- **Verified:** FE tsc 0 · oxlint exit 0 · vite build 0 · FE unit 21/21 (7 twin +1 missing-req, 10 panels, 4 state) · prisma validate OK · backend build 0 · backend tests **105/105** · bundle scans (dev assets absent, demo ids absent, twin present) · `git diff --check` clean · browser matrix supervisor/technician/qaqc/admin × light+dark × 4 viewports + ops_director1 + sales_demo = **0 overflow, 0 clipped headings, 0 page errors**; screenshots in `artifacts/{twin-repro,twin-accept,status,matrix}-2026-07-16/`.

## 2026-07-15 — Feature — Technician Dashboard redesign, Digital Wiring Schedule, Skip workflow, Cable Digital Twin (browser-verified)

Local-only on `migration/fastify-perf-ios`; combined AI + author session (author added the engineering DB layer + module; AI implemented technician UX, skip workflow, twin viewer glue). **Incident note:** a user-level editor extension was found destructively minifying string literals on save (verified in bytes); after it was disabled, 128 formatter-damaged files were `git restore`d to HEAD with the author's approval — intentional work was preserved/re-applied.

- **Renames:** every user-facing "Digital Wiring View" → **Digital Wiring Schedule** (technician workspace aria, supervisor Projects button + tooltip, PanelWiringViewModal title, DigitalWiringMonitor aria). Technician "Digital Wiring Monitor" action → **Digital Wiring Schedule**; "3D GA / 2D Drawing View" action → **Cable Digital Twin** + new separate **Approved Drawing** action (all three side-by-side). No backend route renames.
- **Technician Current Assignment card** (`PanelsTab.tsx` + `.tech-assignment-*`): one authoritative backend-sourced summary — project/number/panel/type/voltage/client/technician/assigned/started/cable counts/KPI/pause/Mid Change badge. `myPanels` now includes `panel_type`/`voltage_level`/`system_type` from the frame file (no schema change).
- **One-cable engineering card** (`DigitalWiringFrame.tsx` + `.dwc-*`): the current cable renders as a large SOURCE → CABLE → DESTINATION card (device/terminal/ferrule/location per end + wire no./colour swatch/size/length/ref/remarks + per-end Wired/Open state) instead of a single spreadsheet row; Full Wiring View keeps the classic schedule-row reference table. Skipped-pending rows are labelled "Skipped — Pending".
- **Action bar** (`WiringWorkstation.tsx`): `[Previous] [Start/Pause/Resume] [Complete Cable] [Skip] (+Complete Panel)`. **Complete Cable** = the existing atomic completion (advances to next pending). **Skip** = NEW true skip: reason required (≥3 chars, `dialog.prompt`), cable stays pending, KPI untouched, next-pending navigation (loop-safe), returnable via Previous. Backend `cable-action` gains additive `skip` + `flag_issue` verbs — audit-only (note + `tech_audit_log` rows `cable_skip`/`cable_mapping_issue`, no src/dst mutation, no auto-start, ownership + range validated). Also fixed a snap-back bug where the active-index effect depended on `status` and undid Skip/Previous navigation.
- **Cable Digital Twin:** author's `CableDigitalTwinModal` kept as the dedicated entry point, reimplemented as a thin wrapper over the shared secure viewer in twin mode (`PanelGaDrawingModal twinAssignmentId`): auto-follows assigned project/panel + current (next-pending) schedule cable, tabs relabelled **Approved 2D / Flat 3D / Engineering 3D** (shown only when the asset exists; 3D gated by `VITE_ENABLE_PANEL_3D`), explicit route-confidence banner from new shared `cableTwinClassification.ts` (A Approved Exact → E Unavailable; currently honest max = D Drawing Reference Only since no terminal/duct mappings exist), **Report Mapping Issue** (audited), and the controlled "Cable Digital Twin Not Yet Configured" fallback that never blocks wiring. Removed the wrapper's hardcoded localhost fetch/fake "Est. 12.5m" data.
- **Engineering module (author's, fixed):** `backend/src/engineering/` (twin-context endpoint + A* duct-graph `RoutingService`) — corrected guard import paths, added `api/` prefix + explicit `@Roles` (sales excluded), and gated the sample ENOWA "calculated-guidance" response behind `DEMO_MODE` (a calculated route must come from real mapped geometry, never fabricated coordinates). Author also added 8 geometry tables to WiringSchemeDB + `schema.prisma` (drawing_assets, panel_models, device/terminal geometries, duct nodes/segments, cable_route_mappings, mapping_issues) — created by the author directly; AI performed no DDL.
- **Verified:** FE `tsc` 0 · oxlint exit 0 · `vite build` 0 (bundle: new labels present, old absent, no hardcoded twin fetch) · backend build 0 · backend tests **105/105** (5 new skip/flag_issue tests) · FE unit tests 6/6 twin + 10/10 panels + 4/4 state · real-browser (tech1 live =H001, 400 cables): 3 actions labelled/ordered, assignment card with real CPR/132KV-33KV data, one-cable card at 1280/1024×768/768×1024/600×960 with 0 hOverflow, Skip advance 6→7 with counts frozen + "Skipped — Pending" + 2 `cable_skip` audit rows in DB, twin opens with "Drawing Reference Only" + real cable #6 context (GREEN/YELLOW · 2.5SQ.mm · Rev 1) and no Engineering-3D tab without a model; supervisor spot: renamed button, biometric control, 768px rail, 0 overflow, no page errors.

## 2026-07-15 — Feature/UX — Supervisor redesign CPI follow-up: orphan removal, panel persistence, tablet-portrait rail, Review & Approval section (browser-verified)

Continuation of the same-day supervisor redesign. Frontend + CSS only; no backend/schema/API changes. Restore point: uncommitted working tree on `migration/fastify-perf-ios` (git left untouched per instruction).

- **Orphan removed:** deleted `src/components/supervisor/PanelActivityRowDetails.tsx` after a full usage sweep (static/dynamic/lazy imports, barrels, tests, path aliases, prod bundle) confirmed **zero** consumers. Bundle scan post-build confirms it is absent from `dist`.
- **Selected-panel persistence (per project):** new pure helper `src/utils/panelSelection.ts` (`resolveSelectedPanelId` / `rememberSelectedPanel` / `pruneSelectedPanels`); `useProjectSelectionStore` gains `selectedPanelByProject` (session-store, ids only, reset on user change). `ReviewApprovalWorkspace` restores the last panel per project across the tab-remount, falls back to the first panel when the stored one is deleted/invalid/unauthorized, and never carries a panel across projects. Unit tests: `tests/panel-selection.test.ts` (10/10) + new `test:panels` script. Browser-verified: select panel 2 → Projects tab → back to Status → panel restored.
- **Tablet-portrait icon rail (shared):** the persistent sidebar now renders from `tablet-port` (768px) up — `.dash-sidebar` display + the rail media query extended to `768–1279px`; the topbar hamburger moved to `tablet-port:hidden` (only < 768px); `AppShell` closes the drawer at ≥768px so rail and drawer stay mutually exclusive. Desktop (≥1280px) keeps the expanded sidebar. All shared components (`Sidebar`/`AppShell`/`Topbar`/CSS) — no per-role logic. Browser-verified across supervisor + technician + QA/QC at 1440/1280/1180/1024/820/768/390: expanded ≥1280, rail 768–1279 (icon+label, ≥62px targets, underline selected state), drawer <768, **0 horizontal overflow at every viewport**.
- **Review and Approval section (E):** Status workspace reordered to A Selectors → B Panel Status Summary → C Technician Activity (single authoritative badge) → D Reports → **E Review and Approval** (own section: workflow-state badge, audit facts, and only the permitted Approve / Request Rework / Review / Submit-to-Director actions). Review actions removed from the monitor/summary. Backend enforcement re-verified: `@Roles('prod_supervisor')` at the controller + service-level role checks; `submitToDirector` blocks submission unless every completed panel is `approved` and blocks QC-pending; audit fields stamped (`approved_by/at`, `reviewed_by/at`, `rework_requested_by/at`).
- **Verified:** FE `tsc -b` 0 · `oxlint` 0 (no findings in changed files) · `vite build` OK · `test:panels` 10/10 · `test:state` 4/4 · backend `prisma generate && nest build` OK · backend tests **100/100** · `git diff --check` clean · real-browser layout probe **0 hOverflow** at all sampled viewports.

## 2026-07-15 — Feature/UX — Supervisor dashboard redesign: Project Info, Status monitor, reports, tablet sidebar, biometric states

Local-only, frontend + CSS only (no backend, schema, or API changes). Restore point: uncommitted working tree on `migration/fastify-perf-ios` (git left untouched per instruction).

- **Project Information card** (`ProjectsTab.tsx`): removed the detailed Technician Activity block; replaced with a compact `PanelAssignmentSummary` showing only `Active Panel: <name>` + one `Assigned` / `Not Assigned` badge, plus assigned technician name + `@username` on one line when assigned. Detailed activity/breaks/progress/Mid Change no longer duplicated here. New `.pj-panel-assignment*` styles use dark `--color-text-primary/secondary` tokens.
- **Status workspace redesign** (`ReviewApprovalWorkspace.tsx` rewritten): removed the Active/Waiting bucket chips + always-expanded project stack. New selector-driven monitor — Project dropdown (session-project source, shared with Projects tab) → Panel dropdown (panels of that project) → compact authoritative panel-status summary (assignment, wiring, cables done/left/total, %, start, last activity, completion) → the **moved** full Technician Activity + Mid Change contribution timeline (single authoritative live-status badge, no duplicates) → report actions. Preserves review / rework / approve-legacy / submit-to-director workflow and all existing report + activity APIs.
- **Reports by project & panel:** selected-panel `View Live Report` (in-progress, read-only) / `View Completed Report` + `Download PDF` (completed) via existing `ReportPreviewModal` + `frameReportPdf`; per-panel report buttons for every panel; overall `View Project Report` via existing `ProjectPdfPreviewModal` (`reportPdf`). No duplicate report system introduced.
- **Tablet sidebar auto icon-rail** (`Sidebar.tsx` + `design-system.css`): 1024–1279px viewport now auto-renders a compact rail — icon with a short label beneath, centered, ≥62px touch targets, underline selected indicator, `title`/`aria-label` tooltip, `aria-current`. Full sidebar returns at ≥1280px; no manual toggle needed. Label visibility moved to CSS control.
- **Biometric control** (`useBiometric.ts` + `Topbar.tsx` + `themes.css`): explicit `BiometricStatus` = loading / no-context / unsupported / error / ready from real WebAuthn `platformAuthenticatorIsAvailable()` in a secure context (+ probe error state). Header control is now always present: enabled (opens panel) only when ready or context-fixable; clearly disabled with "Not Supported on This Device" / "Biometric check failed" / "Checking…" otherwise; enrolled-on-this-device dot. RP_ID/RP_ORIGIN/HTTPS/enrolment logic unchanged.
- **User Management contrast** (`design-system.css` `.um-*`): darkened faded supporting text (emp id, section sub, field labels, readonly values, footer stat, hints, empties, assignment codes) toward slate-600/700/800/900; headers already use the shared modern `Modal` header + `user-management` typography.
- **Verified:** FE `tsc -b` 0 · `oxlint` exit 0 (no findings in changed files) · `vite build` OK (CSS compiled with new classes) · backend `prisma generate && nest build` OK · backend tests **100/100**. Live browser/viewport screenshots NOT captured this session (see PROJECT_STATUS).

## 2026-07-15 — Fix — Parser sub-header hardening (first-row retention) + documented admin redirect

- **Parser root cause** (`excel-headers.ts` `isSubHeaderRow`): the generic "short digit-free text" fallback could classify a first DATA row of device names/colours (no digits, no "/") as a wire-spec sub-header and skip it — the remaining first-row-drop vector. Hardened: (1) a bare-numeric cell (serial/terminal) or a "left/right" pair marks the row as data outright; (2) only **strong** header evidence counts (wire specs or keyword/regex labels via new `looksLikeStrongHeaderLabel`), never the loose fallback. Genuine multi-row spec headers are still skipped. No test expectations changed, no dummy rows, no special-casing.
- **Regression tests** (`excel-parser-regression.test.cjs`, now 7): + actual DWES WRING_FRAME format (`WIRE NO`, `LENGTH(m)`, leading-space `␣GREEN/YELLOW`), + digit-free first data row retained, + genuine wire-spec sub-header still skipped.
- **/admin/users → /admin/settings**: the explicit authorized redirect already existed nested inside the `system_admin` ProtectedRoute (`App.tsx`) — not the catch-all; added an intent comment. Browser-verified: guest → `/`, technician → `/technician`, sales_director → `/director`, admin → **`/admin/settings`**.
- **Verified:** backend tests **100/100** (7/7 parser); Mid Change E2E **54/54 zero failures** through the real parser + DB (six-row schedule stays six, F-001 first and in order, resume at F-004, final cable 6/6, ranges 1–3/4–6, rollbacks, teardown clean, =H001 unchanged); FE typecheck/lint/build 0; bundle scan 0 hits; all 6 role logins OK.

## 2026-07-15 — Release-readiness — Sales Director scoping, retained test account, popup matrix, guard tests

Release-readiness pass on the day's combined work; local-only, no commits.

- **Sales Director demo account:** `sales_demo` (role `sales_director`, real bcrypt user id via admin API) + entry in gitignored `backend/seeds/demo-accounts.local.json` — auto-appears in the Device Preview role picker (verified live). The pre-existing `sales_director2` DB user (role `ops_director`) was left untouched.
- **Sales Director data scoping (backend):** sales view is aggregate-only. 403 for: `director/workforce|activity|export`, `/users`, `/users/technicians`, all `supervisor/*`, project `report-pdf|report-xlsx`, frame `completion-report|report-pdf`, `tech/audit`, all `qaqc/*` (`users-rbac.ts` — own account only; controllers annotated). The `tech/audit` (technician names, pause reasons, per-cable remarks) and `qaqc/*` (per-inspection results/remarks) exclusions were added in this pass; the aggregate QC pass-rate still reaches sales via `director/stats`. `director/projects-summary` now redacts `technicianName` → "Restricted" for sales callers (`director.service.ts`). Live leak-scan of every allowed payload: no technician usernames, pause details, remarks, or audit strings. Frontend (`DirectorDashboard.tsx`): PDF buttons hidden for sales (kept sanitized Live modal).
- **Inactive-technician hardening:** `assignFrame` now rejects deactivated accounts (`tech.service.ts`).
- **Retained test history (documented):** `demo_midchg_tech` (id from 2026-07-15 Mid Change E2E) stays **deactivated** — hard delete is blocked by immutable session-log audit rows, matching the pre-existing `smoketech1-3`/`director1` precedent. Verified inert: login 401 "Account is disabled", absent from `/users/technicians` (29 active) and mid-change targets, counted inactive (41 users / 36 active).
- **Guard tests** (`backend/test/release-guards.test.cjs`): DEMO_MODE-off → dev demo endpoints 404; sales list/view RBAC; deactivated-assign rejection with zero writes. Suite: **95/95** (incl. the parallel session's `sales-director-rbac.test.cjs`).
- **Popup matrix (headless, read-only):** New Project, Assign Technician, Wiring Upload, User Management, Edit Project, PDF Drawing View, Pause Reason, Mid Change picker, Report Viewer × 600×960/960×600/768×1024/1024×768/1194×834/1600×1100 → **0 defects** (in-viewport, header/footer visible, no page h-overflow, no clipping, no sub-32px targets). Confirm dialogs share the verified `.modal-box-sm` shell (logout is immediate — no dialog to drive).
- **Checks:** FE `tsc -b` 0 · `oxlint` 0 (pre-existing warnings only) · `vite build` 0 · prod-bundle scan 0 hits (`__device-preview`/`DevicePreviewPage`/`demo-login`/`demo-roles`/launcher/credentials) · `prisma generate && nest build` 0 · backend tests 95/95 · health 200.

## 2026-07-15 — DevTool — Device Preview (dev-only tablet viewport testing) + responsive sweep

User request ("Fix and Dev", MaxAI-enhanced spec): a development-only Device Preview so tablet layouts can be tested on a laptop, without adding any manual tablet-mode to production — the real app keeps adapting automatically via responsive CSS.

- **Preview shell** (`src/pages/dev/DevicePreviewPage.tsx`, route `/__device-preview`): renders the REAL app in a same-origin iframe whose CSS size equals the selected preset (media queries see the true viewport — verified live: internal `documentElement.clientWidth` exactly 1024→600 across preset changes) while the frame is `transform: scale()`-fitted and centred (e.g. 600×960 shown at 472px, 98%/62% chips). 17 presets (Mini 600×960 … Maximum 1600×1100, Desktop 1280×900) + Custom W×H, Rotate, Refresh, Login page, Open full (new tab), Exit preview, and toolbar chips for role · W×H · orientation · scale · current route (iframe route polled same-origin).
- **Launcher** (`src/components/dev/DevPreviewLauncher.tsx`): one compact floating button (bottom-left, translucent) that serves the Login page and every authenticated screen; hides itself inside the preview iframe and on the preview page.
- **Prod exclusion:** both components are `React.lazy` behind `import.meta.env.DEV` guards in `App.tsx` (same pattern as `/ui-showcase`); production `dist/assets` scanned — 0 occurrences of `__device-preview`/`DevicePreviewPage`/`demo-login`.
- **RBAC-safe role switching** (`auth.controller.ts`, `auth.service.ts`): `GET /api/auth/dev/demo-roles` (accounts w/o passwords, inactive filtered via new `filterActiveUsernames`) and `POST /api/auth/dev/demo-login { username }` — both **404 unless `DEMO_MODE=true`** (established gate pattern); login goes through the normal bcrypt flow and issues genuine tokens, so every preview role sees exactly its RBAC-permitted routes/data. No frontend credentials, no auth bypass. Legacy `DeviceSimulator`/`deviceProfile` store field left untouched (already a neutral pass-through).
- **Verified:** FE typecheck/lint/prod build green; BE build green; headless drive of the preview (role switch → `/supervisor` with `prod_supervisor` token; preset math exact; no page errors). Note: "Sales Director" persona shares `ops_director` RBAC; the demo-accounts file currently holds no sales-director credential — add one to `backend/seeds/demo-accounts.local.json` and the picker lists it automatically.
- **Responsive sweep:** automated presets(17+3 in-between)×roles(6) audit — results and fixes recorded in the entry below/status file.

## 2026-07-15 — Verify/Fix — Full-session verification pass + inert-roster dimming fix

End-of-session verification of all 21 commits on `migration/fastify-perf-ios` (popup modernization, icons, density, Assign Technician inline roster, Mid Change flow), per user request; local-only, no commits.

- **Checks run:** `tsc -b` clean · `oxlint` pre-existing warnings only · FE `vite build` exit 0 · BE `prisma generate && nest build` exit 0 · backend tests **84/84** (incl. `requestMidChange`/`confirmMidChange`/`changeover`) · `/api/health` 200 · login for all 5 roles + `/api/me` role match · RBAC negatives (401 unauthenticated; 403 for qa/tech on `/api/users`, tech on `/api/users/technicians`) · headless page sweep of Supervisor/Technician/Admin/QA-QC/Director at 1280×900 (no console errors, no horizontal overflow, Material Symbols font loaded) · Assign Technician roster verified live: opens inside the modal, internal scroll, name/@username/status rows, selection enables Assign (screenshot), ASSIGNED rows amber-badged + click-rejected (verified via browser-side response interception — DB untouched), globally-disabled roster (panel already assigned) shows amber notice and inert rows.
- **Fix (design-system.css):** `.tech-select-option:disabled` added beside `.is-disabled` — a globally disabled roster (schedule missing / panel already assigned) previously rendered rows that looked interactive; now they dim like per-row disabled entries. (Assigned rows inside the Assign Technician modal keep their deliberate full-opacity amber styling via the existing `.assign-technician-modal-body` override.)
- **Findings (no code defect):** demo-accounts file lists deactivated `director1` first for `ops_director`, so `accountForRole('ops_director')` index 0 gets 401 — use index 1 (`ops_director1`) or reorder the local file; technician "Mid Change" button is correctly disabled until a panel is `in_progress` (tooltip explains); panel `=H001` now has a live assignment (created during today's testing), so the Assign popup correctly blocks re-assignment with the amber notice.

## 2026-07-15 — UI — Technician dropdown opens downward inside the Assign Technician popup (custom in-modal listbox)

User request (with screenshot): in the Technician Workflow popup on the Production Supervisor page, the technician dropdown opened upward/outside the modal (native `<select>` popup is OS-drawn and unstylable). It must open downward inside the popup with internal scroll, show Name + Username + status per entry with a circular status badge (green AVAILABLE / amber ASSIGNED), keep assigned technicians visible but disabled, and stay clean/compact/responsive.

- **New reusable component** `src/components/assignment/TechnicianSelect.tsx`: accessible custom listbox (combobox trigger + `role="listbox"` menu) replacing the native `<select>`. Menu is absolutely positioned `top: calc(100% + 6px)` inside the dialog — always opens downward, `max-height: min(15rem, 42vh)` with internal `overflow-y: auto`, auto-`scrollIntoView` on open so it stays visible in the modal body. Rows show **full name** (bold) + **@username** (mono, muted) + status pill with dot: green "Available" (selectable) / amber "Assigned" (`aria-disabled`, dimmed, not clickable). Available technicians sort first. Keyboard: Enter/Space/Arrows open + navigate (skipping disabled), Enter selects, Escape closes only the menu (stopPropagation so the modal stays open), click-outside closes. Trigger mirrors `form-select` styling (40px, leading User icon, focus ring, chevron rotates).
- **Wired into** `PanelAssignmentModal.tsx` (the supervisor "Assign Technician" workflow popup) — replaced the native `field-with-icon`+`select` block; selection state, `assignedTechnicianIds`/`availability_status` disable logic, and error clearing unchanged.
- **CSS** in `design-system.css`: `.tech-select*` block (trigger/menu/option/status/dot) next to `.field-with-icon`.
- **Verify:** `tsc -b` clean; `vite build` green (6.55s); headless Chrome opened the Workflow popup and the dropdown — geometry probe confirmed `opensDownward:true`, `insideModalX:true`, `menuScrollable:true`, 29 rows; screenshot shows name/@username/green-dot AVAILABLE pills and highlighted active row. (No technician was in ASSIGNED state in dev DB at test time, so the amber path was verified by code/CSS review only.)
- **Note:** committed by the concurrently-running session as `eaf9023` (“replace technician select with in-modal dropdown”) — same shared-worktree sweeping behavior as earlier today. `TechnicianSelect` is reusable for the Technician Dashboard's Mid Change replacement picker if wanted.

## 2026-07-15 — UI — Consistent modern icons + compact density across all popups/data-entry fields

User request: apply the New-Project modal's modern design consistently to every popup and data-entry field — reduce spacing, improve alignment, resize appropriately, and add relevant modern leading icons to titles, inputs, dropdowns, date/upload/alert controls, and action buttons, keeping one icon style/size/placement, clean and uncluttered.

- **Shared Modal title-icon slot** (`Modal.tsx`): new optional `icon`/`iconTone` props render a tinted rounded chip beside the title. `iconTone` = `primary`|`danger`|`warning`|`success` (blue/red/amber/green). Backward-compatible — modals without `icon` are unchanged.
- **Reusable leading-icon shell** (`design-system.css`): `.field-with-icon` + `.field-lead-icon` (18px, slate-400, 12px inset; `--top` variant pins the icon to the first line for textareas). Any raw `input`/`select`/`textarea` wrapped in it gets a consistent leading icon and 38px left padding — mirrors the `TabletFields` `InputField` look already used by New Project. New `.modal-title-icon` chip styles (34px, tone variants, container-enforced 20px glyph). Added named icons `Mail/AtSign/IdCard/Type` in `named-icons.tsx`.
- **Icons applied across ~35 popups** — title chips on every dialog (semantic tone: delete/reset → danger, pause/rework/reset-password → warning, verify → success); leading icons on every text/select/date/textarea field; leading icon on primary action buttons; upload/QR/search controls already iconized were left intact. Shared components propagate widely: `AppDialogProvider` (confirm/alert/prompt now use a tone chip in the header + prompt-field icon), `DeleteConfirmModal` (danger chip → all delete flows), `ProjectPanelSelect` (project/panel dropdown icons), `TabletFields`.
- **Files:** `Modal.tsx`, `AppDialogProvider.tsx`, `DeleteConfirmModal.tsx`, `ProjectPanelSelect.tsx`, `icons/named-icons.tsx`, `styles/design-system.css`, plus per-modal edits in supervisor (`ProjectsTab`, `AssignTechnicianModal`, `PanelAssignmentModal`, `MidChangeoverModal`, `SmartAssignmentCenter`, `Unified/PanelDrawing/PdfDrawing/Drawings/Frames/Assignment/Review/PendingApprovals`, `ReviewApprovalWorkspace`, `PanelWiringView/PanelDrawingView/ProjectPdfPreview/PanelGaDrawing`), admin (`UserMgmtTab`, `UsersTab`, `HardReset/HardResetDb/DeleteProject/ResetAllProjects`), technician (`Pause/SubmitReport/AssignmentAck/ColumnPrefs/EnrollBiometric/QrScannerOverlay/GaDrawingView`), profile/auth (`MyProfileModal`, `ProductionBootstrapModal`), qaqc `HistoryTab`, director `SummaryReportTab`, `ReportPreviewModal`, `VerificationModal`.
- **Compact density** was already applied at the CSS layer earlier in the day (tighter modal padding/max-widths, 40px fields) and auto-applies to every `.modal-box*`; this pass adds the icon layer and propagates the density to previously-untouched popups.
- **Verify:** `tsc -b` typecheck clean; `vite build` green (exit 0, 5.87s); headless Chrome (`:5175`) confirmed title-icon chips render (New Project = kanban chip, Add User = person-add chip + Create-User button icon) and modals are compact/aligned/uncluttered. Field leading-icons use the established slate-400 styling to match the New-Project reference exactly.
- **Note:** committed to `migration/fastify-perf-ios` alongside a concurrently-running session's work (that session `git add -A`-committed these edits together with its own; it also independently rewrote `PanelAssignmentModal` and added `TechnicianMidChangeModal`, both already using the new `icon` prop). No conflicts; build green.

## 2026-07-15 — UI — Global top header: remove Project card, slightly taller bar

User request (`DWES_TOP_HEADER_UPDATE_15_JULY_2026.md`): remove the Project / Active-Project card from the global top header (project selection stays only in the Production Supervisor workspace) and give the header a little more vertical breathing room, keeping the dark design, auth controls, responsiveness, and live clock unchanged.

- **Project pill removed** (`Topbar.tsx`): deleted the `topbar-project-pill` block (icon + "Project" label + value that showed `No Project Available` / `Selection Required` / active code / live-wiring state). Removed its now-unused imports/locals (`FolderKanban`, `useLiveWiringStore`, `liveWiring`, `isTechLive`) and stopped destructuring the pill-only props. The remaining right-hand controls (user card, biometric button, logout, clock) stay flush-right via the existing `.topbar-controls` `justify-end`/`ml-auto` — no gap is left. `TopbarProps` still declares the project props and `AppShell` still passes them (AppShell's project-context reconciliation keeps the selection store clean for the Supervisor workspace); the header just no longer renders them. Project selection remains solely in the Supervisor **Projects** tab.
- **Noticeably taller header** (`design-system.css`): `.topbar` vertical padding doubled `0.625rem → 1.25rem` (base) and `0.75rem → 1.5rem` (≥1024px); pre-hydration `--dash-topbar-height` fallback bumped `4rem → 5.5rem` / `4.5rem → 6rem` to match (runtime value is still measured by AppShell's ResizeObserver). Height now ~88px tablet / ~100px desktop. Controls remain vertically centered (`items-center`). No color, control, clock, or responsive-breakpoint changes.
- **Scope:** the header is a single shared component (`AppShell` → `Topbar`, used by every authenticated role via `DashboardShell`), so the change applies uniformly across all role pages. Login page has its own layout and is unaffected.
- **Verify:** `tsc -b` typecheck clean; `oxlint` clean; live Vite dev server (`:5175`) confirmed serving the updated module (0 `topbar-project-pill` / `No Project Available` occurrences) and the new padding; app loads with no console errors. Visual confirmation of the authenticated header is via an in-app refresh (header renders only when signed in).

## 2026-07-15 — Data/Cleanup — Complete project-data reset; demo project seeding removed; project delete is now a hard delete

User request (`DWES_COMPLETE_PROJECT_DATA_RESET_15_JULY_2026.md`): permanently delete all existing project data (preserving users, auth, RBAC, settings, schema, and the Fastify migration) and stop demo/legacy seed logic from recreating old projects after restart.

- **Data deleted (via the app's own `POST /api/admin/reset-all-projects` flow, system_admin + confirm phrase):** all 5 canonical seed projects (`DEWA_Project_001/002`, `SEWA_Project_001`, `HITACHI_Project_001`, `FEWA_Project_001`). Dependent tables were already empty (0 assignments/inspections/file-hashes/audit rows; no project-scoped session logs; `backend/uploads` had no project folders). Preserved: 39 user accounts, login history, WebAuthn store, system settings, schema. Backups: `backend/uploads/backups/PROJECT_RESET_2026-07-15_09-13-11.dump` (manual pg_dump) + `RESET_ALL_2026-07-15T05-15-31.dump`/`RESET_ALL_2026-07-15T05-15-31/` (reset flow's own backup).
- **Startup seeding removed** (`main.ts`): the `CANONICAL_SEED_PROJECTS` import loop is gone; `backend/src/common/seed-projects.ts` deleted. Projects are only ever created by a supervisor in the app. User seeding (empty-users bootstrap) is untouched.
- **Dev hard-reset no longer reseeds projects** (`dev.service.ts`): after `HARD RESET DB` the projects table stays empty; response reports `reseeded: 0` and `HardResetDbTab.tsx` copy updated to match.
- **Behavior change — permanent project delete is now a true hard delete** (`project-delete.util.ts`): the database tombstone (`is_active:false, project_state:'deleted'`) existed solely to stop startup seeds resurrecting deleted codes; with seeding removed the row is deleted outright, so a deleted project numbering becomes available for reuse (`codeAvailability` doc/message updated in `projects.service.ts`, comment in `ProjectsTab.tsx`). Panel tombstones (`file_hashes` `panel_deleted` rows) keep working unchanged for stale-file protection.
- **Verify:** BE + FE builds green; `deletion-consistency.test.cjs` updated for hard delete, 5/5 pass. Live sweep as `prod_supervisor`: login OK → project list `[]` (empty state) → `DEWA_PROJECT_001` numbering available again → created `TEST_RESET_VERIFY_001` with 1 panel → permanently deleted it (`project_row=1`, uploads folder removed) → list `[]` and numbering free again. Backend killed and respawned by the dev runner: **0 projects after restart — nothing reseeds.** DB check: 0 rows in `projects`/`tech_assignments`/`panel_inspections`/`file_hashes`/`tech_audit_log`; 39 users intact; frontend :5175 → 200.

## 2026-07-14 — UI — System Administrator dashboard: status only in Settings; sectioned Settings layout

User request: User Management must contain only user-management functions; all system-status information lives only in System Settings; reorganize Settings into clearly separated sections.

- **Shell KPI row removed** (`AdminDashboard.tsx`): the six diagnostics tiles (Uptime, Heap, Users, Projects, Assignments, Errors) rendered above *both* tabs, duplicating DiagnosticsTab and putting system status on the User Management page. The shell no longer fetches diagnostics at all; header, tabs, badge, and routing unchanged. DiagnosticsTab in Settings remains the single status surface (with its own Refresh/DB Ping/Clear Error Buffer actions).
- **System Settings sectioned** (`AdminSettingsPage.tsx`): unlabeled bento grid → four labeled sections with icon headers: **System Overview** (DiagnosticsTab) → **Configuration** (Deployment Mode + DB Config side-by-side) → **Synchronization** (SyncTab) → **Danger Zone** (Delete Project + Hard Reset DB, red-accented heading). Tabs that draw their own cards are no longer wrapped in an extra `.dash-module`, removing the card-in-card nesting. Every tab component's internals, endpoints, confirmations, and RBAC are untouched.
- **User Management unchanged** — already a pure user module (search, role/status filters, sticky-header table, role/status badges, row actions, modal popups for details/edit/reset password/change role/delete/add). Verified it contains zero status cards after the shell change.
- **CSS** (`index.css` admin block only): removed dead `.admin-dashboard-hero + .dashboard-kpis` and `.admin-settings-grid` rules; added `.admin-settings-page/-section/-section-head/-ico/-duo` (danger variant included). Shared `design-system.css`/`themes.css` untouched. Orphan note: `tabs/HardResetTab.tsx` and `tabs/ResetAllProjectsTab.tsx` were already unrouted before this change and remain so.
- **Verify:** FE `tsc` clean; production build green; live headless sweep at 1440/768/390 on `/admin/users` + `/admin/settings`: 0 KPI/status cards on User Management, all four Settings sections present, 39-row user table with sticky header, Add User modal opens, no horizontal body scroll at any width. Backend tests 80/80.
- **Same-day environment note (not a code change):** local dev `WiringSchemeDB` reset to zero operational data at user request — all projects/assignments/inspections/audit/session/file-hash rows and `backend/uploads` cleared; 39 user accounts preserved; sysadmin login re-verified; approved 2026-07 perf indexes applied (schema.prisma diff is index-only); backups: `Backup/2026-07-14_19-53/` (full snapshot incl. uploads) + `backend/backups/pre-reset_20260714_195447/` (pre-wipe pg_dump). WebAuthn passkeys were cleared by the reset flow — users re-enroll biometrics on next login.

## 2026-07-14 — Security/Hardening — Block private files over HTTP; make SSE proxy-safe; document ops constraints

Verification of the login / project-management / wiring-upload / live-sync work surfaced one real leak and two operational gaps, all fixed here.

- **Security (real leak, fixed):** the Vite dev/preview server serves any file under the project root, so `backend/seeds/demo-accounts.local.json` (plaintext demo passwords) and `backend/.env` were reachable over HTTP (`GET /backend/seeds/demo-accounts.local.json` → 200). Added `server.fs.deny` in `vite.config.ts` covering demo `*.local.json`, `.env*`, `certs/**`, `*.pem`/`*.key`, `uploads/**`, `backups/**`, `*.sqlite`, and `backend/data/**`. Both now return **403**. (`preview` serves only built `dist/`, which never contains these, so the guard is dev-server only.)
- **SSE proxy-safety (risk #1, now self-defending):** `/api/events/stream` sets `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform` from the backend, so a buffering proxy no longer silently delays live updates even where the operator did not add the nginx `proxy_buffering off` block (that block already exists in `infra/nginx/conf.d/dwes.conf`). Verified: first SSE frame arrives in 0 ms; headers present.
- **Docs:** new `docs/LIVE-UPDATES.md` records the two live-update operational constraints for deployers — (1) reverse proxies must not buffer `/api/events/stream` (with the exact requirements and a `curl -N` check), and (2) the event bus is in-process, so **run one backend instance**; horizontal scaling requires Postgres `LISTEN/NOTIFY` or Redis Pub/Sub at the single `EventsService.publish()` touch point.
- **Verify:** FE `tsc` + BE `tsc` clean; backend tests 72/72; state 4/4; oxlint 39 (pre-existing). Full requirement sweep **49/49** on a throwaway project: secure demo file present + private + not served + no API exposure; five roles authenticate and RBAC holds; project numbering is the sole identifier with duplicate rejected before save; wiring schedule verifies on upload then shows only a compact re-upload status; SSE hardened + role-filtered; login shows Install App and no demo section; PWA manifest is standalone with a served service worker; supervisor actions are the four compact controls with Delete Project inside Edit; New Project popup gates Add Panel behind Name+Client, overlay has no System Type, and shows only the final project name.
- **Not fixed (unchanged, as instructed):** the demo file's own passwords do not all match the already-seeded database (4/8 differ) — that is the maintainer's private reference to reconcile, not something to guess; and the wiring-parser first-row bug still needs a genuine ENOWA schedule to fix safely.

## 2026-07-14 — Feature — Silent live sync: no flashing, no lost selection, role-filtered SSE

Completes the live-update requirement. The SSE channel existed, but every screen still *reloaded* on each event: the shared loaders called `setLoading(true)` and blanked their lists, and `ProjectsTab.load()` additionally cleared the selected project and panel. So an event (or the 45 s poll) produced a visible flash and dropped the user's selection.

- **Silent refresh is now the default for every automatic update.** `useDwesRefresh` dispatches `{ silent: true }` for server events, the fallback poll, and tab focus. A silent loader never shows a spinner, never blanks a list, never resets a selection, and keeps the last good data if the request fails — it swaps data in place. Applied to all ~20 loaders (supervisor, technician, director, QA/QC, admin, review workspace, assignment modal, report preview).
- **Selection, popups, and form data are preserved.** `ProjectsTab` adopts refreshed project metadata in place instead of re-selecting (which was resetting the panel dropdown on every refetch); `InspectionFormTab` no longer re-seeds check/note/issue fields on a background refresh (it was silently discarding an inspection being typed); `TechnicianDashboard` keeps the open panel and wiring view; `QAQCDashboard` no longer zeroes its KPI tiles.
- **A remote panel change now lands.** `ProjectsTab` silently reloads the panel list on a frames event for the selected project — previously a panel added by another supervisor never appeared.
- **Polling is a fallback only.** New `useLiveConnection` store tracks the stream; while SSE is connected the interval poll is disabled entirely (measured: 0 project-list calls in 9 s). It resumes automatically if the stream drops.
- **Per-tab echo suppression (`X-DWES-Client-Id`).** Mutations are tagged with the originating browser tab; that tab skips its own echo (it already refreshed locally) while every other client applies it. Keying this on the *user* — the first attempt — was wrong: the same person on a tablet and a desktop would have ignored their own other device. Caught in testing.
- **Role-based event filtering (`event-visibility.ts`).** The stream no longer widens REST authorization: a technician receives only assignment events plus changes to panels they are currently assigned to; QA/QC receives panel/project/assignment/inspection scopes; supervisor/admin/director observe everything. Verified: a technician receives nothing about a project they are not assigned to.
- **Verify:** FE `tsc` + build clean; BE `tsc` clean; backend 66/66; state 4/4; oxlint 39 (all pre-existing). Live sync smoke **19/19** — SSE auth-gated, role-filtered, heartbeat alive, per-tab origin tagging; and with a second user changing data: **no navigation, no spinner, no blanked project/panel list, selected project + panel preserved, open popup and typed form data preserved, another user's new panel appears without a reload, no polling while connected.** Feature smoke re-run 32/32 (no regression).

## 2026-07-14 — Feature — Login hardening, PWA install, project management + wiring-upload rework, live sync

- **Login (production-ready):** removed every demo element — demo-account picker, seeded usernames/passwords, auto-fill, and `src/data/demoCredentials.ts` (which bundled `backend/seeds/accounts.seed.json` passwords into the frontend). Also removed the two backend endpoints that served them: `GET /api/login-hints` (**returned plaintext passwords over the API**) and `GET /api/auth/demo-users`. Login now shows only username, password, visibility toggle, sign-in, install, biometric (when enrolled), and a support note stating accounts are issued by the System Administrator.
- **PWA install:** `InstallAppButton` now also covers browsers that never fire `beforeinstallprompt` (iOS Safari, Firefox) with an "Add to Home Screen" hint, hides itself when already installed or running standalone, and is styled as a first-class login action.
- **Admin user reference:** new `docs/ADMIN-USER-REFERENCE.md` — approved user list, roles/permissions matrix, account lifecycle, and security rules. **Contains no passwords**; resets go through the Admin → User Management workflow.
- **Project Information (Supervisor):** replaced 6 mixed buttons (including a duplicate drawing button and a standalone destructive Delete) with 4 compact actions — **Add Panel · Digital Wiring View · Drawing View · Edit**. Edit is now a menu holding *Edit project information*, *Edit panel information*, *Remove panel*, and *Delete Project Permanently* (unchanged confirmation checkbox, warning, permissions, tombstone rules).
- **New Project popup:** project-first workflow. Name + Client are required before **Add Panel** unlocks; Add Panel opens a small overlay asking only for **Panel Name / Panel Type / Voltage Level** (System Type removed); pending panels show in a compact list with Edit/Remove (removal never touches saved projects); Location/Region, Month/Year, and Project Numbering follow; the bottom shows only the **final project name** — the redundant second code identifier preview is gone (the code is still computed internally as the DB key).
- **Project numbering uniqueness:** new `GET /api/projects/code-available/:code` (supervisor-only) checks the numbering live in the form. Because deleted projects are tombstoned rather than removed, a number stays permanently reserved for active, deleted, archived, and tombstoned projects; create remains authoritative (409).
- **Wiring schedule:** the Excel preview/column-mapping/Full View flow is unchanged **during** upload and verification. After upload the Project Information card shows only a compact status strip — uploaded state, file name, cable count, upload/replacement date, and a small **Re-upload Wiring Schedule** button that opens a replace-confirmation popup first. `verify-data` now returns `uploaded_at` to drive it. Replacement remains fail-safe: all parsing/validation happens before any write, so a failed upload leaves the previous schedule untouched (verified).
- **Live data sync (silent, cross-user):** new `backend/src/events/` module — one `APP_INTERCEPTOR` publishes a scoped change event after every *successful* mutating request (no per-service edits), streamed over SSE at `GET /api/events/stream` with a heartbeat. New `useServerEvents` hook (subscribed once in `AppShell`) consumes it via `fetch` streaming so the JWT stays in the Authorization header rather than the URL, and translates each event into the existing in-app event bus. Result: another user's change silently refreshes only the affected project/panel/row — no page reload, no flashing, no lost selection/scroll/form state. Reconnects with backoff; the existing background poll remains the fallback.
- **Verify:** FE `tsc -b` + `vite build` clean; BE `tsc --noEmit` clean; backend tests 66/66; state-consistency 4/4; oxlint 39 warnings (all pre-existing, none in changed files); live smoke **32/32** on a throwaway project (demo endpoints 404, numbering availability + permanent reservation, compact actions, Edit menu, compact wiring status, re-upload confirmation, failed-replacement retention, Add Panel gating and overlay, no console/API errors).
- **Found, NOT changed — pre-existing wiring-parser bug (needs a real ENOWA schedule to fix safely):** `isSubHeaderRow`/`looksLikeHeaderLabel` in `backend/src/upload/excel-headers.ts` classifies any short text cell as a header label, so a first data row with two device-name cells is misread as a sub-header and **silently dropped** (reproduced: 5 data rows → 4 cables, first ferrule missing). Untouched here because the heuristic exists for real merged-header schedules; changing it blind risks breaking production imports.

## 2026-07-14 — Quality — Review/fix/simplify pass over the current refactor (pre-commit)

- **Bugs fixed:** 3 un-awaited `this.svc.findOne(...)` calls in `frames.controller.ts` (panel drawing package/slot-file/download routes) — the async existence check was a floating promise, so a missing/deleted panel produced an unhandled rejection instead of a 404 and the handler kept executing; `panelDrawingAssetDownload` made properly `async`.
- **Duplicate business rules removed:** 9 inline copies of the wiring KPI formula in `tech/qaqc/supervisor` services replaced with the existing shared `wiringKpiPercent` (identical math); 3 local `parseCS` duplicates (`supervisor`, `qaqc`, `projects` services) replaced with shared `parseCableStatus` (tech.service keeps its variant — it normalises `issue`); duplicated inline-SVG safety regex extracted to new `backend/src/common/safe-svg.util.ts` and reused by `upload.service.ts` + `drawing-preview-converter.ts`.
- **React correctness:** `useLatestRequest` now returns a memoized stable object; ~29 effect/callback dependency arrays across 15 files switched from `requests.begin/isLatest/cancel` members to the stable `requests` object (removes all exhaustive-deps warnings for the pattern); `PdfDocumentViewer` render effect declares `rotation`; `AppShell` validation callback declares `user?.role`; `ProjectsTab` `emptyForm` hoisted to module scope and `resetCreateForm` memoized.
- **Dead code / lint:** unused `normalize` (frames.service), unused `codes` (dev.service), unused `XLSX` import (supervisor.service) removed; useless regex escapes fixed in frames.service, frame-store, schedule-compare, upload.service, wiring-document.service.
- **Test alignment:** `drawing-package.service.test.cjs` now awaits the async download controller route.
- **Verify:** frontend `tsc -b` clean, `vite build` clean, backend `tsc --noEmit` clean, backend tests 66/66 pass, state-consistency tests 4/4 pass, oxlint warnings reduced ~60 → 39 (remainder pre-existing/out-of-scope). No behavior, schema, API-contract, or permission changes.
- **Live smoke (2026-07-14, pre-commit):** 53/53 API checks + 24/24 browser checks on a throwaway project (drawing package upload/permissions/stream/download, 2D→3D convert → insufficient-info recovery → Enter-Dimensions regenerate → approve, technician assigned/unassigned/unapproved restrictions, assign / remove-before-start / auto-start lock / mid-changeover carry-over, panel + project deletion tombstones incl. code reservation, GA modal open/zoom/rotate/download/close, no console or API errors, no layout overflow at desktop/tablet). Throwaway data removed; smoke technician accounts left deactivated (session logs prevent hard delete).
- **Deferred (future performance task):** dynamic `import()` of the heavy 3D viewer libraries (three.js / web-ifc / occt-import-js via `EngineeringModelViewer`) to remove the >500 kB main-chunk warning. Intentionally NOT in this change.

## 2026-07-13 — Feature — 2D Drawing → 3D Panel Model conversion (generic, per-Project/per-Panel)

- **Scope (new):** `backend/src/panel-model/{panel-model.service,panel-model-store,glb-builder,drawing-extract,pdf-text}.ts`, `backend/src/common/file-store.util.ts`, `backend/test/panel-model.test.cjs`, `src/types/panelModel.ts`. **(extended):** `backend/src/data/mock-store.ts` (PanelGeneratedModel types + cache), `backend/src/frames/frame-store.ts` (boot-load hook), `backend/src/frames/frames.controller.ts` (+5 routes), `frames.module.ts` (provider), `backend/src/upload/upload.service.ts` (supersede-on-new-2D-revision hook), `src/services/api.ts` (+5 calls), `src/components/ui/PanelGaDrawingModal.tsx` (tabs: Original 2D / Generated 3D View / Uploaded 3D / Revisions / Side-by-Side Verify), `src/index.css` (pm-* styles).
- **Behavior:** Supervisor generates a browser-compatible **GLB** per panel from that panel's own 2D drawings only (Project → Panel → Drawing package boundary; package-revision optimistic-lock on convert/approve; 409 on stale). Pipeline statuses per panel: Drawing Uploaded → Analysing → Extracting Dimensions → Identifying Components → Generating 3D Model → Verification Required → Approved / Conversion Failed / Superseded by New Revision — persisted with a full per-panel audit (sources + SHA-256, package revision, converted/verified by, timestamps, extraction confidence, placeholder list).
- **Honesty gates:** dependency-free PDF text extraction (zlib inflate + Tj/TJ scan) feeds deterministic dimension/apparatus extraction; when no dimension is found the conversion FAILS with the explicit "Insufficient GA, dimensional or internal-layout information…" message instead of inventing geometry; any assumed value renders in a translucent amber placeholder material, is listed, and forces Verification Required. Supervisor corrects (dims/doors/plates/troughs/terminal rows/components) → regenerate → approve. New 2D drawing revisions supersede models (read-only history kept; approval audit preserved).
- **Security:** routes mirror the drawing-package audience (`prod_supervisor` + assigned `wiring_technician`); technicians see/stream **approved models only**; per-request re-validation of project/panel/model ownership (cross-project access 404s); GLB served `Cache-Control: private, no-store` + ETag; frontend hard-resets all modal state when the active Project/Panel changes.
- **No new dependencies; no DB schema changes** — models live as files under `uploads/<code>/models/<frameId>/` (per data rules: frames/drawings/models are files, not rows).
- **Verify:** backend + frontend builds clean; **59/59 backend tests pass** (10 new: GLB validity/determinism, extractor, PDF text, lifecycle incl. technician approved-only access, insufficient-info recovery, supersede, cross-project isolation); **31/31 live E2E checks passed** against an isolated running instance (port 3199, temp UPLOAD_DIR, throwaway project driven through upload→convert→correct→approve→technician access→supersede, then fully cleaned up: assignment deleted, project hard-deleted → 404). Live browser/UI pass not yet run — flagged as follow-up.
- **DB guard:** app-endpoint writes only on a throwaway project (net-zero: hard-deleted); no schema/DDL; real `backend/uploads/` untouched (isolated temp dir).

## 2026-07-13 — Deploy — Provider-neutral hosting assessment (docs only, approval gate open)

- **Scope:** new `docs/hosting/` (15 deliverables: requirements, provider comparison, free-tier verification, recommended architecture, security audit + implementation plan, deployment/DNS/DB/file-storage/backup/incident/billing/provider-migration/final-checklist docs). No code, infra, DNS, or data changes; nothing provisioned.
- Oracle Cloud signup remains blocked for the user → re-assessed hosting provider-neutrally against measured requirements (DB 9.5 MB on PG 18.3; live uploads ≈17 MB, 50 MB/file cap; no queues/websockets/cron; 3 persistent mounts incl. `dwes_auth.sqlite`). 16 providers verified against official pricing (2026-07-13).
- **Verdict:** free tiers cannot host DWES production (no free always-on compute with persistent disk anywhere; Render free PG expires 30 d; AWS "free" auto-closes at 6 mo). **Recommendation: Option C** — Cloudflare Pages (free) + Railway API w/ volumes (~$5–7/mo) + Neon Postgres 18 (free) + R2 backups (free); Option B is its $0 pilot rehearsal; OCI Always Free stays the $0 fallback if signup ever succeeds.
- Security gaps documented for pre-go-live fix (G1–G10 in `docs/hosting/SECURITY_AUDIT.md`), incl. missing ValidationPipe/DTOs, unscoped `GET /api/projects*`, CSP off, and `dwes_auth.sqlite` absent from both backup systems.
- **Restore point:** docs-only additions on branch `change/complete-current-pass-2026-07-12`; awaiting user approval at Gate 0 (`docs/hosting/FINAL_DEPLOYMENT_CHECKLIST.md`).

## 2026-07-12 — Supervisor — Unified technician assignment status indicators

- Replaced the visible `Available` label with an accessible 16 px green indicator and standardized assignment-resource states as yellow **Assigned**, blue **Working**, and red **Busy**.
- Centralized status derivation in `assignmentCenterUtils.ts` and rendering in `TechnicianStatusIndicator.tsx`; both the compact Panel Assignment modal and Smart Assignment Center now share the same semantics and presentation.
- Enforced the three-action workflow in the backend: one active technician per panel, removal only for original pre-start assignments, atomic mid-changeover with linked history and preserved cable progress/time, and no Reassign wording.
- Verified production build, typecheck, lint (existing warnings only), 31 backend tests, and live desktop/tablet popup layout with no horizontal overflow or application console errors.
- Restore branch: `change/complete-current-pass-2026-07-12` from `main` at `5401763`.

## 2026-07-12 — Supervisor — Digital Wiring Monitor converted-view-only + compact Panel Assignment modal (interlocked)

- **Scope:** `src/components/supervisor/digital-wiring-monitor/{DigitalWiringMonitor,WiringScheduleMonitorGrid,CableInspectorPanel}.tsx`, `src/components/supervisor/PanelAssignmentModal.tsx` (new), `src/components/supervisor/TechnicianWorkflowModal.tsx` (shim repoint), `src/utils/assignmentCenterUtils.ts`, `backend/src/tech/tech.service.ts`. Merged from branch `claude/supervisor-panel-assignment-workflow-139414`.
- **Digital Wiring Monitor = converted view only:** the monitor now renders just the converted digital schedule (`#` index + all mapped columns) from `verify-data`, driven purely by the selected project + panel. Removed the live-execution overlay: progress ring, 6-tile KPI strip, per-cable STATUS column, status-chip filter, technician merge (`frameProgress`/`panelDetail`) and its 12s polling. Kept search, color/size/device facets, Export view, Source XLSX, Print. Renders with no assignment. Upload → conversion → review flow untouched.
- **Workflow button → compact Panel Assignment modal:** replaced the fullscreen SmartAssignmentCenter with a new `modal-box-lg` centered modal (panel-scoped): header `project · panel · cables`, panel-state banner, scannable technician list (initials, name, engagement split assigned/in-progress, availability chip). Exactly three interlocked operations — **Assign** (only when unassigned; `POST /tech/assign-frame`), **Remove** (only until start; two-step confirm; `DELETE /tech/assignment/:id`), **Mid-changeover** (only after start; reason from `CHANGEOVER_REASONS`; `POST /supervisor/mid-changeover`). No "reassign". Emits `framesChanged`+`workflowChanged` after each action. `SmartAssignmentCenter.tsx` is now dead code (left in place; removal is a follow-up). Legacy `AssignTechnicianModal`/`MidChangeoverModal`/tabs untouched.
- **Backend interlock guard:** `deleteAssignment` now rejects whenever `started_at != null` (was: only `status === 'in_progress'`, which wrongly allowed deleting started-then-paused work) → 400 "work has already started. Use mid-changeover…". `changeover()` unchanged (already requires started work).
- **Utils:** exported `isActiveAssignment`; added `changeover_locked` to `AssignmentRow` (modal excludes locked rows when resolving the panel's current assignment).
- **Verify:** FE `tsc -b` + BE `tsc --noEmit` clean. Live-app (worktree dev server, WiringSchemeDB): monitor shows converted grid only, network shows only `verify-data` (no frame-progress/panel-detail); assignment modal on `=H001` — remove-before-start OK, re-assign OK (DB state restored, row 61→62), DELETE on a started assignment (id 51) → 400 with new message. Changeover-form UI branch not live-exercised (no started assignment in dev data; creating one is irreversible by design) — endpoint itself unchanged/pre-existing.
- **DB guard:** app-endpoint writes only (assign/delete on the test panel, net-zero); no schema/DDL; no raw SQL writes.

## 2026-07-11 — Fix — Layout stability: decouple layout from hardcoded topbar height (root cause), measure it at runtime

- **Scope:** `src/styles/design-system.css`, `src/components/layout/AppShell.tsx` (+ read-only probes `scripts/layout-stability-probe.mjs`, `layout-tablet-shots.mjs`, `layout-crossmodule-verify.mjs`). Fixes recurring layout instability (overlap/mis-sized fill) across the app, worst on tablet-portrait.
- **Verified root cause (measured, not assumed):** the whole layout height model was pinned to a hardcoded magic number `--dash-topbar-height: 5.5rem/5.75rem` (88–92px), and the mobile nav drawer to a hardcoded `top: 64px` — but `.topbar` is a **sticky flex-wrap bar whose real height varies** with width/content: it wraps to **151px on tablet portrait (≤834px)**. Probe evidence: at 768px the topbar was 151px while the var said 88px (**63px error** in every `min-height: calc(100dvh - var(--dash-topbar-height))` on `.dash-layout`/`.dash-main`/`.dash-sidebar`), and the mobile drawer overlapped the topbar by **87px** (drawerTop 64 vs topbarBottom 151). Not transforms/z-index/overflow — those measured clean (0 horizontal overflow at all resolutions; no `position:fixed` trapped under a transform).
- **Permanent fix (not a workaround):**
  - Removed the fragile `min-height: calc(100dvh - var(--dash-topbar-height))` from `.dash-layout`, `.dash-main`, `.dash-main--flush`, `.dash-sidebar`. The viewport-fill is now pure flexbox — `.app-shell{min-height:100dvh;flex-column}` + sticky topbar (natural in-flow height) + `.dash-layout{flex:1}` + children `flex:1`/`align-self:stretch` — so it fills exactly at **every** resolution with no magic number.
  - `AppShell` now measures the real topbar height with a `ResizeObserver` and writes it to `--dash-topbar-height` (px) on `.app-shell`, so the var always equals reality (updates on wrap/resize/content change). The rem values remain only as pre-hydration fallback.
  - Mobile drawer `.dash-sidebar--mobile-open` now starts at `top: var(--dash-topbar-height)` (real height) instead of `top-16`.
- **Result (re-measured live):** var accurate at all sizes (93px desktop / 151px tablet, ≤1px), **drawer overlap 0px** (was 87), **0 horizontal overflow** and **0 trapped-fixed** across admin/supervisor/technician/qaqc at 1440 & 768; load CLS on `/supervisor` improved 0.032 → 0.019, zero CLS on tab-switch/idle/resize.
- **Reviewed, left as-is (evidence-backed):** z-index (no measured conflict; the topbar↔drawer overlap was positional, now resolved); the `.rwa-panel-head` sticky in a `backdrop-filter` `.rwa-project-card` is flagged by the probe but is a **tolerant** case (backdrop-filter ancestors don't break sticky-within-scroll like they break `position:fixed`) — no functional break; `admin` dashboard shows async-content CLS in `.dashboard-content` (data loading, not the layout system) — logged as a separate follow-up.
- **Also in this session:** popup typography modernization (previous entry) confirmed still in place.
- **Verify:** `npm run build` exit 0; live probes above; `background-attachment: fixed` and glass unchanged.
- **Restore point:** clean `main` @ `7813073`.

## 2026-07-11 — UI — Popup typography modernization (clearer weight/contrast; User Management untouched)

- **Scope:** `src/styles/themes.css` (+ `scripts/modal-typography-shots.mjs`, read-only visual helper). Popup dialog text read too thin/faint; this lifts weight and contrast without touching layout or functionality.
- **Root cause:** modal body copy inherited weight-400, and much of the secondary text used a very light grey (Tailwind `text-slate-400`/`text-slate-500`, e.g. `#94A3B8`), so descriptions/meta/help lines were hard to read (e.g. the New Project modal's "Each panel has its own name…" and "Special characters…" hints).
- **Fix:** a scoped, unlayered block in `themes.css` (wins over Tailwind's utility layer) that (1) sets modal body copy to a medium weight (500) so unset-weight text is no longer thin, and (2) remaps the lightest greys inside dialogs to the theme's readable muted tone `--t-muted` (arctic `#334155`, slate-700). Header subtitles (which sit outside `.modal-body`) strengthened directly. Weight/colour only — **no layout, spacing, or functional change**; explicit weights (bold titles, semibold labels/buttons) are preserved.
- **Scope guard:** applies to form/confirm dialog sizes (`.modal-box`, `-sm`, `-lg`, `-form`, `-wide`, `-xl`) which all route through the shared `Modal` component (incl. `AppDialogProvider` confirms and `DeleteConfirmModal`). **User Management is excluded** — its list modal `.modal-box-team` is omitted and its sub-dialogs (`.um-shell`/`.um-edit`/`.um-create-form`) are dropped via `:not(:has(...))`. Dense workspace modals (`.modal-box-full`/`.modal-box-fullscreen` — PDF viewer, Excel wiring grid) and non-dialog portals (toasts, popovers, tablet wiring workspace) are untouched.
- **Verify:** `npm run build` exit 0 (CSS compiles, `:is()`/`:not(:has())` fine); before/after screenshots — New Project dialog descriptions go from faint slate-400 to clearly readable `--t-muted`; **User Management modal pixel-identical before/after** (confirmed excluded).
- **Restore point:** clean `main` @ `7813073`.

## 2026-07-11 — Bugfix — Backend/frontend run fully hidden: launcher spawns Vite/Nest directly as node (no cmd.exe window)

- **Scope:** `scripts/launch-dwes.mjs`. Removes the last visible terminal from the desktop-app startup so only the app UI is shown; backend + frontend run as detached background processes.
- **Root cause (empirically confirmed):** the launcher started the dev servers with `npm run dev` / `npm run start:dev`, which on Windows chains `node → npm-cli → cmd.exe → vite/nest`. `windowsHide` applies only to the immediate child, so the `cmd.exe` shell allocated a **visible console window** (reproduced: the npm-shell spawn created 1 new visible `cmd.exe`; direct-node spawn created 0). The retired `DWES-startup.bat` had the same issue plus an explicit persistent `start "…" cmd /k "npm run dev"` frontend window.
- **Fix:** the launcher now resolves the local CLI entry points and spawns them **directly as `node`** — `node node_modules/vite/bin/vite.js …` (frontend dev/preview) and `node backend/node_modules/@nestjs/cli/bin/nest.js start --watch` (backend dev) — bypassing the `npm→cmd.exe` shell. Each is spawned `detached`, `windowsHide: true`, stdio → `logs/*.log`, and `unref()`'d, so no console appears and the servers survive the launcher (and wscript) exiting — there is no terminal to keep open or close. Prod backend was already direct `node dist/main.js`. Falls back to the npm script if a CLI entry is missing.
- **Wiring (already in place, verified this session):** autostart = `DWES App` scheduled task (`AtLogOn`, 60 s delay) → `start-dwes-silent.vbs` → `launch-dwes.mjs`; desktop `DWES.lnk` → `Start DWES (Hidden).vbs` → same launcher. Legacy `DWES-startup.bat` and the separate `DWES Backend` prod task are retired/unregistered (they were the source of the visible frontend console).
- **No behavior change** to ports, health-gating, recovery, logging, or the app window; only the process-spawn transport changed.
- **Verify:** `node --check scripts/launch-dwes.mjs` OK; `node …/@nestjs/cli/bin/nest.js --version` → `10.4.9` (direct invocation works); empirical Win32 `IsWindowVisible` test — direct-node Vite spawn = **0 new visible windows (PASS)**, old npm-shell spawn = **1 new `cmd.exe` window (FAIL)**; live stack (`:3001`/`:5175`) untouched; throwaway test ports cleaned up.
- **Restore point:** clean `main` @ `7813073`.

## 2026-07-11 — App-wide — Project removal redesigned to one permanent-delete workflow

- **Scope:** `src/constants/projectDeletion.ts`, `src/pages/supervisor/tabs/ProjectsTab.tsx`, `src/pages/admin/tabs/DeleteProjectTab.tsx`, `src/services/api.ts`, `backend/src/projects/projects.service.ts`, `backend/src/admin/admin.controller.ts`, `backend/src/admin/admin.service.ts`.
- **UI change (all project-delete screens):** project deletion now uses one simple modal with only: (1) a clear permanent-delete warning, (2) one confirmation checkbox, and (3) buttons **Cancel** + **Delete Project Permanently**.
- **Removed from app delete UX:** soft-delete behavior, Remove from List option, Delete Everything Related option toggles, preservation messaging, backup messaging, precheck detail panels, and other multi-scope delete choices.
- **Consistency update:** Supervisor and System Admin now share the same warning text and checkbox wording through a shared `projectDeletion` constants module.
- **Backend deletion behavior:** both supervisor delete (`DELETE /api/projects/:code`) and admin hard delete (`POST /api/admin/projects/:code/hard-delete`) permanently remove project-related database rows and storage files, including `panel_inspections`, `tech_assignments`, `file_hashes`, `tech_audit_log`, `session_log`, project row/cache records, and `uploads/<PROJECT_CODE>/`.
- **Result:** the default and only project deletion workflow in DWES is permanent deletion of the selected project and all related data/files.

## 2026-07-11 — Bugfix — View Drawing renders blank: PdfDocumentViewer viewport measurement

- **Scope:** `src/components/ui/PdfDocumentViewer.tsx`, `src/styles/design-system.css`, `scripts/drawing-viewer-smoke.mjs` (new read-only regression smoke). Fixes the Supervisor "View Drawing" popup (and the report/project PDF preview modals that share the viewer) showing a blank viewer instead of the PDF.
- **Root cause:** the scroll viewport that hosts the rendered canvases was conditionally unmounted whenever `loading`/`rendering` was true, but the `ResizeObserver` measuring its width attached once on mount with `[]` deps. At mount the viewport was unmounted (busy), so the observer never bound to a live node, `containerWidth` stayed `0`, and the page-render effect bailed at its `containerWidth <= 0` guard — no canvases were ever appended (permanently blank; deterministic for the report preview modal which passes `loading=true`).
- **Fix:** the viewport + canvas host now stay mounted for the component's lifetime (observer stays bound; size seeded synchronously via `getBoundingClientRect` so the first paint doesn't wait on the async RO callback); loading/error render as an overlay (`.pdf-viewer-overlay`) on top instead of replacing the viewport. Added `firstPagePainted` so multi-page drawings become readable as soon as page 1 paints (overlay no longer lingers over already-rendered pages), and the host is cleared on document teardown.
- **Behavior preserved:** zoom in/out, fit width, fit page, page navigation, search, fullscreen, and download are unchanged; no API/schema change (drawing file endpoint `GET /projects/:code/drawings/:id/file` already worked).
- **Verify:** `npm run build` exit 0; new `scripts/drawing-viewer-smoke.mjs` drives the real Supervisor flow against project `132KV33KV_KSA_RIYADH_2026_001` (37-page drawing) — 6/6 PASS: button enables, canvas renders non-blank (1366×965), page count `/ 37`, no error overlay, zoom keeps pages rendered, no PDF console errors; screenshot confirms the drawing content renders with no overlay.
- **Restore point:** clean `main` @ `7813073`.

## 2026-07-10 — Infra — Audit fixes: deploy health-gate, TLS renewal, env quoting + canonical values

- **Scope:** `infra/oci/scripts/redeploy-dev.sh`, `infra/docker/docker-compose.yml`, `infra/docker/.env.{dev,production}.example`, `docs/{DEV-DEPLOY,BACKUP-RESTORE-OCI,OCI-RUNBOOK}.md`, `.dockerignore`. Applies the production-readiness audit's active-path findings.
- **H1 (High) — `redeploy-dev.sh` false SUCCESS:** the nginx cutover was unguarded and unverified, so a crash-looping public edge still reported SUCCESS with no rollback. Now `compose up -d --no-deps nginx || return 1` **and** an active `/healthz` probe of the nginx edge before success — a broken edge triggers auto-rollback.
- **H2 (High) — TLS renewal never ran:** the certbot renew loop is `profiles: [\"certbot\"]` and the push-to-main deploy never starts it (certs would expire ~90 days). Added `restart: unless-stopped` to the certbot service and a documented VM cron (`certbot renew --dry-run`-verified form) that runs `renew` + `sync-letsencrypt-to-nginx.sh` (copy + `nginx -s reload`).
- **M1 (Medium) — env `source` abort:** `RP_NAME=DWES (Dev)` unquoted aborted `init-letsencrypt.sh`/`verify-migration.sh` under `set -euo pipefail`. Now `RP_NAME='DWES (Dev)'` (verified: `.env` sources cleanly).
- **M2 (Medium) — DR restore not runnable:** `BACKUP-RESTORE-OCI.md` used host-side `pg_restore -h postgres` (unresolvable) + hardcoded `/mnt/dwes-data`. Rewritten to restore through the container (`docker compose exec -T postgres pg_restore … < …`) using `${DATA_ROOT}`.
- **M3 (Medium) — cert-reload cron missing on push-to-main path:** documented the renewal+reload cron in DEV-DEPLOY ops.
- **Canonical values:** `CERTBOT_EMAIL=dwes@ingenious-network.com` and `dwes.ingenious-network.com` set across both env templates + docs (production email/domain; not secrets). Also: `.dockerignore` now excludes `**/.env`/`infra/docker/.env` (keeps `.env` out of the on-VM build cache); OCI-RUNBOOK cert-path corrected to `${DATA_ROOT}/ssl/nginx`.
- **Secure Auto Mode:** no secret values generated/embedded.
- **Verify:** `.env` sources clean; `redeploy-dev.sh` syntax + guards present; `docker compose config` valid; 3/3 workflows valid; backend 24/24; no secrets in tree; full-stack smoke re-run PASS.

## 2026-07-10 — Infra — Production hardening (log rotation, TLS http2, ops docs)

- **Scope:** `infra/docker/docker-compose.yml`, `infra/nginx/conf.d/dwes.conf`, `infra/docker/.env.{dev,production}.example`, `docs/OCI-RUNBOOK.md`, `docs/DEV-DEPLOY.md`. Hardens the simplified single-VM path for production; preserves the existing architecture (adapts only what is necessary).
- **Changes:** (1) **bounded logs** — compose `x-logging` json-file `max-size`/`max-file` (override via `LOG_MAX_SIZE`/`LOG_MAX_FILE`) on postgres/api/nginx/certbot so logs can't fill the VM disk; (2) **nginx** `listen 443 ssl;` + `http2 on;` — the official nginx ≥1.25 form, removes the deprecated `listen … http2` warning; (3) `CERTBOT_EMAIL` added as a **configurable placeholder** (blank → `admin@$DWES_DOMAIN`); (4) runbook: deploy-paths / production-hardening / security checklist / go-live-inputs sections; (5) DEV-DEPLOY ops section (daily backup cron, log rotation, monitoring, TLS contact).
- **Secure Auto Mode:** no secret values generated or embedded — only env-var references and empty placeholders; email/domain/DNS/IP stay configurable.
- **Verify:** `docker compose config` valid (log rotation on 4 services); nginx image rebuilt; **full-stack smoke PASS** — restore real v18.3 dump → `/healthz`, `/api/health`=`db:connected` through nginx TLS, frontend served, HTTP→HTTPS 301, HSTS present.

## 2026-07-10 — Docs — Cloud onboarding guide (accounts/credentials checklist)

- **Scope:** `docs/CLOUD-ONBOARDING.md` (new) — every account/service/credential required to take the dev/demo deployment from an empty environment to live, grouped by category (GitHub, OCI, Domain/DNS, SSL/TLS, Email, Database, Monitoring, Backup, Security), each with purpose/mandatory-optional/registration+docs links/info needed/credential handling/pricing.
- **Fix:** `docs/DEV-DEPLOY.md` step 3 — the clone command used unauthenticated HTTPS, which fails against the private repo; switched to SSH clone via a GitHub Deploy Key (documented in the new guide §A5), added cross-reference link at the top of both docs.
- **Security:** no credential values generated, displayed, or embedded anywhere — every item documents only the reference (env var / GitHub Secret name) with the real value entered by the user. Flags one real architecture fork (this repo's `infra/oci/terraform/*` — Bastion-only, no port 22 — vs. the already-built/verified direct-SSH dev path) rather than assuming; also flags an incomplete OCI-backup wiring gap found in `backup-oci.sh` without silently fixing it (out of scope).
- **Verify:** evidence-checked against live state this session (`git remote -v` empty, `gh auth status` logged out, `~/.oci/config` present but API key missing, `nslookup` confirms Turbify nameservers/current alias) and against source (`docker-compose.yml` env guards, `init-letsencrypt.sh` HTTP-01 requirement, `webauthn-config.ts` RP_ID rules, full grep sweep confirming no email/APM SaaS in the codebase).

## 2026-07-10 — Infra — Continuous dev/demo deploy pipeline (dwes.ingenious-network.com)

- **Scope:** Push-to-main CI/CD to a simplified OCI VM for a live dev/demo environment the Director reviews. Reuses the existing Docker Compose stack (services/env/networking/health); only required, verified adaptations below.
- **Container build blockers (first-ever clean image builds — prior CI "passes" were BuildKit cache hits):**
  - `Dockerfile.api`: ship the generated Prisma v7 client (`.prisma` + `@prisma/client`) from the build stage (prod-deps never runs `prisma generate` → boot crash).
  - `Dockerfile.api`: build-only placeholder `DATABASE_URL` for `prisma generate` (`prisma.config.ts` resolves `env('DATABASE_URL')` eagerly; generate never connects; real URL injected at runtime). No migrations.
  - `Dockerfile.nginx`: copy `infra/nginx/snippets/` that `dwes.conf` includes (else `nginx -t` fails, nginx won't start).
- **Runtime blocker — `SQLITE_CANTOPEN` (WebAuthn store):** the non-root `dwes` user couldn't write the host-owned bind mounts. Added `infra/docker/scripts/api-entrypoint.sh` (chowns `/app/data`+`/app/uploads` as root, drops to `dwes` via `gosu`). Keeps the container non-root. No app-logic change.
- **PostgreSQL 18 alignment (verified, not assumed):** source dumps are v18.3, which cannot restore into `postgres:16`. Compose now uses `postgres:18-alpine` and the official 18+ data-dir layout (mount at `/var/lib/postgresql`, not `/var/lib/postgresql/data`; refs docker-library/postgres PR #1259, issue #37). Backup service bumped to 18 too.
- **New:** `.github/workflows/deploy-dev.yml` (push→build+test→SSH deploy), `infra/oci/scripts/redeploy-dev.sh` (native on-VM build, health-gate on `db:connected`, auto-rollback to prior commit, data-safe), `infra/docker/.env.dev.example`, `docs/DEV-DEPLOY.md`.
- **Data safety:** restore is `pg_restore`/`psql` into the container DB only; no Prisma migrations / no schema changes; postgres/uploads/auth volumes preserved across deploys. Per `dwes-db-guard`.
- **Verified end-to-end:** both images build from the working tree (exit 0); integration smoke restored the real v18.3 dump into `postgres:18` (7 tables, 44 users, 14 projects) and `GET /api/health` → `{"status":"ok","db":"connected"}`.
- **Human prerequisites (not automatable here):** provision VM, DNS A record, GitHub repo + `origin` + Secrets, provide DB dump — see `docs/DEV-DEPLOY.md`.

## 2026-07-10 — Infra — Harden go-live orchestrator (pre-go-live audit)

- **Scope:** `scripts/go-live.mjs`, `scripts/go-live-preflight.mjs`, `package.json`, `docs/GO-LIVE-REPORT.md`, `docs/HUMAN-ACTIONS.md`, `docs/OCI-RUNBOOK.md`. Audit of the never-reviewed orchestrator (`cbbb100`, after the second-review range).
- **Fixes:** (1) secret redaction — Cloudflare token / Vault material / GitHub secret values / private keys are now `***` in `go-live.log`, and `gh secret set` values pipe via stdin (never in argv); (2) fail-fast — missing `origin` remote / `gh` auth aborts **before** any cloud mutation (also in preflight); (3) health-gated post-deploy — polls `/api/health` before k6, degrades gracefully; (4) honest bootstrap step + fixed broken `git clone .` in emitted script; (5) new `--plan-only` (`npm run go-live:plan`) terraform preview that stops before apply/DNS/secrets; (6) Vault-secret create is now re-run safe; preflight also checks SSH key files + warns on missing k6.
- **Branch:** `claude/oci-single-vm-production-9971bf` (fast-forwarded to OCI tip `d2ce4ce`; changes on top for review — not merged).
- **Verify:** `node --check` both scripts, `oxlint` clean; redaction unit test (real helpers) → `***`; `--plan-only` proven to short-circuit before cloud steps; origin guard proven to abort before terraform; preflight surfaces new checks; `package.json` parses.
- **No behavior change** to the app, backend, or terraform resources — orchestration safety only.

## 2026-07-09 — Infra — Autonomous session verification pass

- **Scope:** `docs/AUTONOMOUS-SESSION.md`; refreshed cutover dump; verified build (exit 0), backend tests (24/24), terraform validate, compose config.
- **Blocked:** preflight exit 1 (secrets placeholders); no git `origin` remote; `gh` not authed.
- **Checkpoint:** `PREFLIGHT_BLOCKED` — resume with `npm run go-live` when secrets filled.

## 2026-07-09 — Infra — Go-live orchestrator commit (`cbbb100`)

- **Scope:** Author confirmed technical production readiness; outstanding items documented in `docs/GO-LIVE-REPORT.md`; `LOCAL_PG_PASSWORD` added to secrets example.
- **Deploy:** Pending `deploy-secrets.local.env`, `~/.oci/config`, `gh auth` on deployment host; then `npm run go-live`.

## 2026-07-09 — Infra — Go-live orchestrator + migration prep (blocked on credentials)

- **Scope:** `scripts/go-live.mjs`, `scripts/go-live-preflight.mjs`, `deploy-secrets.local.env.example`, Terraform AD retry + KMS vault key + `app_private_ip` output, `docs/GO-LIVE-REPORT.md`, `docs/HUMAN-ACTIONS.md` blocker section.
- **Branch:** `change/oci-single-vm-prod-2026-07-09`
- **Prep:** `backend/backups/cutover_20260709.dump` (47 KB); 123 upload files; local DB counts in `docs/go-live-artifacts/`.
- **Blocked:** `deploy-secrets.local.env`, `~/.oci/config`, `gh auth` not visible in agent session — terraform/DNS/bootstrap not applied.
- **Verify:** `npm run build` exit 0; `npm run go-live:preflight` documents blockers.

## 2026-07-09 — Infra — Overnight OCI prep (review fixes, bootstrap UI, E2E)

- **Scope:** Certbot renew path fix, Bastion deploy workflow, director password RBAC, `ProductionBootstrapGate` UI, E2E compose stack, k6 one-command, `HUMAN-ACTIONS.md`, `MORNING-REPORT.md`.
- **Branch:** `change/oci-single-vm-prod-2026-07-09`
- **Verify:** `npm run build`; `npm --prefix backend test` (24/24).

## 2026-07-09 — Infra — OCI single-VM enterprise hardening (me-dubai-1)

- **Scope:** Security gates (login-hints, env, seed), deep health check, production bootstrap (password + WebAuthn), bind mounts `/mnt/dwes-data`, TLS/certbot paths, Postgres tuning, Bastion/Vault/monitoring Terraform, migration scripts, Playwright E2E scaffold, k6 load test, deploy prompt + director access docs, Cursor rules/skills update.
- **Branch:** `change/oci-single-vm-prod-2026-07-09`
- **Human-gated:** `terraform apply`, data cutover (`data-migration`), production WebAuthn device test.
- **Verify:** `npm run build`; `npm --prefix backend test`; `terraform validate` in `infra/oci/terraform`.
- **Files:** `infra/**`, `backend/src/common/health.*`, `backend/src/auth/production-bootstrap.service.ts`, `docs/DEPLOY-TIMELINE.md`, `.cursor/rules/oci-production.mdc`, `e2e/**`

## 2026-07-09 — Infra — OCI production deployment package (me-dubai-1)

- **Scope:** Docker (API + Nginx), Compose prod/staging, Terraform (VCN/VM/volume/Object Storage), OCI deploy/backup/rollback scripts, GitHub Actions CI + OCIR deploy workflow, JWT refresh tokens, helmet/throttler/CORS env, docs/runbooks.
- **Region:** me-dubai-1 (Sharjah primary; Chennai via UAE until India DR).
- **Verify:** `npm run build`; `npm --prefix backend run build`; `npm --prefix backend test`.
- **Files:** `infra/**`, `.github/workflows/*`, `docs/OCI-*.md`, `backend/src/auth/auth-token-store.service.ts`, `backend/src/main.ts`, `src/services/api.ts`, `src/store/useAuthStore.ts`

## 2026-07-09 — Fix — Production-ready automatic startup after Windows reboot

- **Requirement:** Fully automatic, resilient boot — no manual steps after restart.
- **Implementation:**
  - `scripts/wait-for-postgres.mjs` — TCP + `SELECT 1` before Nest (up to 120s).
  - `scripts/launch-dwes.mjs` — phased boot with structured logs (`logs/launcher.log`, `logs/startup-report.json`): PostgreSQL → partial-stack recovery → backend (retry every 20s, max 8 spawns) → backend health gate (120s) → frontend → full stack wait (240s).
  - `scripts/register-dwes-autostart.ps1` — Task Scheduler **DWES App**, 60s post-logon delay.
  - Login page — **"Server is still starting"** banner, Sign In disabled until `/api/health` OK.
- **Verify:** `npm run build` exit 0; `npm run startup:wait-postgres`; autostart registered.
- **Files:** `scripts/wait-for-postgres.mjs`, `scripts/launch-dwes.mjs`, `scripts/register-dwes-autostart.ps1`, `src/pages/LoginPage.tsx`, `src/styles/design-system.css`, `package.json`, `CHANGELOG.md`

## 2026-07-09 — Fix — Reliable stack boot after laptop restart

- **Problem:** Every reboot left Vite on `:5175` without a healthy Nest on `:3001` (PostgreSQL not ready at logon, partial stack, no autostart delay). Demo login failed until manual backend start.
- **Fix:** `launch-dwes.mjs` waits for PostgreSQL (`:5432`, up to 90s), recovers partial stacks, retries backend every 25s, starts Vite only after `/api/health` OK, extends total wait to 180s. Registered **DWES App** scheduled task (60s post-logon delay). Login page shows a “server still starting” banner when API is offline.
- **Verify:** `npm run build` exit 0; `register-dwes-autostart.ps1 -Mode Dev` registered for current user.
- **Files:** `scripts/launch-dwes.mjs`, `scripts/register-dwes-autostart.ps1`, `src/pages/LoginPage.tsx`, `vite.config.ts`, `CHANGELOG.md`

## 2026-07-09 — Fix — Demo login after PC reboot (backend down / proxy 502)

- **Problem:** After reboot, Vite on `:5175` could run while Nest on `:3001` was dead or had drifted to `:3002+`; demo `@sysadmin` login showed "Can't reach the server" (502 via stale proxy).
- **Fix:** `launch-dwes.mjs` frees stale `:3001` before starting backend and health-checks runtime port from `backend/.dwes-port`; Vite `/api` proxy uses dynamic `router()` to re-read that file; dev launcher sets `DWES_MODE=dev` → Nest binds `:3001` only (no port scan).
- **Verify:** Backend restarted; `POST /api/auth/login` with the private local administrator account via `:5175` proxy → OK.
- **Files:** `scripts/launch-dwes.mjs`, `vite.config.ts`, `backend/src/main.ts`, `CHANGELOG.md`

## 2026-07-09 — Verify — Pass 2 multi-project + panel switch smoke (17/17)

- **Scope:** `scripts/project-switch-smoke.mjs` Pass 2 only — supervisor A↔B switch, document badges, Digital Wiring Monitor, technician PanelsTab, `tech01` 403 spot-check.
- **Fix:** `setupBrowserApiProxy()` in `scripts/smoke-utils.mjs` (bypass stale Vite `/api` 502); `ProjectsTab` skip no-op project reselect + auto-reselect sole panel after frames reload; smoke output dir `pass2-project-switch-<timestamp>/`.
- **Verify:** `node scripts/project-switch-smoke.mjs` → **17/17 ALL PASS** — `.smoke-shots/pass2-project-switch-1783598798705/report.json` + 7 screenshots. View Drawing SKIP when project A has no drawing; intra-project panel switch SKIP (1 panel per canonical project).
- **Files:** `scripts/project-switch-smoke.mjs`, `scripts/smoke-utils.mjs`, `src/pages/supervisor/tabs/ProjectsTab.tsx`, `CHANGELOG.md`

## 2026-07-09 — Verify — Production verification pass + smoke harness fixes

- **Problem:** Automated smoke scripts failed intermittently when Vite proxy was stale (502) or when API `frames[0]` id differed from UI deduped panel dropdown id; doc-avail scenario 6 ran after project switch without restoring panel context.
- **Fix:** Shared `selectProjectPanel()` in `scripts/smoke-utils.mjs` (wait for selectors, resolve deduped panel id); prod-readiness + doc-availability use resolved panel id for uploads/events; doc-avail restores primary panel before instant toggle test; tech1 browser wait for panel cards.
- **Verify (2026-07-09 session):** `npm run typecheck` + `npm run build` exit 0; `tech-api-security-matrix.mjs` 74/74; `prod-readiness-final.mjs` 29/29 (`.smoke-shots/prod-ready-1783598348554/`); `doc-availability-smoke.mjs` 14/14 (`.smoke-shots/doc-avail-1783598652280/`); `project-switch-smoke.mjs` 17/18 (View Drawing skip — no drawing on panel).
- **Files:** `scripts/smoke-utils.mjs`, `scripts/prod-readiness-final.mjs`, `scripts/doc-availability-smoke.mjs`, `CHANGELOG.md`

## 2026-07-09 — UI — Supervisor Digital Wiring Monitor (fullscreen)

- **Problem:** Supervisor "Digital Wiring View" opened the technician tablet execution UI (`DigitalWiringFrame`) — not a professional read-only monitor with full Excel schedule grid, cable inspector, and summary dashboard.
- **Fix:** Replaced modal content with fullscreen **Digital Wiring Monitor**:
  - Complete wiring schedule grid from uploaded Excel (`verify-data` + `_raw` cells), with search, status/color/size/device filters, sortable headers, frozen #/first-column + status column.
  - Row selection → read-only cable inspector (source/dest, ferrule, color, size, execution status, technician, timestamps, QA).
  - KPI strip: total, completed, in progress, pending, verified, rework + overall progress ring.
  - Export filtered view (client XLSX), source schedule (`supervisorApi.wiringScheduleXlsx`), and print.
  - Polls `frameProgress` + `panelDetail` every 30s for live execution status — no edit controls.
- **Files:** `src/components/supervisor/digital-wiring-monitor/*`, `PanelWiringViewModal.tsx`, `ProjectsTab.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run typecheck` + `npm run build` exit 0; smoke: Supervisor Projects → Digital Wiring Monitor on panel with wiring schedule.

## 2026-07-09 — Fix — Supervisor document sync + technician wiring UX

- **Problem:** After drawing delete/upload, Projects tab View Drawing badge/button stayed stale; technician Digital Wiring smoke failed (no dialog semantics / open detection).
- **Fix:** `useProjectPanelDocumentStatus` — optimistic delete, silent refresh on `dwes:documents-changed` (no loading flash/race); ProjectsTab closes drawing view on delete; `PdfDrawingUploadModal` emits document events; `WiringWorkstation` adds `role="dialog"`, Escape-to-exit, focus on open, `data-testid`; `TechnicianDashboard` body scroll lock when wiring open.
- **Verify:** `npm run build` + `npm run typecheck` exit 0; `node scripts/prod-readiness-final.mjs` 23/23 pass (`.smoke-shots/prod-ready-1783596321941/`).
- **Files:** `src/hooks/useProjectPanelDocumentStatus.ts`, `src/pages/supervisor/tabs/ProjectsTab.tsx`, `src/components/supervisor/PdfDrawingUploadModal.tsx`, `src/components/technician/wiring/WiringWorkstation.tsx`, `src/pages/technician/TechnicianDashboard.tsx`, `scripts/modal-smoke-final.mjs`, `scripts/prod-readiness-final.mjs`

---

## 2026-07-09 — Ops — Tracked pre-commit hook template (B1)

- **Problem:** Pre-commit fix existed only in `.git/hooks/pre-commit`; new clones had no install path.
- **Fix:** Added `scripts/git-hooks/pre-commit` (parity with active hook), `scripts/install-git-hooks.ps1`, `npm run hooks:install`, README section.
- **Files:** `scripts/git-hooks/pre-commit`, `scripts/install-git-hooks.ps1`, `package.json`, `README.md`, `CHANGELOG.md`
- **Verify:** `npm run hooks:install` copies hook; `bash scripts/git-hooks/pre-commit` exit 0.

## 2026-07-09 — UI — SAC shop-floor density polish (gap completion)

- **Problem:** SAC v2 had all core MES features but still read like an admin/dev screen — abbreviated lane labels, sparse visual workload cues, and side-panel heuristic jargon.
- **Fix:** Targeted shop-floor polish without changing assignment/deassign/changeover logic:
  - Full kanban lane titles (Current Assignment, Waiting Queue, In Progress, Completed Today, Available Panels) with responsive short labels on tablet.
  - Modal retitled **Production Assignment**; subtitle shows project, panel, cable count.
  - **Assign Best Technician** button label; compact **Top picks** sidebar (single-line reasons, no “Heuristic” badge).
  - Tech cards: left workload accent bar, avatar status dot, mini workload progress bar; stronger idle-green / overloaded-red tones.
  - Board cards: cable count + panel type tags; queue cards show preferred technician name.
  - `.sac-*` CSS tightened (KPI strip, bento grid, filters, touch targets); tablet breakpoints for icon-only mode tabs and compact assign CTA.
- **Verify:** `npm run build` exit 0.
- **Files:** `src/components/supervisor/SmartAssignmentCenter.tsx`, `src/styles/design-system.css`, `CHANGELOG.md`

## 2026-07-09 — Fix — Document status sync after delete + technician wiring smoke

- **Problem:** `prod-readiness-final.mjs` blocked on three UI scenarios: (4) View Drawing stayed enabled after drawing delete, (6) instant enable/disable via `dwes:documents-changed` did not sync, and Technician Digital Wiring modal/workspace did not open on click.
- **Root causes:**
  - `GET /drawings` could rehydrate deleted files from disk when MockStore and disk were out of sync; `removeDrawing` used exact path only.
  - `useProjectPanelDocumentStatus` refreshed on delete but immediately flipped to loading, and did not optimistically mark missing on delete events.
  - `WiringWorkstation` root used `dwf-workspace` only — smoke selector expects `.wiring-workstation`; technician action button could no-op when `selectedPanel` was unset despite assignments loading.
- **Fix:**
  - `FrameStore.removeDrawing` falls back to prefix path lookup; `getDrawings` prunes MockStore rows whose disk files are gone before rehydrate.
  - Hook: on `action: 'deleted'`, set missing immediately and background-refresh without loading flash (`showLoading: false`).
  - Add `wiring-workstation` class to workstation roots; `PanelsTab` falls back to `panels[0]` for Digital Wiring click.
  - `doc-availability-smoke.mjs`: clean-slate drawing deletes before baseline; baseline/scenario 1 allow pre-existing wiring; scenario 6 aligned with prod runner (API delete + event).
- **Files:** `backend/src/frames/frame-store.ts`, `backend/src/frames/frames.service.ts`, `src/hooks/useProjectPanelDocumentStatus.ts`, `src/components/technician/wiring/WiringWorkstation.tsx`, `src/pages/technician/tabs/PanelsTab.tsx`, `scripts/doc-availability-smoke.mjs`, `CHANGELOG.md`
- **Restore point:** branch `change/doc-status-smoke-fix-2026-07-09`
- **Verify:** `npm run build` exit 0; `node scripts/prod-readiness-final.mjs` **23/23 PASS**; `node scripts/doc-availability-smoke.mjs` **14/14 PASS**.

## 2026-07-09 — Security — Technician assignment authorization on document/wiring APIs

- **Problem:** Unassigned technician `tech01` received **200** with full wiring data from `GET /api/projects/:code/frames/:id/verify-data`; other project-scoped read endpoints (`frames`, `drawings`, `cables`, etc.) had no server-side assignment check.
- **Fix:** Enforced backend-only authorization in `frames.controller.ts` mirroring existing `drawingFile` / `report-pdf` policy:
  - `assertTechnicianProjectAccess` — 403 when `wiring_technician` has no `tech_assignments` row for the project (`frames`, `drawings`, `cables`, `drawingFile`).
  - `assertTechnicianFrameAccess` — 403 when technician is not assigned to the specific panel (`verify-data`, `findOne`, `compare-status`, `compare-mapping`).
  - `findAll` / `getCables` filter to assigned frame ids for technicians.
  - Director report endpoints deny `wiring_technician` entirely.
- **Service helpers:** `FramesService.technicianAssignedToFrame`, `technicianAssignedFrameIds` (with unit tests).
- **Files:** `backend/src/frames/frames.controller.ts`, `backend/src/frames/frames.service.ts`, `backend/test/frames.service.test.cjs`, `CHANGELOG.md`
- **Verify:** API matrix — unassigned `tech01` → 403 on frames/verify-data/drawings/drawingFile; assigned `tech1` on `SEWA_Project_001` → 200; cross-project → 403; supervisor → 200. `npm run typecheck`, `npm run build`, `backend npm test` (19/19) exit 0. Browser: Tech Gating scenarios pass in `prod-readiness-final.mjs`.

## 2026-07-09 — Fix — Drawing disk rehydration ID parse (delete UI sync)

- **Problem:** After deleting a project drawing, Supervisor Projects tab could still show **Drawing: Available** and keep View Drawing enabled without refresh.
- **Root cause:** `FrameStore.listDrawingsFromDisk()` split filenames on the **first** underscore, so `drw_<timestamp>_<original>.pdf` was rehydrated as id `drw` instead of `drw_<timestamp>`, leaving ghost entries on every `GET /drawings`.
- **Fix:** Parse drawing filenames with `/^(drw_\d+)_(.+)$/` so disk rehydration matches upload IDs (`upload.service.ts` uses `drw_${Date.now()}`).
- **Files:** `backend/src/frames/frame-store.ts`, `CHANGELOG.md`
- **Verify:** `node scripts/prod-readiness-final.mjs` — scenarios 4 (delete disables View Drawing) and 6 (instant enable/disable via `dwes:documents-changed`) pass; `npm run typecheck` + `npm run build` exit 0.

## 2026-07-09 — Build — Tailwind v4 `modal-long-text` @apply fix

- **Problem:** `npm run build` failed with `unknown utility 'modal-long-text'` (reported in `src/index.css` entry chain). `.modal-filename` and `.delete-confirm-info-meta` used `@apply modal-long-text` inside `@layer components`.
- **Root cause:** Tailwind CSS v4 (`tailwindcss` + `@tailwindcss/vite` ^4.3.1) does not resolve `@layer components` classes as `@apply` targets inside other component rules — only built-in utilities are valid.
- **Fix:** Inlined `min-w-0 break-words` and `overflow-wrap: anywhere` on `.modal-filename` and `.delete-confirm-info-meta`; kept `.modal-long-text` as the shared JSX class with the same tokens. Added regression comment in `design-system.css`.
- **Files:** `src/styles/design-system.css`, `CHANGELOG.md`
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 0. Usages: `VerificationModal` (`.modal-long-text`), `UnifiedUploadModal` / `PdfDrawingUploadModal` (`.modal-filename`), `DeleteConfirmModal` (`.delete-confirm-info-meta`).

## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, backend/tsconfig.build.tsbuildinfo, node_modules/.tmp/tsconfig.app.tsbuildinfo, node_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, backend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:** npm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 â€” UI â€” Modal/popup audit: wrap, contrast, shared shell

- **Problem:** Modals had silent truncation on long project/panel/file/user names, sub-AA contrast on helper text (`text-slate-300/400`), and inconsistent shells (`EnrollBiometricModal` bypassed shared `Modal`).
- **Fix:** Added shared modal content utilities (`.modal-long-text`, `.modal-filename`, `.modal-meta`, `.modal-kicker`, placeholder contrast); themed `modal-subtitle` / close button / body text in `themes.css`; fixed truncation + contrast in upload/assignment/verification/delete flows; migrated `EnrollBiometricModal` to shared `Modal`; restored proper `title`/`subtitle` on acknowledgment/submit confirm modals.
- **Deviations before:** silent `truncate` on file names (`PdfDrawingUploadModal`, `UnifiedUploadModal`), panel/file header (`VerificationModal`), delete meta + dwf titles; `text-slate-300/400` icons/helpers; empty modal titles; `EnrollBiometricModal` custom overlay; unthemed subtitle/close.
- **Remaining:** `VerificationModal` keeps custom fullscreen shell (data viewer); cable grid cells truncate with `title` tooltips (dense grid); `ProjectSelectionModal` uses `project-gate-*`; `SmartAssignmentCenter` / `ProjectsTab` action buttons untouched (parallel workers).
- **Files:** `design-system.css`, `themes.css`, `PdfDrawingUploadModal.tsx`, `UnifiedUploadModal.tsx`, `VerificationModal.tsx`, `EnrollBiometricModal.tsx`, `AssignTechnicianModal.tsx`, `MidChangeoverModal.tsx`, `AssignmentAcknowledgmentModal.tsx`, `SubmitReportConfirmModal.tsx`, `ColumnPrefsModal.tsx`, `CHANGELOG.md`
- **Verify:** `npm run build` exit 0; `npm run typecheck` exit 0


## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? Cursor ? Continuous Project Improvement Review (CPI)

- **Problem:** DWES project skill had no post-task review protocol; agents could miss evidence-backed improvement opportunities or invent unverified recommendations.
- **Fix:** Added built-in CPI to `dwes-project` skill ? mandatory read-only review after each completed task. New project skill at `.cursor/skills/dwes-project/` with `improvement-review.md` (verification protocol, 31 review dimensions, recommendation record format, Project Improvement Report template). Section 9 added to always-apply rule; agent skill index synced at `~/.claude/skills/dwes-project/SKILL.md`. CPI never auto-implements; unverifiable items go to Needs Confirmation.
- **Files:** `.cursor/skills/dwes-project/SKILL.md`, `.cursor/skills/dwes-project/improvement-review.md`, `.cursor/rules/dwes-project-skill.mdc`, `.cursor/rules/dwes-profile.mdc`, `~/.claude/skills/dwes-project/SKILL.md`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Skill structure follows official Cursor create-skill layout (frontmatter, progressive disclosure, workflow checklist).

## 2026-07-09 ? UI ? Project Information action button visual states (fix)

- **Problem:** Add Panel, View Drawing, Digital Wiring View, Edit, and Delete in the Project Information card looked disabled (low opacity, muted fill, `not-allowed` cursor) even when documents were uploaded and buttons were clickable.
- **Root cause:** Global `button:disabled { opacity: 0.5; pointer-events: none }` in `design-system.css` competed with layered `pj-info-action` rules; enabled-state gradients and opacity lived in lower-specificity selectors that lost the cascade to generic disabled/form styles.
- **Fix:** Exclude `.pj-info-action` from the global disabled rule; card-scoped enabled/disabled rules in `themes.css` (`.pj-project-info-card-actions`) with full teal/indigo gradients, solid secondary/danger fills, and explicit `opacity: 1` / `cursor: pointer` when enabled; loading keeps document-button tint instead of flat gray.
- **Files:** `src/styles/design-system.css`, `src/styles/buttons.css`, `src/styles/themes.css`, `CHANGELOG.md`
- **Verify:** `npm run build` exit 0.

## 2026-07-09 ? Cursor ? Official project configuration alignment

- **Problem:** DWES specialist skills lived only under user-level `~/.claude/skills/`; MCP config omitted official `type: "stdio"` and `${workspaceFolder}` interpolation.
- **Fix:** Added project skills at `.cursor/skills/dwes-db-guard/` and `.cursor/skills/dwes-reports-backup/` (official SKILL.md + `paths`); updated `.cursor/mcp.json` to documented schema; refreshed `dwes-profile.mdc` with official layout inventory. No hooks, plugins, subagents, or commands added (not required for this repo).
- **Files:** `.cursor/skills/**`, `.cursor/mcp.json`, `.cursor/rules/dwes-profile.mdc`, `CHANGELOG.md`
- **Verify:** Automated spec validation (rules .mdc frontmatter, skill name/folder match, MCP stdio type).

## 2026-07-09 ? Fix ? Document availability refresh after upload/delete

- **Problem:** View Drawing and Digital Wiring View stayed disabled after successful upload until page refresh; drawing uploads from Drawings/Unified modals did not propagate to Projects tab; concurrent API refreshes could race and restore stale "missing" state.
- **Root cause:** No cross-tab `documents-changed` event for drawing uploads/deletes; `useProjectPanelDocumentStatus` lacked request-generation guards; wiring uploads from Frames tab did not emit document signals; `wiringScheduleFromVerifyData` / `frameHasWiringSchedule` missed edge cases (`has_source_excel`, validated status).
- **Fix:** Added `projectDocumentsEvents.ts` (`emitDocumentsChanged` / `onDocumentsChanged`); hook listens and refreshes with generation refs; all upload/delete paths emit (ProjectsTab, FramesTab, UnifiedUploadModal, DrawingsTab); `verify-data` returns `cable_count`; availability helpers aligned.
- **Files:** `src/utils/projectDocumentsEvents.ts` (new), `useProjectPanelDocumentStatus.ts`, `documentAvailability.ts`, `panelFilePopup.ts`, `ProjectsTab.tsx`, `FramesTab.tsx`, `UnifiedUploadModal.tsx`, `DrawingsTab.tsx`, `backend/src/frames/frames.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run build` exit 0; manual scenarios documented in task response.
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

## 2026-07-09 ? UI ? Project Information document availability buttons

- **Problem:** View Drawing and Digital Wiring View could appear enabled while tooltips reported missing documents; availability relied on stale frame list fields instead of API validation.
- **Fix:** `useProjectPanelDocumentStatus` hook validates drawings (`GET /projects/:code/drawings`) and wiring (`GET /projects/:code/frames/:id/verify-data`) before rendering; status badges (Available / Missing / Error / Checking); unavailable buttons use flat muted styling; API errors surfaced in tooltips/toasts and viewer modals.
- **Files:** `ProjectsTab.tsx`, `useProjectPanelDocumentStatus.ts` (new), `documentAvailability.ts` (new), `DocumentAvailabilityBadge.tsx` (new), `PanelDrawingViewModal.tsx`, `PanelWiringViewModal.tsx`, `buttons.css`, `design-system.css`, `themes.css`
- **Verify:** `npm run build`; four scenario unit tests on availability helpers; live API confirms scenario 4 (neither doc) on current project.

## 2026-07-09 ? UI ? Smart Assignment Center production MES workspace

- **Problem:** SAC v1 was sparse (tall tech list, empty center with schedule warning only, recommendations sidebar, large whitespace) ? supervisors could not read shop-floor state at a glance.
- **Fix:** Dense manufacturing planning workspace:
  - **Top KPI strip:** Available Technicians, Working, Waiting (queue), Unassigned Panels, Completed Today (live from `allPanels` + queue + frames).
  - **Compact tech cards:** avatar initials, name, employee ID, status chip, project/panel, workload %, heuristic ETA, idle-green / overloaded-red tones, Parallel OK vs Reassign badges, one-click Assign.
  - **Center Assignment Board:** five kanban lanes ? Current Assignment | Waiting Queue | In Progress | Completed Today | Available Panels ? with drag-to-assign and queue drop.
  - **Assign Best Technician:** one-click wired to `pickBestTechnician` heuristic + `supervisorApi.assignFrame`.
  - **Quick filters:** Search, Project, Voltage, Panel Type, Skill (project experience), Status chips.
  - **Compact Recent timeline:** last 8 `tech_audit_log` events for focus panel (not full audit log).
  - **Auto-next:** toggleable; on completion detects newly completed assignments and attempts `assignFrame` for next queued panel (localStorage queue); marks **auto-ready** if API rejects (no schedule / conflict).
  - Preserved: assign/deassign/changeover tabs, wiring schedule gate, duplicate panel guard, conflict confirm, `useDwesRefresh`, `emitWorkflowChanged`.
- **Real data:** technicians, all assignments, frames metadata, audit, assignFrame, midChangeover, delete assignment.
- **Stubbed / client-only:** ETA (12 cables/hr heuristic), queue + auto-next prefs (`localStorage`), heuristic recommendations (labeled), board ?Available Panels? scoped to **current project** frames only.
- **Deviations:** No server-side auto-assign endpoint ? client calls `assignFrame` on completion event; multi-project board limited to assignments + current-project unassigned frames; voltage filter on tech list uses project-code prefix heuristic when frame voltage unavailable on assignment rows; drag assigns **focus panel only** (not arbitrary board card).
- **Verify:** `npm run build` exit 0.
- **Files:** `src/components/supervisor/SmartAssignmentCenter.tsx`, `src/utils/assignmentCenterUtils.ts`, `src/styles/design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? UI ? Supervisor Project Information action buttons

- **Problem:** View Drawing / Digital Wiring View looked pastel/disabled even when docs existed; inconsistent action-button styling.
- **Root cause:** (1) `GET /drawings` only read MockStore ? after restart files on disk were invisible ? false disabled. (2) Wiring gated on `cable_count === 0` only, missing `frameHasWiringSchedule` (xlsx filename). (3) Soft teal/indigo + `:disabled` opacity looked ?pastel.?
- **Fix:** Rehydrate drawings from `uploads/<code>/drawings` in `getDrawings`; gate wiring via `frameHasWiringSchedule`; unified `pj-info-action` group (enabled/disabled/hover/active/loading) with high-contrast teal/indigo when available.
- **Verify:** `npm run build` exit 0; open View Drawing + Digital Wiring View on a panel with uploaded docs.
- **Files:** `backend/src/frames/frame-store.ts`, `backend/src/frames/frames.service.ts`, `src/pages/supervisor/tabs/ProjectsTab.tsx`, `src/styles/buttons.css`, `src/styles/design-system.css`, `src/styles/themes.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? UI ? Smart Assignment Center (Supervisor workflow)

- **Problem:** Technician Workflow modal was a simple 3-tab assign/deassign/changeover form with no resource visibility, queue, or planning context.
- **Fix:** Replaced modal body with **Smart Assignment Center** ? fullscreen MES-style bento workspace: live technician resource cards (status, workload %, current panel, today?s completions), center panel context + preserved assign/deassign/mid-changeover flows (duplicate guard, wiring upload gating, availability conflict check), waiting queue (localStorage), heuristic recommendations stub, assignment timeline from `tech_audit_log`. HTML5 drag-and-drop assign to panel drop zone. Event-driven refresh via `useDwesRefresh` (12 s poll + workflow/frames events). `TechnicianWorkflowModal.tsx` remains the import alias.
- **Real data:** `usersApi.technicians`, `supervisorApi.allPanels`, `pendingChangeovers`, `assignFrame`, `midChangeover`, `techApi.delete`, `techApi.audit`, cable KPI from assignments.
- **Stubbed / client-only:** Waiting queue persistence (`localStorage`), heuristic recommendations (no ML API), utilization summary, drag-and-drop only (no bulk assign).
- **Deferred (Phase C):** True AI recommendations, tablet push notifications, workload heat maps / utilization charts API, auto-assign next queued panel on completion, configurable multi-panel workload limits server-side.
- **Verify:** `npm run build` exit 0.
- **Files:** `src/components/supervisor/SmartAssignmentCenter.tsx`, `src/components/supervisor/TechnicianWorkflowModal.tsx`, `src/utils/assignmentCenterUtils.ts`, `src/styles/design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? UI ? Unified DeleteConfirmModal (checkbox, no type-phrase)

- **Problem:** Delete flows used mixed UIs (`dialog.confirm`, phrase typing, ad-hoc modals) with inconsistent impact/backup messaging.
- **Fix:** Added shared `DeleteConfirmModal` (Liquid Glass) with impact cards, expandable sections, optional scopes, backup status, checkbox ack, and post-delete summary. Migrated panel/drawing/project soft-remove/hard-delete, users, assignments, uploads, and technician hide-completed. Guarded APIs still receive required `confirm_phrase` / `confirmed_code` from the client after checkbox confirm (hidden from user).
- **Deferred:** Hard Reset Project, Hard Reset DB, Reset All Projects remain phrase/code-gated catastrophic admin flows.
- **Verify:** `npm run build` exit 0.
- **Files:** `src/components/ui/DeleteConfirmModal.tsx`, `src/components/ui/deleteConfirmTypes.ts`, `src/styles/design-system.css`, `src/components/supervisor/DeletePanelConfirmModal.tsx`, `src/pages/supervisor/tabs/DrawingsTab.tsx`, `src/pages/supervisor/tabs/ProjectsTab.tsx`, `src/pages/supervisor/tabs/AssignmentTab.tsx`, `src/pages/supervisor/tabs/UsersTab.tsx`, `src/pages/admin/tabs/DeleteProjectTab.tsx`, `src/pages/admin/tabs/UserMgmtTab.tsx`, `src/components/supervisor/UnifiedUploadModal.tsx`, `src/components/supervisor/TechnicianWorkflowModal.tsx`, `src/pages/technician/tabs/PanelsTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? DX ? Fix VS Code/Cursor tasks (no npm task provider)

- **Problem:** Workspace error `There is no registered task type 'npm'` ? Cursor/VS Code without the npm task provider cannot run `"type": "npm"` tasks.
- **Fix:** Converted all npm-script tasks in `.vscode/tasks.json` to `"type": "shell"` with `powershell.exe -NoProfile -Command` and `npm run ?` / `npx ?`. Labels, groups, presentation, and scripts unchanged. `launch.json` left as-is (`runtimeExecutable: "npm"` is Node debug, not the npm task type). `extensions.json` does not recommend an npm task provider.
- **Verify:** Terminal ? Run Task ? pick any `dwes:` task (e.g. `dwes: lint (oxlint)`, `dwes: build (frontend)`).
- **Files:** `.vscode/tasks.json`, `CHANGELOG.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? DX ? Modernize Cursor/VS Code + tooling configs

- **Scope:** Configuration and developer experience only ? no business logic, auth, DB, backup, or UI feature changes.
- **IDE:** Added/updated `.vscode/extensions.json`, `settings.json`, `launch.json` (FE Vite + BE Nest debug + compound), `tasks.json` (dev/build/lint/typecheck/prisma/backup). `.gitignore` now tracks those four VS Code files.

- **Repo hygiene:** `.editorconfig`, `.cursorignore`, `.nvmrc` (24); root + backend `engines` (`node >=22`, `npm >=10`); `npm run typecheck`.
- **TS / Nest:** `isolatedModules` + `DOM.Iterable` on frontend tsconfigs; explicit `moduleResolution: nodenext` for `vite.config.ts`; Nest `tsConfigPath` ? `tsconfig.build.json`; backend `forceConsistentCasingInFileNames: true`.
- **Lint:** Kept **oxlint** only ? Prettier/ESLint not introduced (unwanted in extensions).
- **Profile:** `.cursor/rules/dwes-profile.mdc` revalidated for Node engines, oxlint, launcher (no Electron), IDE paths.
- **Build unblocker:** Removed unused `useAppDialog` import/binding in `AssignmentTab.tsx` (pre-existing `noUnusedLocals` failure blocking `tsc -b`).
- **Deferred (author approval):** NestJS 10?11, backend TypeScript 5?6 align with frontend, React/Vite major bumps beyond current pins.
- **Verify:** `npm run build` exit 0; `npm --prefix backend run build` exit 0.
- **Files:** `.vscode/*`, `.editorconfig`, `.cursorignore`, `.nvmrc`, `.gitignore`, `package.json`, `backend/package.json`, `tsconfig.app.json`, `tsconfig.node.json`, `backend/tsconfig.json`, `backend/nest-cli.json`, `src/pages/supervisor/tabs/AssignmentTab.tsx`, `.cursor/rules/dwes-profile.mdc`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? UI ? Remove Mid-Changeover Availability banner from Supervisor Dashboard

- **Problem:** Supervisor Dashboard chrome showed a Mid-Changeover Availability alert strip (count + navigate-to-Projects), including on Status when not hidden.
- **Fix:** Removed mid-changeover banner UI, `hideChangeover` prop, `pendingChangeovers` polling, and related state from `SupervisorAlertStrips`. Dashboard keeps legacy-approval strip only.
- **Unchanged:** Mid-Changeover workflow (`TechnicianWorkflowModal`, `MidChangeoverModal`, `ChangeoverTab` / `MidChangeoverSection`, API `pendingChangeovers` / `midChangeover`).
- **Verify:** `npm run build` exit 0; smoke `/supervisor` ? no mid-changeover banner on Projects or Status.
- **Files:** `src/components/supervisor/SupervisorAlertStrips.tsx`, `src/pages/supervisor/SupervisorDashboard.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? Infra ? Desktop launcher Dev (HMR) / Prod

- **Problem:** Desktop shortcut did not keep a live Vite HMR session clear ? users closed/reopened to see code changes; README still described visible dual-console start.
- **Fix:** Unified `scripts/launch-dwes.mjs` with `--mode=dev|prod` (env `DWES_MODE`). **Dev (default):** `npm run dev` + Nest `start:dev`, wait for `/api/health`, open Chrome/Edge with `--disable-http-cache` + cache-bust query. **Prod:** `preview:lan` + `node dist/main.js`, no HMR. Silent wrappers: `Start DWES (Hidden).vbs`, `Start DWES Prod (Hidden).vbs`, `scripts/start-dwes-silent.vbs`, `scripts/start-dwes.ps1`. Shortcut default remains Dev; `npm run shortcut:create:prod` adds Prod icon. Autostart: `register-dwes-autostart.ps1` ? task **DWES App**.
- **Unchanged:** `npm run dev` / `dev:all`, auth, DB, backup, UI.
- **Verify:** Recreate shortcut; double-click DWES; edit `src/` ? HMR; second click no duplicate servers; Prod after builds.
- **Files:** `scripts/launch-dwes.mjs`, `scripts/launch-hidden.mjs`, `scripts/launch.mjs`, `scripts/start-dwes.ps1`, `scripts/start-dwes-silent.vbs`, `scripts/fix-desktop-shortcut.ps1`, `scripts/create-desktop-shortcut.mjs`, `scripts/register-dwes-autostart.ps1`, `scripts/stop-dwes.ps1`, `scripts/LAUNCH.md`, `Start DWES (Hidden).vbs`, `Start DWES Prod (Hidden).vbs`, `Start DWES.cmd`, `package.json`, `README.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Restore point:** Branch `change/production-startup-2026-07-09` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? Fix ? Login field leading icons

- **Root cause:** Liquid Glass `backdrop-filter` on `.login-input` created a stacking layer that painted over the leading `User` / `Lock` icons (DOM order: icon ? input ? eye toggle; only the trailing eye stayed visible).
- **Fix:** Explicit z-index on `.login-input-icon` and `.login-input-toggle` above `.login-input-wrap .login-input`.
- **Icons:** Material Symbols `person` (`User`) and `lock` (`Lock`) via `src/components/ui/icons`.
- **Verify:** `npm run build` exit 0.
- **Files:** `src/styles/design-system.css`, `CHANGELOG.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? Infra ? Backup & recovery enhancement

- **Backup root moved inside project:** `Backup/YYYY-MM-DD_HH-mm` (was external `DWES_backups/DWES_backup_*`).
- **Enhanced `backup.ps1`:** pre-backup disk space check (`diskSpace.minFreeGb` 5 GB), excludes `Backup`/`dist`/caches, post-copy verification, `backup-report.json` (size, file count, disk before/after, verification status, errors), retention maxCount **21** + maxAgeDays **30**.
- **New scripts:** `verify-backup.ps1`, `run-pre-operation-backup.mjs`; npm `backup:verify`, `backup:pre-op`.
- **Pre-op hooks:** dev hard reset (`dev.service.ts`) and `deploy:lan` / `deploy:lan:https` run full backup before destructive/build steps.
- **Docs:** `scripts/BACKUP.md`, `PROJECT_STATUS.md`; `.gitignore` adds `Backup/`.
- **Verify:** `npm run backup:dry-run` + `npm run build` exit 0.
- **Files:** `scripts/backup.ps1`, `scripts/backup.config.json`, `scripts/verify-backup.ps1`, `scripts/run-pre-operation-backup.mjs`, `scripts/register-backup-task.ps1`, `scripts/BACKUP.md`, `backend/src/dev/dev.service.ts`, `package.json`, `.gitignore`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? Validation ? Event-driven refresh system audit

- **Code audit (PASS):** No rogue 3?4 s dashboard polling in `src/` ? only `setTimeout(..., 4000)` toast dismissals in admin tabs; `setInterval` limited to clock (1 s), wiring alert tick (10 s), SummaryReport label tick (15 s), `useReadOnlyPoll` (45/30/60 s via `useDwesRefresh`), and WiringWorkstation 1 s local timer.
- **Consumers:** All role dashboards use `useDwesRefresh` (45 s idle fallback + events); WiringWorkstation uses explicit 30 s `useReadOnlyPoll`; ReportPreviewModal 60 s.
- **Regressions fixed:** Missing `emitWorkflowChanged` on `TechnicianWorkflowModal` assign/deassign/changeover, `MidChangeoverModal` confirm, and `AssignmentTab` deassign (SummaryTab / QAQC / alert strips listen workflow-only). Silent background reload for `ProjectsTab` panel list and QAQC `PanelsTab` (no loading flicker on idle poll).
- **Browser MCP (BLOCKED):** Tab create OK; `browser_navigate` fails (`Browser view not found`) ? idle/event network validation deferred to author DevTools checklist below.
- **Build:** `npm run build` exit 0 (post-fix).
- **Files:** `TechnicianWorkflowModal.tsx`, `MidChangeoverModal.tsx`, `AssignmentTab.tsx`, `ProjectsTab.tsx`, `PanelsTab.tsx` (qaqc), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? Perf ? Stop ~4s dashboard polling (root-cause fix)

- **Root cause:** `useReadOnlyPoll` defaulted to **4000 ms** and was mounted on Supervisor Projects/Status, Technician, Director, QA/QC, Frames, and report preview ? causing constant API refetch, flicker, and focus/selection loss even when data was unchanged.
- **Fix:** New `useDwesRefresh` hook ? event-driven refresh on `dwes:frames-changed` + `dwes:workflow-changed`, debounced 300 ms; optional **45 s** background poll (30 s wiring sync, 60 s report preview). `useReadOnlyPoll` no longer defaults to 4 s (`null` = timer off; focus/visibility refresh kept). `emitWorkflowChanged` added at assignment, wiring, inspection, and approval mutations.
- **Polling after fix:** Dashboards 45 s + events; WiringWorkstation 30 s + events; ReportPreviewModal 60 s + events; clock/UI timers unchanged (1 s / 15 s label tick).
- **Files:** `useReadOnlyPoll.ts`, `useDwesRefresh.ts`, `refreshIntervals.ts`, `dwesRefreshEvents.ts`, `ProjectsTab.tsx`, `ReviewApprovalWorkspace.tsx`, `FramesTab.tsx`, `SummaryTab.tsx`, `TechnicianDashboard.tsx`, `DirectorDashboard.tsx`, `SummaryReportTab.tsx`, `QAQCDashboard.tsx`, `PanelsTab.tsx` (qaqc), `SupervisorAlertStrips.tsx`, `ReportPreviewModal.tsx`, `WiringWorkstation.tsx`, `AssignTechnicianModal.tsx`, `InspectionFormTab.tsx`, `PanelsTab.tsx` (technician), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run build` exit 0; DevTools Network ? idle supervisor/technician should show no repeating `/api/*` every 3?4 s; burst only on tab focus, manual refresh, or CRUD/workflow events.
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).

## 2026-07-09 ? Maintenance ? Phase A workspace cleanup

- **Source:** User-approved Phase A cleanup (build artifacts, runtime logs, temp/cache only).
- **Summary:** Removed frontend/backend `dist/`, `logs/`, root and backend `*.log`, stale `check_db.*` compile outputs, `backend/test-api-report.pdf`, tsbuildinfo caches, `backend/.dwes-port`, `_perm_test2.tmp`, and `.design-sync/.cache/` only. Preserved `node_modules/`, uploads, backups, archives, and full `.design-sync/`.
- **Reclaimed:** ~11.62 MB (11,622,712 bytes measured before deletion).
- **Verify:** `npm run typecheck` exit 0; `npm run build` exit 1 (pre-existing Tailwind `modal-long-text` utility error in `src/index.css`, unrelated to deleted paths).
## 2026-07-09 ? QA ? Final production sign-off pass

- **Summary:** Final production-readiness QA (defect fixes only). Browser MCP (`cursor-ide-browser`) still cannot retain a tab for automated visual E2E ? tab create succeeds (`viewId` returned) but immediate `browser_navigate` fails (`No browser tab available` / `Browser view not found`). Automated HTTP + JWT + API checks all pass. **Defect fixed:** Delete Panel modal stayed open after successful deletion ? `handlePanelDeleted` now calls `closeDeletePanelModal()`.
- **Automated checks (PASS):** `npm run build` exit 0 (?2 this pass); HTTP 200 on `/`, `/supervisor`, `/technician`, `/director`, `/admin`, `/admin/users`, `/admin/settings`, `/qaqc`; JWT login OK for `supervisor1`, `sysadmin`, `tech1`, `ops_director1`, `qa1`; APIs on `:3001` ? `delete-precheck` 200, `report-pdf` ~66 KB 200, `completion-report` 200, `admin/diagnostics` 200, `qaqc/stats` 200, `director/stats` 200, `tech/my-panels` 200.
- **Browser MCP (BLOCKED):** No snapshots/screenshots/CDP console capture ? author manual checklist required (see `PROJECT_STATUS.md` open flag #1).
- **Console/network (automated):** No failed `/api/*` on tested endpoints; wrong probe paths `director/overview` and `tech/assignments` return 404 (not used by frontend ? actual routes `director/stats`, `tech/my-panels`).
- **Files:** `ProjectsTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? QA ? Final production-readiness verification pass

- **Summary:** Application-wide stabilization QA after Liquid Glass / Bento / workspace headers / Delete Panel modal. No workflow or feature changes. Removed duplicate stale `delete-panel-*` CSS block (conflicted with `DeletePanelConfirmModal` class names); unified `kpi-card` hover source (dedicated `.kpi-card:hover` + bento strip only); active delete-panel info card uses `--bento-radius`.
- **Automated checks (PASS):** `npm run build` exit 0; HTTP 200 on `/`, `/supervisor`, `/technician`, `/director`, `/admin`, `/admin/users`, `/admin/settings`, `/qaqc`; JWT login OK for `supervisor1`, `sysadmin`, `tech1`, `ops_director1`, `qa1`; APIs on `:3001` ? `completion-report` 200, `report-pdf` ~66 KB 200, `delete-precheck` 200, `admin/diagnostics` 200 (sysadmin), `qaqc/stats` 200.
- **Browser MCP:** `cursor-ide-browser` tab creation succeeded but navigation failed (`Browser view not found` / `No browser tab available`) ? **visual/modal/viewport QA deferred to author manual checklist** (see `PROJECT_STATUS.md`).
- **Dense-data glass exemptions (code review PASS):** `tech-panel-row`, `rwa-panel-*`, `wu-grid-*`, `file-viewer-spreadsheet`, `pdf-viewer-*`, `wire-schematic-*`, `data-table` ? `backdrop-filter: none !important`.
- **Files:** `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
- **Summary:** Replaced generic `dialog.prompt` delete flow on Supervisor Projects with a dedicated **Delete Panel** modal (`size="lg"`). Bento info card (panel, project, voltage, type), glass warning shell, highlighted confirmation phrase with **Copy** button, real-time phrase validation (valid/invalid states), disabled Delete until exact match, danger/secondary footer actions. Success state stays open until Close.
- **Validation polish:** `design-system.css` ? `tech-panel-row` + extended `rwa-panel-*` cells exempt from blur; unified `kpi-card` hover (`-1px` + `glass-shadow-hover`); `dashboard-hero` / `rwa-project-card` border-radius ? `--bento-radius`; removed hover lift on non-interactive `dashboard-hero`.
- **Files:** `DeletePanelConfirmModal.tsx`, `ProjectsTab.tsx`, `design-system.css`, `named-icons.tsx` (`Copy`), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)
- **Verify:** `npm run build` exit 0; HTTP 200 on `/`, `/supervisor`, `/technician`, `/director`, `/admin`, `/qaqc`; manual: Supervisor Projects ? Delete panel modal layout + phrase copy/validation.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UX ? Delete Panel confirmation dialog redesign

- **Summary:** Replaced generic `dialog.prompt` with dedicated **`DeletePanelConfirmModal`** ? wider `lg` modal, compact info card (panel, project, voltage, type), scannable warning block, highlighted phrase box with **Copy**, real-time phrase validation (success/error states), disabled destructive Delete until exact match, Cancel secondary.
- **Files:** `DeletePanelConfirmModal.tsx`, `ProjectsTab.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty working tree (no commit)
- **Verify:** `npm run build` exit 0; manual: Supervisor ? Projects ? Delete Panel on selected panel.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UX ? Premium Liquid Glass UI (app-wide, selective)

- **Summary:** Introduced shared **Liquid Glass / glassmorphism** tokens and applied them app-wide to headers, nav, cards, modals, dropdowns, forms, badges, and notifications ? while **excluding** dense data grids (wiring schedule, Excel fullview, PDF canvas, schematic wells). Solid semi-opaque fallbacks via `@supports (backdrop-filter)`; WCAG-friendly text on glass; `prefers-reduced-motion` respected.
- **Tokens:** `--glass-bg`, `--glass-bg-solid`, `--glass-bg-subtle`, `--glass-border`, `--glass-border-strong`, `--glass-blur`, `--glass-blur-subtle`, `--glass-blur-overlay`, `--glass-saturate`, `--glass-shadow`, `--glass-shadow-hover`, `--glass-radius`, `--glass-ease`, `--glass-text`, `--glass-text-muted`
- **Files:** `tokens.css`, `index.css`, `theme-palettes.css`, `themes.css`, `design-system.css`, `tabs.css`, `buttons.css`, `Modal.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-add-panel-2026-07-08` (no commit)
- **Verify:** `npm run build` exit 0; manual smoke: `/`, `/supervisor`, `/technician`, `/admin` Settings, upload/drawing/workflow modals, duplicate warning banner.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UX ? Premium Liquid Glass + Bento Grid design system

- **Summary:** App-wide selective **liquid glass** (headers, nav, cards, modals, forms, badges, upload sections) and **bento grid** layouts for role dashboards, KPI strips, user management, workflow summaries, project info cards, director analytics/export, and admin settings. Dense data surfaces (wiring grids, Excel fullview, PDF viewers, mapping tables) remain exempt ? glass on wrappers/toolbars only.
- **Tokens:** `--glass-*` (existing, extended surfaces), new `--bento-gap`, `--bento-radius`, `--bento-columns`, `--bento-min-cell`, `--bento-row-min` in `tokens.css`, `theme-palettes.css`, `themes.css`.
- **CSS:** `.glass-surface*`, `.bento-grid`, `.bento-cell`, span utilities, presets (`--kpis`, `--settings`, `--cards`, `--upload-header`); nested blur guard (max 1?2 layers); `@supports (backdrop-filter)` fallbacks; `prefers-reduced-motion` respected.
- **Bento placements:** `DashboardShell` KPI strip; Admin settings 2-up modules; Director workforce/analytics/export; Supervisor project info + upload headers; Technician panel cards; QAQC/Admin/Director KPI shells; user management grid; workflow card grids.
- **Excluded:** `.data-table`, `.wu-grid-*`, `.file-viewer-spreadsheet`, `.pdf-viewer-*`, `.wire-schematic-*` ? `backdrop-filter: none !important`.
- **Files:** `tokens.css`, `theme-palettes.css`, `themes.css`, `design-system.css`, `tabs.css`, `DashboardShell.tsx`, `AdminSettingsPage.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty working tree (no commit)
- **Verify:** `npm run build` exit 0; smoke-test `/`, `/supervisor`, `/technician`, `/director`, `/admin`, `/qaqc`; modals (wiring upload, drawing, workflow, report preview); duplicate warning banner.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UX ? Workspace header layout fix

- **Summary:** Fixed dashboard hero header overlap/clipping across all role workspaces. Title, subtitle, and workspace badge now use a stacked flex layout with proper line-height, top padding (clearing the gradient accent bar), and responsive badge wrapping ? applied via shared `DashboardShell`, `PageHeader`, and modal header tokens.
- **Root cause:** `.dashboard-hero-title-row` placed title + badge inline with tight `gap-2`/`leading-tight`; `overflow-hidden` + insufficient top padding clipped ascenders; badge lacked `shrink-0`/spacing.
- **Files:** `DashboardShell.tsx`, `PageHeader.tsx`, `design-system.css`, `CHANGELOG.md`
- **Restore point:** Dirty working tree (no commit)
- **Verify:** `npm run build` exit 0; Supervisor, Technician, Director, Admin, QA/QC dashboards share `DashboardShell` hero.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
- **Summary:** Added development-only **Hard Reset DB** ? wipes all projects, wiring data, uploads, session log, WebAuthn credentials, duplicate hash cache, and in-memory frame/drawing stores; re-seeds 5 canonical demo projects; clears client storage and reloads. Guarded by `DEMO_MODE=true` or `ALLOW_DEV_HARD_RESET=true`; UI visible only in Vite dev build + backend flag. Backup-first (`pg_dump` + uploads archive). User accounts preserved.
- **Endpoints:** `GET/POST /api/dev/hard-reset` (system_admin; 404/403 when gated off)
- **Env:** `DEMO_MODE=true` (default dev) or `ALLOW_DEV_HARD_RESET=true`
- **Files:** `backend/src/dev/*`, `backend/src/common/dev-reset.util.ts`, `backend/src/common/seed-projects.ts`, `HardResetDbTab.tsx`, `useDevHardReset.ts`, `api.ts`, `AdminSettingsPage.tsx`, `webauthn-store.service.ts`, `auth.controller.ts`, `main.ts`, `.env.example`
- **Restore point:** Dirty working tree (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UX ? Duplicate panel warning dismiss (?)

- **Summary:** Added session-only **Clear (?)** on Supervisor Projects duplicate banner. Dismiss hides the warning and unblocks toolbar actions for testing; triggers fresh panel reload. Resets on project/panel change, frames-changed, and wiring/drawing upload start ? banner reappears only if duplicates still exist. Backend 409 guard unchanged.
- **Files:** `DuplicatePanelWarning.tsx`, `ProjectsTab.tsx`, `usePanelDuplicateGuard.ts`, `design-system.css`, `CHANGELOG.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Duplicate panel resolver (rename/select/clear)

- **Summary:** Fixed broken **Duplicate Panel Name Detected** resolver on Supervisor Projects. Rename buttons now map one-per-duplicate-panel (keyed by internal ID), with distinguishable labels (`tag + short id + cable/schedule hint`). **Set active duplicate panel** select lists the conflicting duplicates only (was incorrectly listing unique panels like `=E01`). Removed `ProjectsTab` effect that silently remapped `selectedPanelId` to the deduped dropdown entry ? root cause of resolver catch/clear loop. Wiring upload modal now wires rename/select handlers; edit-save preserves active panel ID after reload.
- **?2 label decision:** Relabeled control **"Set active duplicate panel:"** ? picks which duplicate internal ID actions bind to; not merge/delete and not "switch to unrelated unique panel." Merge path **not implemented** (rename-only per spec).
- **Root cause:** (1) `selectOptions` filtered *out* duplicates; (2) rename labels showed tag only; (3) `useEffect` stole selection when ID absent from `activePanelOptions`.
- **Files:** `panelDuplicates.ts`, `DuplicatePanelWarning.tsx`, `ProjectsTab.tsx`, `FramesTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Branch `change/fix-duplicate-resolver-2026-07-08` off dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? QA ? Master bundle verify ? debug ? harden (`DWES_MASTER_verify_debug_harden.md`)

- **Summary:** Re-ran Tier E verification over the assembled change bundle per master orchestration spec. Frontend `npm run build`, backend `npm run build`, `npm run lint` (0 errors, 33 warnings), and `node backend/scripts/verify-excel-parse.mjs` all pass. Runtime: Vite shell routes `/`, `/technician`, `/supervisor` ? HTTP 200. **Stale backend on `:3001`** (uptime ~5h) still serves pre-refactor panel `report-pdf` (~15 MB wiring+GA) and returns **404** for `completion-report`; rebuilt backend on `:3003` serves standalone completion PDF (~66 KB) and `completion-report` JSON OK. Fixed regression: `PdfDrawingUploadModal` + `usePanelDuplicateGuard` now **hard-block** duplicate panel tags (aligned with wiring modal + backend 409; removed soft `duplicatePanelUploadConfirm` on drawing upload/replace).
- **?1 decisions (applied from implemented bundle + spec authority):**
  1. **Report page-count:** Panel export = **one-page executive** (`dwes_project_completion_report_redesign.md`); multi-panel project dossier stays on `/projects/:code/report-pdf` (`Prompt.md` scope).
  2. **Excel parse:** Tier A parser fix supersedes fullview diagnostic doc ? verified 400-row script.
  3. **Wiring/Drawing popup:** Build from `dwes_wiring_drawing_popup_view_replace.md`; module spec is reference only.
  4. **GA merge:** **Separate** ? `frames/:id/report-pdf` = standalone completion report; `generateFrameDocument()` GA-append path has no route.
- **IT checklist:** IT-1 parser **PASS** (script); persisted `=H00+R` frame **399 cables** (pre-fix import ? re-upload `_H00+R.xlsx` for 400). IT-2 viewers **PASS** (code: shared `FileViewer` + `PdfDocumentViewer`). IT-3 duplicate guard **PASS** after fix (UI hard block + `assertPanelNameUniqueForWrite` 409). IT-4 replace **PASS** (progress warning + backup). IT-5 report **PASS** on fresh backend / **FAIL** on stale `:3001`. IT-6 styling **MANUAL** (modal/responsive re-smoke).
- **Files:** `usePanelDuplicateGuard.ts`, `PdfDrawingUploadModal.tsx`, `ProjectsTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit per spec)
- **Manual:** Restart `npm run dev:all` to pick up backend dist; browser smoke-test logged-in flows; re-import `_H00+R.xlsx` on `=H00+R` panel for IT-1 live 400-cable check; triage security list below.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Feature ? Global duplicate panel name guard

- **Summary:** Project-wide duplicate compact panel tags now **hard-block** all panel-scoped actions (wiring upload/view/replace, drawing upload/view/replace, reports, technician assign/de-assign/mid-changeover). Shared frontend `assertNoDuplicatePanels` + `usePanelDuplicateGuard`; backend mirror `assertPanelNameUniqueForWrite` / `assertPatchPanelNameAllowed` in `panel-duplicate.helper.ts` returns **409 Conflict** on guarded writes. `DuplicatePanelWarning` shows standard resolution copy with rename / select-existing panel actions.
- **Files:** `panelDuplicates.ts`, `usePanelDuplicateGuard.ts`, `DuplicatePanelWarning.tsx`, `UploadViewChooser.tsx`, `ProjectsTab.tsx`, `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `TechnicianWorkflowModal.tsx`, `panel-duplicate.helper.ts`, `upload.service.ts`, `upload.controller.ts`, `frames.service.ts`, `wiring-document.service.ts`, `supervisor.service.ts`, `tech.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Refactor ? Wiring & Drawing popup unified View/Replace

- **Summary:** Unified **Wiring Upload** and **Drawing** popups with single resolved state on open (`loading` ? `empty` | `populated` | `replacing`). Populated panels auto-open **FileViewer** (SheetJS Excel table, pdf.js PDF, image zoom/pan, DWG download-only) plus **PanelFileMetadataBar** and footer **Replace Upload**. Removed choose-phase / extra View buttons on Projects toolbar. Duplicate panel tags: warn + confirm (`duplicatePanelUploadConfirm`), reports still gated via `reportGated`.
- **New dependency:** `xlsx` (SheetJS) for client-side wiring schedule preview.
- **Files:** `FileViewer.tsx`, `PanelFileMetadataBar.tsx`, `panelFilePopup.ts`, `FramesTab.tsx` (`UploadFrameModal`), `PdfDrawingUploadModal.tsx`, `PdfDocumentViewer.tsx` (Ctrl+wheel zoom), `panelDuplicates.ts`, `usePanelDuplicateGuard.ts`, `ProjectsTab.tsx`, `design-system.css`, `package.json`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; backend untouched.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Spec ? Wiring & Drawing module compliance (`DWES_Wiring_Drawing_Module_Spec.md`)

- **Summary:** Gap pass against authoritative Desktop spec: unified **panel-file popup** pattern (`panelFilePopup.ts`, `FileViewer`, `PanelFileMetadataBar`) for wiring + drawing; **internal panel ID** in `UploadTargetHeader` and viewer `panelLabel`; **State B metadata** (file, type, uploaded, size); **duplicate-name confirmation** (not hard block) for upload/replace via `duplicatePanelUploadConfirm`; **post-replace refresh** stays in populated viewer state; Projects tab allows wiring/drawing when duplicate names exist (reports still blocked). Wiring view uses `GET /supervisor/wiring-schedule/:code/:frameId/xlsx` + `FileViewer` excel mode.
- **Files:** `panelFilePopup.ts`, `FileViewer.tsx`, `PanelFileMetadataBar.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `PdfDrawingUploadModal.tsx`, `UploadTargetHeader.tsx`, `UploadViewChooser.tsx`, `DuplicatePanelWarning.tsx`, `panelDuplicates.ts`, `ProjectsTab.tsx`, `ProjectPanelSelect.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Flags:** Drawings remain **project-scoped** in backend (`MockStore.drawings` per `project_code`) ? UI is panel-gated but file detection is project-wide; PNG/JPG/SVG drawing upload not in picker (PDF/DWG only). `uploadedBy` metadata not stored server-side (shows `?`). Populated state opens viewer directly with **Replace** in footer (equivalent to spec State B).
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Duplicate panel delete propagation

- **Summary:** Deleting a panel from Supervisor Projects now fully removes it from MockStore, disk frame files, and related DB rows (`panel_inspections` ? `tech_assignments` ? `tech_audit_log`). Frontend immediately updates panel lists, clears selection when the deleted panel was active, and recomputes duplicate-name warnings without manual refresh. `dwes:frames-changed` event propagates removal to Status workspace, Frames tab, and Technician dashboard.
- **Root cause:** `deleteFrameGuarded` archived and removed frame files but left `tech_assignments` and dependent rows in WiringSchemeDB; `ReviewApprovalWorkspace` loaded frames only on mount; `reloadProjectPanels(false)` skipped selection validation so stale panel IDs could linger briefly.
- **Files:** `frames.service.ts`, `projectFramesEvents.ts` (new), `ProjectsTab.tsx`, `ReviewApprovalWorkspace.tsx`, `FramesTab.tsx`, `TechnicianDashboard.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0; delete one of two duplicate panels ? warning clears, dropdown/card/Status tab update without page reload.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Feature ? Replace upload guards (wiring + drawing)

- **Summary:** **Replace Upload** now requires an explicit confirmation before overwrite. Wiring replace checks `supervisorApi.frameProgress` and warns when technician execution progress exists; both wiring and drawing archive existing files to `uploads/backups/` (`FRAME_REPLACE_*`, `DRAWING_REPLACE_*`) before overwrite. Drawing upload accepts optional `replace_drawing_id` to swap the prior file instead of accumulating duplicates.
- **Files:** `FramesTab.tsx` (`UploadFrameModal`), `PdfDrawingUploadModal.tsx`, `UploadViewChooser.tsx`, `frame-store.ts`, `upload.service.ts`, `upload.controller.ts`, `ReviewApprovalWorkspace.tsx` (TS fix), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Flags:** Replace is **allowed** with elevated confirmation when execution progress exists (not blocked). Table ?zoom? = full-view + responsive layout (no literal cell zoom). PDF viewer reuses existing `PdfDocumentViewer` (pdf.js).
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Feature ? Supervisor Upload+View merged modals

- **Summary:** Removed separate **View Wiring** toolbar button. **Wiring Upload** (`UploadFrameModal`) and **Drawing** (`PdfDrawingUploadModal`) now open with a **View schedule / View drawing** vs **Replace upload** choice when an existing file is detected. Wiring viewer reuses `WiringScheduleMappingGrid` read-only fullview (search, zoom, full screen); data from `GET /projects/:code/frames/:id/verify-data`. Drawing viewer uses `PdfDocumentViewer` for PDF; DWG is download-only (matches Drawings tab). New shared `UploadViewChooser` + `wiringScheduleView.ts` helpers.
- **Upload detection:** Wiring ? `existingCableCount > 0` on selected panel (from `projectsApi.frames`). Drawing ? latest project drawing matching file type via `projectsApi.drawings` (`.pdf` / `.dwg`).
- **Files:** `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `ProjectsTab.tsx`, `UploadViewChooser.tsx` (new), `wiringScheduleView.ts` (new), `design-system.css`, `ViewWiringScheduleModal.tsx` (removed), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` ? Projects ? panel with schedule ? **Wiring Upload** shows View/Replace; panel with PDF ? **Drawing** ? PDF shows inline viewer; DWG shows download message.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Status workspace live data refresh

- **Summary:** Status tab now always reflects live DB/API state ? no stale projects, frames, assignments, KPIs, or review status. Unified `loadWorkspaceData()` fetches projects + all frames + `supervisorApi.allPanels()` together. Polls every **12s** via `useReadOnlyPoll` (pauses when tab hidden; refetches on `visibilitychange` + window `focus`). Refetches when Status tab becomes active (`isActive` prop); Status section stays mounted (hidden) so cross-tab `dwes:frames-changed` events update in background. Manual Refresh reloads full workspace. Panel column uses `compactPanelDisplayName` (matches Projects dropdown). Projects/Technician Workflow emit `emitFramesChanged` on create/delete/upload/assign/deassign/changeover.
- **Root cause:** Projects + frames loaded once on mount only; assignments polled separately every 12s without visibility/focus guards; Refresh button only re-fetched assignments; long panel reference titles shown verbatim in Status table.
- **Files:** `ReviewApprovalWorkspace.tsx`, `ReviewApprovalSection.tsx`, `SupervisorDashboard.tsx`, `useReadOnlyPoll.ts`, `ProjectsTab.tsx`, `TechnicianWorkflowModal.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` ? Projects ? delete panel ? Status tab shows updated panel count immediately; stay on Status ? KPI/progress updates within 12s; panel names show compact `=H001` labels with full title on hover.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Feature ? Supervisor View Wiring schedule (superseded)

- **Summary:** ~~Added **View Wiring** button~~ ? superseded by merged Upload+View modals above.
- **Files:** `ViewWiringScheduleModal.tsx` (removed), `WiringScheduleMappingGrid.tsx` (`readOnly` prop), `ProjectsTab.tsx`, `design-system.css`
- **Restore point:** Dirty `main` (no commit)

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Excel Wiring Upload parses all worksheet rows

- **Summary:** Per `dwes_fix_excel_parse_all_rows.md`: Excel wiring upload now reads **all** data rows from the selected sheet for Full View, preview chips, and import ? not a 3-row sample. Fixed off-by-one that dropped S.NO 1 (first data row misclassified as sub-header). `readHeaders` returns full worksheet data (up to 10k rows) plus `data_row_count`; length values preserve unit suffix (`2.5m`); whitespace trimmed on cells; string terminals preserved.
- **Root cause:** Two stacked defects ? (1) `readHeaders` originally used `rows.slice(dataStart, dataStart + 3)` (only 3 preview rows); source had been partially updated to 5000 but `dataStartRow()` still used a brittle digit heuristic that treated the first real data row (S.NO `1`) as a wire-spec sub-header, skipping it; (2) Full View correctly rendered whatever `sample_rows` contained ? the bug was upstream in parsing, not rendering.
- **Persistence:** `uploadMapped` / `parseWiringSheet` share the same `dataStartRow` fix ? import writes full `cables[]` to frame JSON via `FrameStore.save` (unchanged path; now receives all rows).
- **Files:** `excel-headers.ts` (`isSubHeaderRow`, aligned `dataStartRow`), `upload.service.ts`, `parse-wiring.ts` (`normalizeLength`), `FramesTab.tsx`, `backend/scripts/verify-excel-parse.mjs`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` + `npm --prefix backend run build` exit 0; `node backend/scripts/verify-excel-parse.mjs` ? 400 rows, S.NO 1?400; manual: upload `_H00+R.xlsx` ? badge **400 rows**, Full View scrolls S.NO 1?400, Validate & Import ? panel holds 400 cables.
- **Flagged (not changed):** Full View renders all rows in DOM (no virtualization) ? acceptable for ~400?650 rows; flag if larger schedules stutter. Validation issue row indices may diverge from grid when parse drops empty rows (pre-existing).

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Project Report pdf.js inline renderer

- **Summary:** Replaced iframe+blob URL approach (still showed Chromium "Open" placeholder) with internal **pdf.js** canvas renderer. PDF bytes are fetched via authenticated axios blob, loaded as `ArrayBuffer`, and all pages render to stacked canvases inside `PdfDocumentViewer`. Toolbar controls (zoom, fit width/page, page nav, search, fullscreen, download) are wired to the renderer. Inline **Retry** on fetch/render failure; no external Open button or window.
- **Root cause:** Prior fix (`asPdfBlob()` + iframe `blob:` URL + PDF hash fragments) cannot embed PDFs inline in Chromium/Edge ? the browser shows its built-in blob placeholder (PDF icon, UUID, blue Open button) instead of rendering pages inside an iframe. MIME normalization alone does not fix this. Backend `Content-Disposition: attachment` is irrelevant once bytes are fetched client-side.
- **Dependency:** `pdfjs-dist@4.10.38`; worker via `pdf.worker.min.mjs?url` (Vite bundles worker chunk).
- **Files:** `PdfDocumentViewer.tsx`, `ProjectPdfPreviewModal.tsx`, `design-system.css`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` ? Status ? Project Report ? actual PDF pages inline; no Open-button placeholder.
- **Flagged (not changed):** Backend report endpoints still send `Content-Disposition: attachment` (harmless for pdf.js fetch); search jumps to matching page but does not highlight text spans.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Supervisor Projects Active Panel dropdown

- **Summary:** Active Panel dropdown on Supervisor Projects tab now shows only compact panel tags (`=H001`, `=E01`) for the selected project ? no combined project?panel reference titles. Dedupes frames that share the same compact name (prefers wired frame / shortest stored name). Duplicate detection uses compact keys so `=H001` vs a long legacy title is flagged. Wiring upload no longer overwrites `=`-prefixed panel names with `project.name`.
- **Root cause:** Dropdown rendered raw `panel_name`; wiring upload replaced `=H001`-style names with the full project reference title when `panelName.startsWith('=')`.
- **Files:** `projectDisplay.ts`, `panelDuplicates.ts`, `ProjectsTab.tsx`, `DuplicatePanelWarning.tsx`, `upload.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` ? Projects ? panel dropdown shows `=H001` / `=E01` only; changes when project changes.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Project Report inline PDF viewer

- **Summary:** Replaced broken Project Report preview UX (browser blob fallback with PDF icon, UUID, and external **Open** button) with an embedded authenticated PDF viewer inside `ProjectPdfPreviewModal`. JWT blob fetch is normalized to `application/pdf`, rendered in an iframe with Chrome PDF view hashes, and wrapped in a DWES toolbar (zoom, fit width/page, page nav, search hint, fullscreen, download). Modal opens in fullscreen by default with compact/expand toggle and footer download preserved.
- **Root cause (superseded):** Blob URLs created without an explicit PDF MIME type caused Chromium to show the generic download/open placeholder instead of inline rendering. **Superseded by pdf.js fix above** ? iframe+blob cannot embed inline in Chromium regardless of MIME type.
- **Files:** `PdfDocumentViewer.tsx` (new), `ProjectPdfPreviewModal.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Verify:** `npm run build` exit 0; `/supervisor` ? Status ? Project Report ? PDF visible inline; zoom/fullscreen/download work; no Open-button placeholder.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Excel Wiring Upload full-view rendering

- **Summary:** Per `dwes_debug_fullview_render.md`: fixed Full View grid not filling the modal viewport (blank/clipped data rows, broken scroll). Root cause was a broken flex height chain ? nested stacked fullscreen `Modal` plus `height: 0` / `flex: 1 1 auto` on `.wu-grid-wrap--fullview` collapsed the scroll container. Full View now swaps content inside the existing upload modal (no nested modal); scroll area uses `flex: 1 1 0%`; `modal-box-fullscreen .modal-body` gets `flex-1`; fullview table uses `table-layout: auto` (was conflicting with `width: max-content`). Sticky header / frozen `#` column backgrounds reinforced for fullview rows.
- **Files:** `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Flagged (not changed):** Row count in chips reflects `sample_rows` from `readHeaders` (up to 5000 data rows per sheet) ? if a file shows fewer rows than expected, verify Excel sheet content / header detection before changing parser logic. Import/persistence unchanged.
- **Verify:** `/supervisor` ? Excel Wiring Upload ? mapping ? **Full view**: grid fills viewport, all rows scroll vertically, columns scroll horizontally, sticky headers + frozen `#` column work, mapping dropdowns/checkboxes/search respond, **Exit full view** returns to inline mapping; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? QA ? Stabilization pass (verify ? debug ? test ? harden)

- **Summary:** Per `dwes_stabilization_verify_debug_test_harden.md`: Phase 0?7 inventory and health check across DWES after recent UI/report/modal changes. Frontend `npm run build` + `npm run lint` and backend `npm run build` all exit 0. Panel completion report PDF on rebuilt backend is ~66 KB standalone (no GA appendix); stale `:3001` dev process still served pre-refactor ~15 MB wiring+GA PDF and returned 404 for `completion-report`. Meta overlap fixed in source (`drawMetaGrid` / `.pcr-meta-grid`). Security findings triaged (report-only). Corrected stale JSDoc on `frames/:id/report-pdf`.
- **Files:** `backend/src/frames/frames.controller.ts` (comment), `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Restore point:** Dirty `main` @ `f6af0a9` (no commit)
- **Manual:** Restart `npm run dev:all`; browser smoke-test `/`, `/technician`, `/supervisor`; confirm GA merge policy; triage Phase 6 security list.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Brand ? App icon matched to canonical Ingenious logo

- **Summary:** Per `dwes_app_icon_brand_match.md`, regenerated the full app icon set from the canonical Ingenious Network globe mark (`src/assets/logo-icon.svg` / `public/logo.svg`) instead of the abstract blue-tile wiring motif. White rounded tile matches `CompanyLogo` topbar pill; exact logo colors (`#2E9DAA`, `#6DCFD4`, `#1B2958`, etc.). Updated `index.html` (SVG favicon + `favicon.ico` fallback, 180?180 Apple touch icon), `manifest.webmanifest` theme/background (`#1B2958` / `#FFFFFF`), and extended `generate-app-icons.mjs` to emit `favicon.ico` and `apple-touch-icon.png`.
- **Files:** `public/app-icon.svg`, `public/favicon.svg`, `public/favicon.ico`, `public/app-icon.ico`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/apple-touch-icon.png`, `scripts/generate-app-icons.mjs`, `index.html`, `public/manifest.webmanifest`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Delivery path:** PWA (`manifest.webmanifest`) + browser favicon + Windows desktop shortcut (`app-icon.ico` via `npm run shortcut:create`). No Electron packager.
- **Flag:** `logo-full.png` referenced by `CompanyLogo` is not present under `public/` (SVG source exists). Existing desktop shortcuts / installed PWAs cache the old icon ? reinstall PWA or re-create shortcut to refresh.
- **Verify:** `npm run icons:generate` + `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Global popup/modal shell redesign

- **Summary:** App-wide modal modernization per `dwes_global_popup_modal_redesign.md` (Path A ? shared `Modal` primitive). Unified backdrop (`rgba(0,0,0,0.45)` + blur), 16px-radius elevated surface, width ladder (sm 420 / md 560 / lg 720 / xl 900), 90vh max-height with pinned header/footer, bold title + optional subtitle, 44px close control, fade+scale entry (`prefers-reduced-motion` safe). `PauseReasonModal` migrated onto shared shell; Technician Workflow narrowed to `lg` with panel context subtitle. High-contrast segmented tabs, status pills, and warning banners refreshed in workflow/pause content styles. `AppDialogProvider` confirm/alert icons use tokened `.dlg-icon-wrap`.
- **Files:** `Modal.tsx`, `AppDialogProvider.tsx`, `PauseReasonModal.tsx`, `TechnicianWorkflowModal.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Breaking:** None ? all `Modal` props preserved; optional `subtitle` added. Technician Workflow `size` changed `team` ? `lg` (appearance only).
- **Verify:** `npm run build` exit 0; smoke-test Technician Workflow (3 tabs), Pause reason popup, one confirm/delete via `useAppDialog`.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Report ? Project Completion Report spec alignment (panel PDF + preview)

- **Summary:** Aligned panel **Project Completion Report** with `dwes_project_completion_report_redesign.md`: PDF zones reordered (header ? meta grid ? personnel ? KPI centerpiece ? timeline ? remarks ? sign-off ? footer); fixed overlapping meta layout via proper two-column grid; mid-change technician block only when reassignment exists; Frame ID in header ref; login/logout times from `session_log`; footer with confidential note, generated timestamp, and page number. Added `GET /projects/:code/frames/:id/completion-report` JSON endpoint. On-screen preview (`ReportPreviewModal`) now renders matching executive layout via `PanelCompletionReportPreview` with PDF + XLSX export. Detailed per-cable XLSX export unchanged.
- **Files:** `panel-completion-report-pdf.ts`, `panel-completion-report.helper.ts`, `wiring-document.service.ts`, `frames.controller.ts`, `PanelCompletionReportPreview.tsx`, `ReportPreviewModal.tsx`, `api.ts`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Missing data (placeholders when absent):** Region/location (no `@dwes-meta`), technician login/logout (`session_log` empty), client representative name (signature line blank by design), supervisor/technician remarks when none recorded.
- **Flag:** Project-level PDF (`/projects/:code/report-pdf` without frame) remains the separate multi-panel `report-pdf.ts` dossier.
- **Verify:** Restart backend; `/supervisor` ? Status ? panel report preview; Projects ? Reports ? PDF; `npm run build` + `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Excel Wiring Upload full-view Excel-like redesign

- **Summary:** Redesigned the wiring schedule **Full view** overlay for a true Excel-like review experience: grid fills the fullscreen modal (`flex-1` + `height: 0` scroll container), `variant="fullview"` on `WiringScheduleMappingGrid` with `width: max-content` table layout so all columns render, removed inline `max-width` truncation in full view, sticky checkbox/header/mapping rows on vertical scroll, frozen `#` index column with freeze-edge shadow on horizontal scroll, drag-to-resize column handles (pointer events, session-persisted `columnWidths` in `UploadFrameModal`), compact toolbar/banner. Inline mapping grid unchanged (`variant` default `inline`).
- **Files:** `WiringScheduleMappingGrid.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Excel Wiring Upload ? mapping ? **Full view**: scroll all rows/columns, headers stay pinned, `#` column frozen, drag column borders to resize; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Brand ? Premium desktop app icon redesign

- **Summary:** Redesigned `public/app-icon.svg` for enterprise-grade Windows/PWA use: brand-blue tile gradient (`#1B4FD8` ? deep navy), refined specular depth, rim-light border, and bolder teal wiring mark (orbit + cable pair + junction hub) optimized for 16?256 px legibility. Aligned `public/favicon.svg` to the same mark. Regenerated `app-icon.ico` and PWA PNGs via `npm run icons:generate`; maskable safe-zone background updated to brand blue.
- **Files:** `public/app-icon.svg`, `public/favicon.svg`, `public/app-icon.ico`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `scripts/generate-app-icons.mjs`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run icons:generate` + `npm run build` exit 0; icon reads as blue tile with teal diagonal at 16 px, full wiring detail at 256 px.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Excel Wiring Upload full view + hidden column filter

- **Summary:** Excel Wiring Upload mapping step: column filter dropdown hidden from toolbar (`.wu-filter--hidden`; `columnFilter` state and grid logic unchanged, default `'all'`). Added **Full view** toolbar button (`Maximize` icon) opening a stacked fullscreen `Modal` with the same `WiringScheduleMappingGrid` props, minimal bar (sheet/row/column chips, search, **Exit full view**), validation banner when preview exists, and sticky worksheet grid for maximum review area.
- **Files:** `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects ? Excel Wiring Upload ? mapping step: no filter dropdown; Full view opens overlay; mapping/checkboxes sync; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Supervisor Projects toolbar shorter action labels

- **Summary:** Shortened Supervisor Projects tab action toolbar button labels for a more compact toolbar: **Wiring Upload**, **Workflow**, **Drawing**, **Reports**, **Users** (unchanged: **New Project**). Icons, classes (`pj-btn-primary pj-action-btn`), gating, and handlers unchanged; tooltips updated where they referenced old names.
- **Files:** `ProjectsTab.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects tab toolbar shows new labels; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Workspace shell & design-system modernization

- **Summary:** Modernized workspace navigation and content area via design tokens and shared CSS: larger bolder typography (nav ~15px semibold, page titles ~26px, section headers ~18?22px), dark slate text (#0F172A primary, #334155 secondary), premium gradient active nav pill + left accent, refined cards (12px radius, #CBD5E1 border, soft shadow), dashboard hero gradient top band, stronger app-section headers and Projects tab info labels/values. No business-logic or API changes.
- **Files:** `tokens.css`, `theme-palettes.css`, `index.css`, `design-system.css`, `tabs.css`, `themes.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run build` exit 0; smoke-test `/`, `/supervisor`, `/technician` ? `#root` renders with updated nav typography and card surfaces.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Excel Wiring Upload unified design system

- **Summary:** Rebuilt the entire **Excel Wiring Upload** mapping popup under a single `.wu-*` design language aligned with DWES form inputs, chips, and upload headers. Replaced inconsistent controls with unified toolbar (search + filter), KPI chips, validation banner, field legend chips, custom 16px checkboxes (fixes global 44px touch-target blowout), sticky worksheet grid with column-state colors, and compact mapping selects. High-contrast light theme throughout.
- **Files:** `WiringScheduleMappingGrid.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects ? Excel Wiring Upload ? mapping step; consistent styling across checkboxes, filters, chips, grid, footer; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Excel Wiring Upload compact column selection + contrast

- **Summary:** Redesigned **Excel Wiring Upload** column selection: removed bulky card grid; compact per-column checkboxes now sit directly above each Excel header in the worksheet grid, with a master **Select All** checkbox in the row-index column. Column filter dropdown: **All**, **Selected**, **Required**, **Unselected**. Higher-contrast light theme ? darker text, 2px borders, color-coded column states (selected/mapped, required, unselected, idle), stronger checkboxes and mapping selects for tablet/laptop review sessions.
- **Files:** `WiringScheduleMappingGrid.tsx`, `FramesTab.tsx` (`UploadFrameModal`), `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects ? Excel Wiring Upload ? mapping step: inline checkboxes, master select, column filters, contrast; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Technician Workflow dashboard-scoped selection

- **Summary:** **Technician Workflow** now follows the same project + panel gating as Excel Wiring Upload, Drawing Upload, and Report: supervisor selects project and panel on the Projects tab first; the toolbar button stays disabled until both are selected. The modal no longer includes Project/Panel dropdowns ? it inherits the dashboard selection and shows a compact context card with status badge (Unassigned, Assigned, In Progress, Paused, Completed, Changeover Eligible), assigned technician, cable count, and KPI chips. Workflow tabs remain **Assign**, **De-assign**, and **Mid Changeover** only.
- **Files:** `TechnicianWorkflowModal.tsx`, `ProjectsTab.tsx`, `SupervisorDashboard.tsx`, `SupervisorAlertStrips.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects ? select project + panel ? Technician Workflow enabled; modal shows context card without dropdowns; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Status workspace collapsible project cards

- **Summary:** Redesigned supervisor **Status** workspace for scale: compact collapsible project cards with KPI chips in the header, expandable panel grids (status, technician, progress, review/QC, icon actions), scrollable panel area for large projects, dedicated **Project Report** section per card, Expand/Collapse all controls.
- **Files:** `ReviewApprovalWorkspace.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Status ? collapse/expand projects; panel actions and project report; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? User Management premium redesign

- **Summary:** Rebuilt supervisor **User Management** modal: removed horizontal-scrolling table in favor of responsive card grid with summary chips and prominent **Edit User** actions. **Edit User** popup reorganized into section cards (User Details, Credentials, Panel Assignment, Account Status, Delete) with compact spacing, badges, and tablet/laptop-friendly layout.
- **Files:** `UsersTab.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? User Management ? card grid, edit flow, password reset, panel assign/remove; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Technician Workflow simplification + Status tab

- **Summary:** Removed separate **Panel Verification** from supervisor assignment flows. Excel wiring upload now auto-validates frames on import (`compare_status: validated`). **Technician Workflow** redesigned as a compact premium modal with **Assign**, **De-assign**, and **Mid Changeover** only. Renamed **Review & Approval** sidebar tab to **Status**.
- **Files:** `TechnicianWorkflowModal.tsx`, `AssignTechnicianModal.tsx`, `FramesTab.tsx`, `SupervisorDashboard.tsx`, `ReviewApprovalSection.tsx`, `SupervisorAlertStrips.tsx`, `upload.service.ts`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Upload schedule ? assign without verify step; `/supervisor` ? **Status** tab; Technician Workflow three segments; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Review & Approval unified workspace

- **Summary:** Removed **Overall Panel Status** sidebar tab. **Review & Approval** is now the single centralized supervisor workspace: all projects with full display titles and nested panel/subpanel rows in modern cards, live execution status (12s poll), wiring progress, legacy assignment approval, supervisor review (approve / QA-QC / rework), per-panel completion report preview, read-only **Project Report** PDF popup, and **Submit to Director** when all completed panels are approved. Added `projectsApi.submitToDirector`.
- **Files:** `ReviewApprovalWorkspace.tsx`, `ProjectPdfPreviewModal.tsx`, `ReviewApprovalSection.tsx`, `SupervisorDashboard.tsx`, `api.ts`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Review & Approval only (no Panel Status tab); project cards show panels with actions; Project Report PDF popup; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Technician Workflow consolidated modal

- **Summary:** Assignment, de-assignment, and mid-changeover are unified in a **Technician Workflow** button on the Projects toolbar (next to Excel Wiring Upload). Wide modal with Assign / Active / Changeover sections; verify-before-assign, assignment cards with remove, and inline changeover form. Removed **Assignments** and **Mid-Changeover** from supervisor sidebar navigation.
- **Files:** `TechnicianWorkflowModal.tsx`, `SupervisorDashboard.tsx`, `ProjectsTab.tsx`, `SupervisorAlertStrips.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects ? Technician Workflow; alert strip opens changeover section; sidebar no longer shows Assignments / Mid-Changeover.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Excel Wiring Upload full-screen worksheet grid

- **Summary:** Redesigned supervisor Excel Wiring Upload mapping step as a **full-screen Excel-like workspace**: complete worksheet rows (up to 5000), sticky dual-row headers (column name + mapping dropdown), sticky row index, search, column/row filters, validation highlighting in-grid, unified validate + import flow. Removed separate checkbox strip and validate step ? mapping dropdowns are the column selection UI.
- **Files:** `WiringScheduleMappingGrid.tsx`, `wiringSystemFields.ts`, `FramesTab.tsx`, `Modal.tsx`, `design-system.css`, `upload.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Supervisor ? Projects ? Excel Wiring Upload ? full worksheet grid, map columns, Validate & Import; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Report ? Project Completion PDF executive redesign

- **Summary:** Panel completion report PDF rebuilt as a **single-page** portrait A4 executive layout: navy header with DWES logo, status badge, KPI summary cards, completion progress bar, two-column project/personnel and wiring/timeline sections, compact remarks, three-column approval sign-off, and confidential footer. Uses `@dwes-meta` location/month when present; voltage from frame or project code. Post-process trims accidental overflow pages via pdf-lib.
- **Files:** `panel-completion-report-pdf.ts`, `panel-completion-report.helper.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Restart backend (`npm run backend` or `dev:all`), supervisor Projects ? Report PDF ? one page, print-ready; `npm --prefix backend run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Panel report download filename (Windows-safe)

- **Summary:** Report PDF/Excel filenames use `Report_<ProjectCode>_<Panel>.ext` instead of the long legacy project title. Sanitizer strips `&`, `=`, en-dashes, collapses underscores, and avoids duplicate panel segments. Applied on supervisor download, backend PDF generation, and Excel export.
- **Files:** `reportFilename.ts`, `report-filename.ts`, `ProjectsTab.tsx`, `wiring-document.service.ts`, `supervisor.controller.ts`, `ReportPreviewModal.tsx`, `CHANGELOG.md`
- **Example:** `Report_132KV33KV_KSA_RIYADH_2026_001_H001.pdf`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Project Information Card structured layout

- **Summary:** Info card shows labeled fields (Substation, Client, Location/Region, Month/Year, Project code, Numbering, Status, Panels) instead of one long dash-separated title. Client shown once. New projects store substation name in `name` and location/month in encoded `description` metadata. Legacy long titles parsed for display. Project auto-selected after create. Dropdown uses short `Substation ? Client` label.
- **Files:** `ProjectsTab.tsx`, `projectDisplay.ts`, `design-system.css`, `CHANGELOG.md`
- **Verify:** Create project ? card populates immediately with clean fields; legacy projects still readable.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Per-panel metadata on create, add panel, info card

- **Summary:** New Project form captures **Panel name**, **Panel type**, **Voltage level**, and **System type** separately for each panel (stored per frame). Project code uses panel 1 voltage. **Add Panel** on project info card + `POST /api/projects/:code/frames`. Info card shows selected panel metadata from stored values; voltage falls back to project code segment for legacy panels only when frame field is empty.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `api.ts`, `frames.controller.ts`, `frames.service.ts`, `projects.service.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Create project with 2 panels (different voltages) ? select each panel ? info card updates; Add Panel on existing project; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Fix ? Supervisor panel list loading race

- **Summary:** Selecting Active project now sets `loadingPanels` synchronously and clears stale panel list, preventing a one-frame flash of "No Panels Available" before frames API returns. Session auto-restore uses the same pattern; clearing project selection resets loading state.
- **Files:** `ProjectsTab.tsx`, `CHANGELOG.md`
- **Verify:** `/supervisor` ? select project ? panel dropdown shows "Loading panels?" then panel names (no false empty state).

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? New Project popup redesign (supervisor)

- **Summary:** Redesigned supervisor New Project modal: two-column responsive layout (wide modal). Mandatory: Project / Substation Name, Panel Name / Panel Type (single field, allows `=`), Voltage Level. Client beside project name; voltage beside panel field. Combined Location / Region and Month / Year fields. Sequence renamed to Project Numbering. Live preview of auto-generated project name (`Name ? Client ? Panel ? Voltage ? Location / Region ? Month / Year`) stored on create.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects ? New Project; fill fields; preview updates; create succeeds; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Branding ? Desktop icon (premium compact mark)

- **Summary:** Redesigned `app-icon.svg` for Windows desktop: navy gradient tile (`#1B2958` / `#0F2557`), bold teal wiring mark (single orbit + two cable strokes + hub) aligned with Ingenious Network / report branding. Removed fine triple-orbit lines for legibility at 16?48 px. Regenerated `app-icon.ico` and PWA PNGs; ICO pad color updated to `#1B2958`.
- **Files:** `public/app-icon.svg`, `scripts/generate-app-icons.mjs`, `public/app-icon.ico`, `public/icons/*.png`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `npm run icons:generate`; `npm run build` exit 0. Refresh desktop shortcut: `powershell -File scripts/fix-desktop-shortcut.ps1` (or F5 desktop / re-pin).

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Projects single info card (panel-scoped metadata)

- **Summary:** Supervisor Projects tab shows one project information card below action buttons. Removed duplicate identity bar and panel table. Card highlights active project name, then panel name/type and per-panel voltage level / system type for the selected panel. Edit/Delete target selected panel (or project when no panel). Panel metadata stored on frames (`voltage_level`, `system_type`) with extended patch-panel API.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `mock-store.ts`, `projects.service.ts`, `frames.service.ts`, `frames.controller.ts`, `upload.service.ts`, `api.ts`, `ProjectPanelSelect.tsx`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? Projects; select project + panel; single card shows all fields; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? Projects panel list identity + empty state

- **Summary:** Panel list shows full created project name and selected panel/subpanel in identity bar and table columns. High-contrast blue `Selected` badge. Empty project panels show "No Panels Available" (project remains). Panel delete confirms it removes only the panel, not the project.
- **Files:** `ProjectsTab.tsx`, `design-system.css`, `CHANGELOG.md`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? User Management table column balance

- **Summary:** Tighter team-mgmt table: Panel column 16% (was 24%), Name 44%, reduced cell padding, w-fit panel badges, wider modal (1080px / 96vw) to use available width without Panel?Edit gap.
- **Files:** `UsersTab.tsx`, `design-system.css`, `CHANGELOG.md`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FEAT ? Panel Project Completion Report (live PDF)

- **Summary:** Supervisor panel PDF export (`/frames/:id/report-pdf`) now generates a **Project Completion Report** from live DWES data (assignments, cable progress, sessions, rework) instead of the wiring schedule document. Status logic: Not Assigned, Not Started, In Progress, On Hold, Completed. Includes KPI cards, execution metadata, login/logout log, remarks, and sign-off. Matches `Prompt.md` spec.
- **Files:** `panel-completion-report.helper.ts`, `panel-completion-report-pdf.ts`, `wiring-document.service.ts`, `frames.controller.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** Restart backend ? Supervisor ? Projects ? select project + panel ? Report ? PDF; filename `Report_<Project>_<Panel>.pdf`.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? User Management table + unified Edit popup

- **Summary:** User list table uses tighter column balance (Panel 24%, Edit 8%); single icon Edit per row (Delete removed from list). Edit opens comprehensive **User Management** popup: profile + username, panel assign/change, activate/deactivate, password reset, and delete user. Supervisors can update technician usernames via API.
- **Files:** `UsersTab.tsx`, `design-system.css`, `users.service.ts`, `users-rbac.ts`, `CHANGELOG.md`, `PROJECT_STATUS.md`
- **Verify:** `/supervisor` ? User Management; balanced columns; Edit opens full management modal; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? UI ? User Management modal responsive redesign

- **Summary:** Team Management modal uses `team` size (up to 1024px), inherits base modal flex/overflow layout, fixed-layout table with percentage-only column widths (no horizontal scroll), single vertical scroll region, compact badges and icon action buttons (labels on wide screens). Edit + Delete (deactivate) always visible in Actions column on tablet/laptop. Card layout on narrow phones.
- **Files:** `UsersTab.tsx`, `Modal.tsx`, `design-system.css`, `CHANGELOG.md`
- **Verify:** `/supervisor` ? Projects ? User Management; all columns visible on laptop/tablet; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FEAT ? Projects panel list, duplicate guard, upload headers

- **Summary:** Panel dropdown lists only the selected project's panels (name only). Dedicated panel/subpanel table below action buttons with Edit/Delete. Duplicate names highlighted with warning and upload/report block. Wiring and drawing modals show prominent project + panel identity header.
- **Files:** `ProjectsTab.tsx`, `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `UploadTargetHeader.tsx`, `DuplicatePanelWarning.tsx`, `panelDuplicates.ts`, `design-system.css`, `frames.controller.ts`, `frames.service.ts`, `api.ts`, `CHANGELOG.md`
- **Verify:** `/supervisor` ? Projects; `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FIX ? Topbar project/user pill text contrast

- **Summary:** Project code and user full name on light header pills now use dark high-contrast tokens (`--topbar-pill-text` / `--t-header-pill-text` ? slate-900) with muted secondary labels; theme overrides added for arctic, aurora, and generic `[data-theme]` so no palette forces light gray on white pills.
- **Files:** `design-system.css`, `themes.css`, `theme-palettes.css`, `aurora.css`, `CHANGELOG.md`
- **Verify:** `npm run build` exit 0; check topbar project pill + user card on `/supervisor`, `/admin`, `/technician`.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FEAT ? Supervisor Projects panel selector + DWES icon refresh

- **Summary:** Added Active Panel dropdown beside Active Project on supervisor Projects tab; Excel Wiring Upload, Drawing Upload, and Report stay disabled until both are selected. Reports use panel-scoped PDF/Excel (`reportPdf` + `panelReportXlsx`); wiring upload sends optional `frame_id` to populate the selected panel frame. Redesigned `app-icon.svg` (compact teal orbital mark, high-contrast navy tile) and regenerated `.ico`/PWA PNGs. Supervisor hero subtitle now matches admin/director (`full_name ? employee_id`).
- **Files:** `SupervisorDashboard.tsx`, `ProjectsTab.tsx`, `FramesTab.tsx`, `PdfDrawingUploadModal.tsx`, `design-system.css`, `public/app-icon.svg`, `scripts/generate-app-icons.mjs`, `api.ts`, `upload.controller.ts`, `upload.service.ts`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Verify:** `/supervisor` ? Projects ? project + panel selectors; gated toolbar; panel report download; hero matches `/admin`. Re-run desktop shortcut script if icon cached. `npm run build` exit 0.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FIX ? supervisor Projects action toolbar sizing

- **Summary:** Tightened `.pj-actions-grid` so toolbar buttons stay 40px tall (override `pj-btn-primary` 48px) and use `flex: 0 1 auto` instead of stretching full row width.
- **Files:** `design-system.css`
- **Verify:** `/supervisor` ? Projects ? compact action row, no ballooning buttons.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FIX ? Supervisor hero matches admin/director

- **Summary:** Removed `dashboard-hero--supervisor` dark gradient override; Production Supervisor header now uses the shared default `dashboard-hero` surface (same layout, typography, and contrast as System Administrator and Operations Director).
- **Files:** `SupervisorDashboard.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Verify:** `/supervisor` vs `/admin` vs `/director` ? white card hero, dark title, blue badge, readable subtitle.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? MCP config + Section 8 (files sync)

- **Summary:** Added `.cursor/mcp.json` (filesystem, Postgres WiringSchemeDB, git, browser, memory). Merged Section 8 MCP rules into `dwes-project-skill.mdc`. Fixed `files/mcp.json` (removed invalid example-only `dwes-database` block). Synced `files/dwes-project-skill.md`.
- **Files:** `.cursor/mcp.json`, `dwes-project-skill.mdc`, `dwes-profile.mdc`, `Desktop/files/mcp.json`, `Desktop/files/dwes-project-skill.md`
- **Note:** `dwes-database` URL must match `backend/.env` `DATABASE_URL`. Reload Cursor after MCP install.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Revalidate project skills (artifact sync)

- **Summary:** Restored full artifact content to `dwes-project-skill.mdc`; fixed ?2.3 for WiringSchemeDB read-only (not generic migrations); synced Desktop master copy; revalidated `dwes-profile.mdc` rules index.
- **Files:** `.cursor/rules/dwes-project-skill.mdc`, `dwes-profile.mdc`, `~/.claude/skills/dwes-project/SKILL.md`, `Desktop/dwes-project-skill.mdc`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? Project skills sync (`dwes-project-skill.mdc`)

- **Summary:** Added permanent DWES project skill and discovered profile to `.cursor/rules/`; created `dwes-project` agent skill index linking `dwes-db-guard` and `dwes-reports-backup`.
- **Files:** `.cursor/rules/dwes-project-skill.mdc`, `.cursor/rules/dwes-profile.mdc`, `~/.claude/skills/dwes-project/SKILL.md`, `CHANGELOG.md`
- **Restore point:** _(pending git ? no commits on main yet)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
- **Summary:** Reorganized All Projects action buttons into a compact flex toolbar (consistent 40px height, even spacing). Added supervisor-scoped gradient hero header (`dashboard-hero--supervisor`). Hid mid-changeover alert strips on the Projects tab; Mid-Changeover tab unchanged.
- **Files:** `SupervisorDashboard.tsx`, `ProjectsTab.tsx`, `SupervisorAlertStrips.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `CHANGELOG.md`
- **Verify:** `/supervisor` ? Projects tab ? compact action row, gradient header, no changeover status strip; Mid-Changeover tab still shows changeover queue.
- **Restore point:** _(pending git ? no commits on main yet)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FIX ? Workspace sidebar height (reinforced)

- **Summary:** Replaced unreliable `min-height: 100%` on `.dash-sidebar` with `calc(100dvh - var(--dash-topbar-height))` and matched `.dash-main` min-height so Workspace column and main content stay equal on short and tall project pages.
- **Files:** `src/styles/design-system.css`
- **Verify:** tablet-landscape ? `/supervisor` ? Projects, `/technician`, `/admin`; sidebar border/background runs full column height beside main content.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-08 ? FIX ? Workspace sidebar height alignment

- **Summary:** The left **Workspace** sidebar (`dash-sidebar`) only matched its nav item height because of `self-start sticky` + `max-height: 100dvh`. It now stretches with `dash-layout` so the sidebar column matches main content height on all project/dashboard routes; short pages still fill the viewport below the topbar via `--dash-topbar-height`.
- **Files:** `src/styles/design-system.css`
- **Verify:** `npm run build`; open `/supervisor` ? Projects (and Assignments), `/technician`, `/admin` ? sidebar border/background should run full column height beside scrollable main content.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? FIX ? stale Vite proxy 502 (login "Can't reach server")

- **Summary:** Backend on :3001 was healthy but an orphaned Vite dev process returned 502 on `/api/*`. Restarted Vite; proxy + login verified (`/api/health`, `/api/auth/login`).
- **Recovery:** `npm run dev:all` or restart Vite after backend is up.
- **Files:** _(runtime restart only)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? FIX ? backend autostart VBS syntax error

- **Summary:** Fixed `start-backend-hidden.vbs` VBScript compilation error (line 10: illegal multi-line `BuildPath(` call). Scheduled-task / hidden launcher can start `run-backend.bat` again.
- **Files:** `scripts/start-backend-hidden.vbs`
- **Verify:** `http://localhost:3001/api/health` ? `status: ok`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? REVERT ? tech-ui-v2 layout redesign + dwes-modern-ui

- **Summary:** Reverted `.tech-ui-v2` layout redesign and `.dwes-modern-ui` scoped styling per author request. Prior streamlined wiring workflow UI restored (table-based single-wire exec, dash action buttons, panel list).
- **Files:** `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `PauseReasonModal.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `technician-wiring-workflow.mdc`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Technician Dashboard layout redesign (`.tech-ui-v2`)

- **Source:** User request ? full layout/UX modernization (not color-only)
- **Summary:** Scoped `.tech-ui-v2` layout layer on technician surfaces. **Home:** active-panel focus strip with progress ring, command launch tiles, responsive panel grid. **Execution:** 3-zone header shell, card-based single-wire view (serial hero, source?dest flow, spec grid), sticky nav + open-end dock. Full Wiring View schedule unchanged. All handlers/API calls preserved.
- **Files:** `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `design-system.css`, `PROJECT_STATUS.md`, `technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? dwes_general_modern_ui_prompt ? technician scoped modern UI

- **Source:** `dwes_general_modern_ui_prompt.md` (TARGET: Technician Dashboard + wiring execution)
- **Summary:** Scoped `.dwes-modern-ui` layer using existing design tokens only ? larger type, WCAG-oriented contrast, elevated light cards, 44px touch targets, semantic status chips. Light workspace header (no in-content dark band). No logic/global token changes.
- **Files:** `TechnicianDashboard.tsx`, `WiringWorkstation.tsx`, `PauseReasonModal.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? REVERT ? Prompt 07 technician-surface styling

- **Summary:** Reverted `.technician-surface` high-contrast emphasis layer per author request.
- **Files:** `TechnicianDashboard.tsx`, `WiringWorkstation.tsx`, `PauseReasonModal.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? REVERT ? Prompt.md vibrant color system

- **Summary:** Reverted technician `.tech-ui-vibrant` color overrides (navy headers, royal/emerald/amber gradients) per author request. Prior muted styling restored.
- **Files:** `TechnicianDashboard.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `CHANGELOG.md`, `PROJECT_STATUS.md`

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? pause modal reason-only

- **Source:** `Prompt.md` (Desktop, corrected)
- **Summary:** Removed Source Open / Destination Open from Pause Wiring popup. Pause now requires only a reason chip (Tea break, Lunch break, Material delay, Mid-changeover, Other) before confirm. Open-end buttons remain on the single-wire execution footer only.
- **Files:** `PauseReasonModal.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? streamlined wiring workflow + full schedule reference

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed filter/search toolbar from single-wire execution view; added **Full Wiring View** (scrollable Excel-style reference schedule, close to return). Removed Confirm Source/Destination ? **Skip (Next)** auto-marks both ends complete; **Source Open** / **Destination Open** record partial completion. Redesigned compact Pause Reason modal with chip picker and optional open-end buttons. Modernized My Assigned Panel cards (elevated layout, animated progress border, Green/Amber/Grey status). **Complete project** gated until all cables have both ends done. Status badges: Green Completed, Amber In Progress, Grey Not Started.
- **Files:** `DigitalWiringFrame.tsx`, `WiringWorkstation.tsx`, `PauseReasonModal.tsx`, `PanelsTab.tsx`, `wiring-utils.ts`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? tablet-optimized wiring execution UI

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Optimized technician Digital Wiring View for tablet visibility: compact search/filters/validation strip/secondary chrome; enlarged primary wiring fields (No., Source, Destination, Color, Size, Length, Status); slimmer cable visual path bar. Removed Notes/Issue column. Renamed Next ? **Skip (Next)**. Added **Tablet View** fullscreen mode (hides app shell via portal) and **Return to Web View** to restore embedded dashboard layout. Portrait/landscape CSS for tablet fullscreen.
- **Files:** `DigitalWiringFrame.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? embedded Digital Wiring workspace (no popup)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed technician Digital Wiring popup/modal (`createPortal`, `dwf-modal-backdrop`). Digital Wiring View now loads inside the main Technician Dashboard layout with embedded `dwf-workspace` shell ? preserves app header, nav, and dashboard structure. Single-wire flow, filters, validation strip, prev/next nav, and Confirm Source/Destination unchanged. Back to panels via workspace header.
- **Files:** `WiringWorkstation.tsx`, `WiringTab.tsx`, `TechnicianDashboard.tsx`, `DigitalWiringFrame.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_
- **Flags:** Modal CSS retained for non-technician/preview use only.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? single-wire Digital Wiring View (technician)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Technician Digital Wiring View shows one cable at a time (not the full schedule table). Kept modal header, search/filters, validation strip, Excel column row, and Previous/Next serial navigation. Added step-by-step Confirm Source ? Confirm Destination with auto-advance to next pending cable. Supervisor full-list workflow unchanged.
- **Files:** `DigitalWiringFrame.tsx`, `WiringWorkstation.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`, `PROJECT_STATUS.md`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt 06 ? revert technician header to original

- **Source:** `dwes_06_revert_tech_dashboard_header.md`
- **Summary:** Reverted technician dashboard hero to the original static header (`Technician Dashboard` + `Wiring Technician` chip + original subtitle). Removed project/panel identity and assigned date/time from the header area only.
- **Files:** `src/pages/technician/TechnicianDashboard.tsx`, `.cursor/rules/technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_
- **Flags:** Assigned date/time no longer appears at top; panel identity remains available via "My Assigned Panels."

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? restore Actual Wiring View (full schedule)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed focused single-wire mode (`SingleWireView`). Restored `DigitalWiringFrame` full schedule with SRC/DST checkboxes, search/filters, validation strip, and Previous/Next serial navigation with row highlight.
- **Files:** `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `design-system.css`, `technician-wiring-workflow.mdc`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? unified dashboard hero (technician)

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed separate `tech-job-header` card; technician project + panel + assigned date/time integrated into shared `DashboardShell` `dashboard-hero` (same structure as other roles). Topbar unchanged.
- **Files:** `DashboardShell.tsx`, `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `design-system.css`
- **Restore point:** _(pending git)_

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Change-management protocol adopted

- **Source:** `dwes_change_management_protocol.md`
- **Summary:** Protocol documented; project knowledge files created/updated (`CHANGELOG.md`, `PROJECT_STATUS.md`, `.cursor/rules/change-management.mdc`). Git restore points blocked until initial commit on `main`.
- **Files:** `CHANGELOG.md`, `PROJECT_STATUS.md`, `.cursor/rules/change-management.mdc`, `.cursor/rules/technician-wiring-workflow.mdc`
- **Restore point:** _(none ? repo has no commits yet)_
- **Flags:** Run `dwes_git_init_safe.md` Step 7 (initial commit) before per-change branches.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompt.md ? single-wire Digital Wiring View only

- **Source:** `Prompt.md` (Desktop)
- **Summary:** Removed Focused wire / Full schedule toggle from technician popup. Removed full 657-row table from technician workflow. Popup opens directly into one-wire sequential flow (Confirm source ? Confirm destination ? auto-advance). Dashboard header unchanged.
- **Files:** `src/components/technician/wiring/WiringWorkstation.tsx`
- **Restore point:** _(pending git)_
- **Flags:** `DigitalWiringFrame.tsx` retained in repo for non-technician/future use but not mounted in technician popup.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompts 4 & 5 ? dashboard buttons + focused flow refinements

- **Source:** `dwes_04_tech_dashboard_header_buttons.md`, `dwes_05_digital_wiring_view_focused_flow.md`
- **Summary:** Consolidated technician dashboard header; buttons above header; assignment gating; renamed Digital Wiring View; two-step confirm buttons; read-only SRC/DST markers in full table (before table removed from popup).
- **Files:** `DashboardShell.tsx`, `TechnicianDashboard.tsx`, `PanelsTab.tsx`, `WiringWorkstation.tsx`, `DigitalWiringFrame.tsx`, `Topbar.tsx`, `AssignmentAcknowledgmentModal.tsx`, `useLiveWiringStore.ts`, `GaDrawingViewModal.tsx`, `design-system.css`
- **Restore point:** _(pending git)_
- **Flags:** Multi-panel: top buttons follow selected row.

---


## 2026-07-09 — Maintenance — Phase A disk cleanup

- **Source:** User-approved Phase A cleanup (retry; dist/ remained after partial prior run).
- **Removed:** dist/, ackend/tsconfig.build.tsbuildinfo,
ode_modules/.tmp/tsconfig.app.tsbuildinfo,
ode_modules/.tmp/tsconfig.node.tsbuildinfo. All other Phase A targets were already absent (logs/, ackend/dist/, root/backend logs, check_db.*, .design-sync/.cache/, etc.).
- **Reclaimed:** ~9.10 MB measured before deletion (9,095,712 bytes).
- **Verify:**
pm run build exit 0 (frontend dist/ regenerated by build).
## 2026-07-07 ? Prompts 1?3 ? technician restructure, top bar live, wiring focus

- **Source:** `dwes_01` ? `dwes_03` (MD1)
- **Summary:** Removed KPI cards and dashboard QR; job header + panel list; live top-bar indicator; wiring workstation focus view; pause on wiring page; direct start on wiring page.
- **Files:** See prompts 4/5 entry (overlapping files)
- **Restore point:** _(pending git)_
- **Flags:** GA drawing modal is stub only.

---

## 2026-07-18 — Polish — Technician DWS Header Polish

- **Source:** User Query
- **Summary:** Restored live Project Name — Panel Name in upper assignment header. Removed duplicate project and panel name displays inside the Digital Wiring Schedule card to keep only the "DIGITAL WIRING SCHEDULE" label.
- **Files:** `src/pages/technician/TechnicianDashboard.tsx`, `src/components/technician/wiring/WiringWorkstation.tsx`
- **Verify:** `npm run build` exits 0.

---

## 2026-07-18 — Polish — Technician DWS Centered Live Progress

- **Source:** User Query
- **Summary:** Displayed the live overall completed/total cable progress counter centered in the Digital Wiring Schedule header (`dwf-exec-toolbar`) in a large, bold, absolute positioned layout. Grouped zoom and Full Wiring View buttons on the left, and removed the duplicate current-cable counter from the right.
- **Files:** `src/components/technician/wiring/DigitalWiringFrame.tsx`
- **Verify:** `npm run build` exits 0.

---

## 2026-07-18 — Feature — Technician Single-Wire Action Buttons

- **Source:** User Query
- **Summary:** Renamed "Next / Complete Wire" to "SKIP" and consolidated "Source End Open" and "Destination End Open" into a single "OPEN END" button, recording the event to reports.
- **Files:** `src/components/technician/wiring/WiringWorkstation.tsx`
- **Verify:** `npm run build` exits 0.
