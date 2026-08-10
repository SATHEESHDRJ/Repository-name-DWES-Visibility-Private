# DWES Project Status

**Last updated:** 2026-07-30 (LIVE TB physical TB resolution)

---

## LIVE TB VIEW — universal analysis (2026-07-30)

| Item | Status |
|------|--------|
| Expected headers: physical + embedded TERM TBs (all schedules) | Done |
| PDF literal text match (no binary false positives) | Done |
| SCHEDULE_DRAWING_MISMATCH failure + banner | Done |
| HIGH-only persist; no placeholder HIGH / no seeded markers | Done |
| Repro Wire 030/D3: X321 absent on GA → mismatch messaging | Verified (API) |
| Overlay / login / wiring mutation paths | Unchanged |

## LIVE TB VIEW — physical TB vs equipment (2026-07-30)

| Item | Status |
|------|--------|
| Classify schedule ends: equipment vs physical TB (X-series) | Done |
| Match ignores equipment fixture markers (74IO/K01) | Done (API code; redeploy API if not yet live) |
| Expected-header detection excludes equipment tags | Done |
| Compact red/blue oval overlay (not large rectangle) | Done |
| Auto-zoom + pan to matched TB on LIVE TB open | Done |
| Wire 024/E4 (74IO→K01): no false TB highlight | Done (equipment-only banner) |
| Automatic GA geometry / final detection pass | Not in this change |

## Equipment Wiring Status Card Grid (2026-07-28)

| Item | Status |
|------|--------|
| 9 compact equal-height cards below main KPI row | Done |
| Wider Wiring Status card | Done |
| Progress ring + bar | Done |
| Equipment-filter calculations preserved | Done |
| Main Wire Number / KPI cards | Unchanged |

## Internal Device Looping Sidebar (2026-07-28)

| Item | Status |
|------|--------|
| Sidebar item under Equipment Filter | Done |
| NOT CONFIGURED badge | Done |
| Read-only popup | Done |
| Removed from DWS header | Done |

## Project-panel Correction Centre / View Excel (2026-07-28)

| Item | Status |
|------|--------|
| Correction Centre (panel-wide corrections + active wire) | Done |
| View/Download available on any active wire | Done |
| Latest corrected workbook (fallback to original) | Done |
| Enlarged viewer, frozen headers, collapsible detail | Done |
| Focus corrected cell / scroll to active wire | Done |
| Wiring progress / matrix / unrelated APIs | Unchanged |

## Internal Device Looping UI Entry (2026-07-28)

| Item | Status |
|------|--------|
| Header button + NOT CONFIGURED badge | Done (DWS top bar only) |
| Read-only “configured later / link data” popup | Done |
| Reserved empty field sections | Done (no sample data) |
| Supervisor looping configuration | Planned (not started) |
| Wiring / DB / Excel / Equipment Filter | Unchanged |

## Action Bar OPEN SIDE (2026-07-27)

| Item | Status |
|------|--------|
| FINISHED / SKIP separate (no NEXT) | Done |
| OPEN SIDE popup → existing open-end API | Done |
| Compact centred medium buttons | Done |
| Open-end visual persist | Preserved |

## Dense One-Screen Matrix (2026-07-27)

| Item | Status |
|------|--------|
| Wire colour/size/length shown once + compact Edit | Done |
| CSS density for landscape one-screen fit | Done |
| Remarks not duplicated in footer | Done |
| API / workflow / other roles | Unchanged |

## DWS Header Project/Panel ID (2026-07-27)

| Item | Status |
|------|--------|
| Project + Panel line under DIGITAL WIRING SCHEDULE | Done |
| Duplicate SectionHeader removed when schedule embedded | Done |
| Updates across Panels / Tablet / Full / filters | Done (shared workstation header) |
| Matrix / actions / other roles | Unchanged |

## Compact Technician Workspace Density (2026-07-27)

| Item | Status |
|------|--------|
| Equal-height Wire Number + KPI cards (medium type) | Done |
| Medium action bar (1-row / 2-col / narrow stack) | Done |
| Hug-content organised Single Wire Matrix | Done |
| Elevated cable + open-end indicators | Preserved |
| Workflow / API / schema / other roles | Unchanged |

## Compact Matrix + Open-End Visuals (2026-07-27)

| Item | Status |
|------|--------|
| Compact balanced Source \| Cable \| Destination | Done |
| Elevated Cable / Wire Details + larger visual | Done |
| Medium tablet-readable labels/values | Done |
| Open Source / Destination / Both endpoint indicators | Done (status + notes) |
| Persist after refresh / Previous / Resume / SSE | Done (existing backend status) |
| Workflow / API / schema / other roles | Unchanged |

## Inline Wire Corrections (2026-07-27)

| Item | Status |
|------|--------|
| Inline Edit on matrix fields | Done |
| HISTORY button + history panel View/Download | Done |
| Yellow + comment on Corrections Excel copy | Done |
| Original schedule Excel | Unchanged |
| Schema / other role dashboards | Unchanged |

## Technician Single Wire Matrix (2026-07-27)

| Item | Status |
|------|--------|
| Full-page Source \| Cable \| Destination matrix | Done (Technician single-exec) |
| One active wire only in main workspace | Done |
| TERMSIDE_A/B + Excel `_raw` preservation | Done (display-only) |
| Compact KPIs + history + action bar | Done (API handlers unchanged) |
| Tablet landscape / portrait CSS | Done (`swm-*` / `dwf-*`) |
| WiringSchemeDB / Excel mapping / other roles | Unchanged |

## Technician Digital Wiring Schedule UI + Corrections (2026-07-26)

| Item | Status |
|------|--------|
| Compact progress matrix + Corrected count | Done (Technician only) |
| CORRECTION/EDIT + history modals | Done |
| Single-wire Source \| Cable \| Destination card | Done |
| Corrections folder / Excel register | Done (`uploads/<PROJECT>/Corrections/`) |
| Frame JSON / source Excel | Unchanged (overlay only) |
| WiringSchemeDB schema | Unchanged |

## Workflow Diagnose Repair (2026-07-20)

| Item | Status |
|------|--------|
| `workflow-diagnose.ts` corruption | Repaired (UTF-16 high-byte mojibake in messages, fabricated-pass paths removed) |
| Honest blockers | Missing devices (schedule match), terminals, ducts, revision mismatch, FAILED Flat 3D runs all surfaced |
| Provenance | `--drawing-revision` now passed to flat3d CLI from `pkg.revision` |
| Tests | `workflow-diagnose.test.cjs` new (16), `auto-extract.test.cjs` re-encoded UTF-8; 40/40 diagnose-related pass |
| Known gap | RESOLVED 2026-07-20 — the 3 xlsx-requiring tests rewritten to exceljs; full backend suite 193/193 |
| Schema / DB | Unchanged — WiringSchemeDB read-only preserved |

## Flat 3D Drawing Conversion Pipeline (2026-07-20 Phase 2)

NestJS orchestration layer added for the CAD-first Flat 3D path (DWG/DXF → LibreDWG CLI → ezdxf → GLB). `Flat3dConversionModule` wired into `AppModule` and `FramesModule`; `PanelModelService` extended with a CAD-first branch that preserves the existing PDF/parametric path. No schema migrations; no auto-publish; supervisor approval required before technician access.

## Hybrid Panel 3D Model (2026-07-20)

| Item | Status |
|------|--------|
| Supervisor CTA | **3D Model** after wiring schedule (`ProjectsTab`) |
| Workspace | `Panel3dModelWorkspaceModal` orchestration |
| Technician | Header **Cable Digital Twin** → modal |
| Viewer stack | Existing R3F / Three (no new deps) |
| Flag | `VITE_ENABLE_PANEL_3D=true` in `.env.example` |
| Schema | Unchanged |

---

## Unified design system (2026-07-20)

| Item | Status |
|------|--------|
| Shared tokens | `data-theme` / `data-mode` + `device-unity.css` on all viewports |
| Dark/Light parity | Same palette on laptop and tablet for a given mode |
| Wiring table | Portrait no longer switches to card-grid layout |
| Theme boot | `ThemeProvider` `useLayoutEffect` + `color-scheme` |
| Sales Director | Not present (by design) |

---

## Universal Local Network Mode (2026-07-19)

| Item | Status |
|------|--------|
| Start | `npm run lan` or `launchers\START-DWES-LAN.bat` |
| Bind | Vite `--host` :5175, Nest `HOST=0.0.0.0` :3001 |
| API from tablets | Relative `/api` via Vite proxy (no hardcoded IP) |
| CORS | Existing private-LAN regexes in `backend/src/main.ts` |
| Firewall | `npm run lan:firewall` (elevated, all Windows network profiles) |
| IP change | Restart `npm run lan` after switching Wi‑Fi |

---

## Xiaomi / mobile tablet app mode (2026-07-19)

- Trusted HTTPS LAN stack: `https://192.168.0.164:5173`; secure context and
  root-scoped service worker verified. HTTP remains available for normal LAN use,
  but cannot install as a standalone PWA.
- Login install action now reports **HTTPS Required** on insecure HTTP and gives
  the exact secure LAN URL instead of suggesting a browser shortcut.
- Digital Wiring Schedule tablet fullscreen scrolls vertically in portrait and
  landscape; its wiring table preserves touch horizontal scrolling and pinch zoom.
- Approved Drawing PDF supports one-finger native pan/scroll and two-finger zoom.
- Xiaomi must trust the mkcert `rootCA.pem` (never `rootCA-key.pem`) before Chrome
  can install DWES without its address bar. See `DEPLOY-LAN.md`.

---

## OCI production target — ingenious-dwes-prod-maintenance-01 (2026-07-20)

| Item | Status |
|------|--------|
| Instance | `ingenious-dwes-prod-maintenance-01` · me-dubai-1 · **Running** |
| Public IP | **`193.123.79.209`** |
| DNS | **`dwes.ingenious-network.com`** → **`193.123.79.209`** (verify with `nslookup`) |
| SSH key | `.oci-ssh/ssh-key-2026-07-20.key` + `.pub` (SHA256 `66QgKMVl…`) |
| SSH `ubuntu@193.123.79.209` | **OK** (2026-07-20) |
| SSH `ubuntu@dwes.ingenious-network.com` | Use `StrictHostKeyChecking=accept-new` or `ssh-keygen -R` if host key changed |
| Deploy docs | `infra/oci/scripts/OCI-CURRENT-TARGET.md` |
| IP-only deploy | `deploy-demo-from-windows.ps1 -PublicIp 193.123.79.209 -IpOnly` |
| HTTPS deploy | **Deferred** until SSH + DNS confirmed; then `-Domain dwes.ingenious-network.com` (no Certbot until then) |
| Legacy VM | `ingenious-dwes-prod-01` / `84.235.240.255` — not used for new hosting |

## OCI demo host — HTTPS DNS deferred (2026-07-19, superseded)

| Item | Status |
|------|--------|
| Public IP | ~~`84.235.240.255`~~ — replaced by **`193.123.79.209`** |
| SSH | Superseded — see table above |
| Next deploy | See **`OCI-CURRENT-TARGET.md`** |

## OCI demo host — ingenious-dwes-prod-01 (legacy, superseded)

| Item | Status |
|------|--------|
| Instance `ingenious-dwes-prod-01` | Stopped / retired for new deploys |
| Public IP | ~~`84.235.240.255`~~ |
| Matching key pair | ~~ssh-key-2026-07-19~~ — use **ssh-key-2026-07-20** on maintenance VM |

## Operations Director sidebar + flat register (2026-07-19)

- Shared left sidebar restored (`Submitted Panels` only); oversized inner `dash-module` wrapper removed.
- Responsive 3/2/1 project smart-card grid, labeled Client hierarchy, unchanged APIs/SSE/`View Report`.
- Frontend typecheck, oxlint (existing warnings), build exit 0; `test:state` 4/4, `test:panels` 10/10.

## Operations Director smart-card grid (2026-07-19)

- Existing submitted projects now render in a compact responsive 3/2/1-column card grid.
- Project grouping, nested submitted panels, read-only access, SSE refresh, and `View Report` remain unchanged.
- Frontend typecheck and build pass; focused frontend state/panel tests pass 14/14.

## Repository-clean follow-up (2026-07-19)

Full report: `docs/DWES-REDIS-INFRASTRUCTURE-AUDIT-REPORT.md` → "Addendum (2026-07-19)"

| Item | Status |
|------|--------|
| Frontend build (`npm run build`) | **FIXED** — was exit 2 (pre-existing), now exit 0. 2 TS errors + 11 Tailwind v4 `@apply`-plain-class errors, zero visual change |
| `ProjectsService.submitToDirector` per-panel test failure | **FIXED** — stale test fixture (root cause), not implementation; companion idempotency regression test added |
| Async Excel processing (`DWES_ASYNC_EXCEL_PROCESSING`, default off) | **IMPLEMENTED** — reuses `UploadService.uploadMapped` exactly, via new `JobsService.registerHandler` |
| Async PDF report generation (`DWES_ASYNC_REPORT_GENERATION`, default off) | **IMPLEMENTED** — reuses `WiringDocumentService.generatePanelCompletionReport` exactly |
| Backend tests | 169/169 pass · Frontend tests | 55/55 pass |

---

## Redis infrastructure audit (2026-07-18)

Full report: `docs/DWES-REDIS-INFRASTRUCTURE-AUDIT-REPORT.md`

| Item | Status |
|------|--------|
| BullMQ jobs frozen at QUEUED forever (`progress` column didn't exist) | **FIXED** — confirmed live against Postgres before/after |
| Idempotent concurrent requests returned 409 instead of the shared result | **FIXED** — verified 10-way concurrent, cross-instance: 1 mutation, 1 audit row |
| Replayed idempotent response could double-publish an SSE event | **FIXED** — `req.__dwesIdempotentReplay` marker |
| Redis outage left `isRedisActive`/`isBullMqActive` stuck `true` (locks failed closed) | **FIXED** — live `ready`/`error` listeners; verified real stop/restart |
| `backup_export` used blocking `spawnSync` (freezes the whole server) | **FIXED** — non-blocking `spawn` |
| `dwg_convert` fabricated a fake "converted" result | **FIXED** — fails clearly, points at the real converters |
| `/api/health/ready` didn't reflect Redis queue/cache/pubsub state | **FIXED** — additive `queue`/`cache`/`ready`/`degraded` fields |
| Dashboard cache reads never checked Redis (write-only) | **FIXED** — `getAsync()` |
| Real 2-instance Redis runtime (BullMQ, Pub/Sub, cache, idempotency, failure/recovery) | **VERIFIED LIVE** — Windows-native Redis, ports 3002/3003, same Postgres DB |
| Frontend build (`npm run build`) | **PRE-EXISTING FAILURE**, unrelated to this audit — not touched |

---

## Top-bar action tiles redesign (2026-07-18)

| Item | Status |
|------|--------|
| Theme / fingerprint / logout as uniform 36px gradient tiles, 10px radius | **DONE** — `themes.css` §1.6, scoped to `.topbar-controls` |
| Material Symbols glyphs (palette / fingerprint / logout), white, high contrast | **DONE** — `Topbar.tsx` (3 icon swaps) |
| Hover glow / active press / focus-visible; bio state variants preserved | **DONE** — `:not()` guards keep §1.5 disabled/error states |
| Tooltips, theme switch, passkey panel, logout flow | **PRESERVED** — 12/12 live checks |
| Profile card, clock, logo, header, left bar | **UNTOUCHED** — re-verified 44px cards |

---

## Top-bar right-side controls 3D refresh (2026-07-18)

| Item | Status |
|------|--------|
| User card / actions capsule / clock equal 44px, 3D gradient + shadows | **DONE** — scoped `[data-theme] .topbar-controls` in `themes.css` |
| Capsule buttons 36px, contained (was 48px bleeding out of 38px capsule) | **FIXED** — explicit min-height/min-width vs global touch floor |
| Hover lift / active press / focus-visible rings | **DONE** |
| Profile modal, theme switch, passkey panel, logout, live clock | **PRESERVED** — 8/8 functional checks |
| Desktop 1440 + tablet 1024: no overlap, no clipping, no x-scroll | **VERIFIED** |
| Logo, left bar, nav, sidebar | **UNTOUCHED** |

---

## Technician DWS Center Live Progress (2026-07-18)

| Item | Status |
|------|--------|
| Live `Completed / Total` progress counter centered in toolbar | **DONE** — `DigitalWiringFrame.tsx` |
| Immediately updates upon completing a cable | **DONE** — reactive on `status` prop changes |
| High-contrast bold/large typography (22px bold) | **DONE** — exact center, absolute positioned |
| Grouped zoom and Full Wiring View buttons on the left | **DONE** — grouped inside flex wrapper |
| Removed duplicate current-cable counter from right side | **DONE** — only status chip remains on right |

---

## Technician Single-Wire Action Buttons (2026-07-18)

| Item | Status |
|------|--------|
| Rename `Next / Complete Wire` to `SKIP` only | **DONE** — `WiringWorkstation.tsx` |
| Replace `Source End Open` and `Destination End Open` with one `OPEN END` button beside `SKIP` | **DONE** — `WiringWorkstation.tsx` |
| Mark current cable as Open End on backend and update reports | **DONE** — `WiringWorkstation.tsx`, `wiring-utils.ts`, `panel-completion-report.helper.ts` |

---

## Technician DWS Header Polish (2026-07-18)

| Item | Status |
|------|--------|
| Assignment Header displays live `Project Name — Panel Name` | **DONE** — `TechnicianDashboard.tsx` |
| Digital Wiring Schedule card removes duplicate project and panel names | **DONE** — keep only `DIGITAL WIRING SCHEDULE` label in `WiringWorkstation.tsx` |
| Generic "Panels" when no assignment | **PRESERVED** |

---

## Technician DWS 3D cable visual (2026-07-18)

| Item | Status |
|------|--------|
| 3D-style single-core cable in active row (CSS gradients, copper tips) | **DONE** — `dwf-cable3d` in `CableVisualPath.tsx` |
| Diameter ∝ WIRE SIZE, colour from WIRE COLOR (incl. bi-colour stripe) | **DONE** — verified 1.5→16px, 2.5→20px; GNYE stripe |
| `Colour · Size · Length` label 15px, exactly centred under cable at all lengths/zoom | **DONE** — Δ≤0.1px shortest(0.5m)/longest(7m), zoom 1–1.6 |
| Single-wire header checkbox+name centred per column | **DONE** — single-exec scope only; Full View left-aligned |
| Headers, data, hide/show persistence, zoom, workflow, APIs | **PRESERVED** — 14/14 + 7/7 + 6/6 live checks, build green |

---

## Technician DWS per-technician hidden columns (2026-07-18)

| Item | Status |
|------|--------|
| Hidden columns survive navigation / refresh / reopen / logout+login | **DONE** — `localStorage` `dwes_dwf_hidden_columns:<userId>` |
| Re-check restores column at original Excel position | **DONE** — ordered-filter render preserved |
| Per-technician isolation (other accounts unaffected) | **DONE** — key scoped to user id |
| Excel data, APIs, workflow, layout, zoom | **PRESERVED** — verified 10/10 live checks (ENOWA =H00+R, 400 cables) |

---

## Technician DWS active-row zoom (2026-07-18)

| Item | Status |
|------|--------|
| Larger default Cable Visual (path/labels/terminals/stroke) | **DONE** — `dwf-cable-visual-mini--active` |
| Zoom In / Zoom Out in white exec toolbar above dark header | **DONE** — compact 28×24 dark buttons |
| Whole active row scales (cells, fonts, spacing, visual) | **DONE** — `--dwf-cv-zoom` on row, 0.7–1.6 ×0.15 |
| Header, headings, column order, workflows untouched | **PRESERVED** — verified 20/20 live checks |

---
## Technician Panels heading (2026-07-18)

| Item | Status |
|------|--------|
| Live `Project Name — Panel Name` beside/in Panels section heading | **DONE** — `TechnicianDashboard` + `SectionHeader` |
| Generic "Panels" when no assignment/selection | **DONE** |
| Immediate update on panel switch / assignment refresh | **DONE** — driven by `selectedLive` |
| Nav tab label remains "Panels" | **PRESERVED** |

---

## Cable Visual Excel-driven illustration (2026-07-18)

| Item | Status |
|------|--------|
| Illustration from selected row `WIRE COLOR` / `WIRE SIZE` / `LENGTH(m)` | **DONE** — `resolveCableVisualData` |
| Auto update after supervisor re-upload | **DONE** — tech DWS + supervisor preview reload |
| Mid-row Cable Visual (IEC_FERR_A → visual → IEC_FERR_B) | **DONE** — tech DWS + supervisor preview |
| Parse empty ENOWA column as `Cable Visual` | **DONE** — `excel-headers.ts` |
| UI fallback for older frames without empty col | **DONE** — `ensureCableVisualInHeaders` |

---

## Technician dashboard 2D Operational Twin (2026-07-18)

| Item | Status |
|------|--------|
| 2D OT button on technician Panels dashboard | **REMOVED** from `PanelsTab` |
| Underlying OT / CableDigitalTwinModal code | **PRESERVED** (not deleted) |
| Digital Wiring Schedule entry | **UNCHANGED** |
| Supervisor twin / OT APIs | **UNCHANGED** |

---

## Dashboard 3D icons (2026-07-18)

| Item | Status |
|------|--------|
| 3dicons.co V1 Color/Dynamic WebP pack (CC0) | **DONE** — `src/assets/dashboard-icons/` |
| `DashboardIcon` + unique-per-function registry | **DONE** |
| Role dashboards + sidebar + topbar | **DONE** |
| Workflow forms / wiring / modals keep Material icons | **PRESERVED** |
| `npm run icons:validate-dashboard` | **DONE** |

---

## Supervisor Engineering → 3D Operational Twin (2026-07-17)

| Item | Status |
|------|--------|
| Engineering button → Package + Convert tabs | **DONE** — `EngineeringWorkspaceModal` from Projects tab |
| Flat 2D GA layout messaging (not cover / not schematic package) | **DONE** |
| Embed GA enrollment (sources, faces, mapping, release) | **DONE** — `GaFoundationWorkspace` embedded; nav tab stays hidden |
| Preview OT3D before release | **DONE** — real `operational-twin-3d` API + Twin Not Ready honesty |
| Supervisor Approve & release | **DONE** — `gaApi.release` |
| Auto PDF→device extraction (Phase 3) | **NOT READY** — enrollment is manual/semi-manual |
| H00+R Exact GA demo data enrolled | **NEEDS LIVE DATA** — real front/rear GA sheets + mapping |

---

## Technician Digital Wiring Schedule (2026-07-18)

| Item | Status |
|------|--------|
| Header: project + panel + type + Start/Pause + Tablet View | **DONE** |
| KPI / timer / OT removed from DWS page | **DONE** |
| Single active cable + supervisor Excel columns | **DONE** |
| Modern single-conductor cable illustration | **DONE** |
| Previous · Source End Open · Destination End Open · Next/Complete Wire | **DONE** |
| Open-end complete + `openEnd` JSON + audit (no schema migrate) | **DONE** |
| Pause / Mid Change preserved | **DONE** |

## Technician dashboard actions (2026-07-17)

| Item | Status |
|------|--------|
| Digital Wiring Schedule (dashboard button) | **PRESENT** |
| 2D Operational Twin (dashboard button) | **REMOVED** from technician dashboard (components preserved) |
| Approved Drawing (dashboard button) | **REMOVED** — classic GA/PDF viewer no longer opened from tech dashboard; supervisor + twin paths unchanged |

---

## Enterprise Twin redefinition (2026-07-17) — Monday Director demo track

| Item | Status |
|------|--------|
| 2D Operational Twin | **COMPLETE** — production fallback preserved |
| 3D Operational Twin renderer + GA release gate | **PARTIAL** — implemented; needs GA-released panel + tablet FPS |
| Supervisor GA Foundation reachable | **DONE** — Engineering → Convert tab embeds `GaFoundationWorkspace`; GA Foundation nav tab stays hidden |
| Release readiness checklist | **DONE** — blocks release while Finalization Queue unresolved |
| Feature flags (OT3D + tablet quality) | **DONE** — local `.env.local` UTF-8; default off in repo example |
| Per-cable `technicianId` / `my_wires` | **DONE** — write path + modal/schedule preserve; legacy rows soft-gap |
| Combined Engineering Package upload | **DONE** — Package + Convert/Preview/Approve in Engineering; no auto GA extraction |
| Auto dimension/device extraction | **NOT STARTED** (Phase 3) |
| ClamAV quarantine | **NOT STARTED** (Phase 6) |
| Xiaomi Pad 7 Pro FPS | **NOT MEASURED** |
| Director demo verdict | **NOT READY** — needs released real panel + Phase 3 lite + authenticated E2E |

---

## Centralized permanent-delete (2026-07-17)

| Item | Status |
|------|--------|
| Shared project purge | **DONE** — `permanentlyDeleteProject` in `project-delete.util.ts` |
| Shared panel purge | **DONE** — `permanentlyDeletePanel` (twin/GA/QA/files + tombstone) |
| Supervisor + System Admin roles | **DONE** — project DELETE + panel delete routes |
| SSE deleted action for POST guarded/hard-delete | **DONE** — `EventsInterceptor` |
| Confirmation scope copy | **DONE** — project constants + `DeletePanelConfirmModal` |
| Schema migrate/push | **NOT USED** — WiringSchemeDB read-only |

---

## Technician assignment isolation (2026-07-17)

| Item | Status |
|------|--------|
| API guard — engineering twin + GA correlation (technician only) | **DONE** — `technician-panel-access.helper.ts` |
| SSE per-event assignment filter (no stale cache) | **DONE** — `events.controller.ts` |
| UI **NO PANEL WORK ASSIGNED** empty state | **DONE** — `PanelsTab`, `WiringTab` |
| Assignment SSE refresh + modal revoke | **DONE** — `TechnicianDashboard`, `AppShell`, `PanelGaDrawingModal` |

---

| Item | Status |
|------|--------|
| Backend orphan filter (`myPanels`, `myAssignmentDetail`) | **DONE** — inactive project + `FrameStore.isBlocked` |
| Clear stale selection / wiring / twin on SSE delete | **DONE** — `TechnicianDashboard`, `PanelsTab`, `WiringWorkstation` |
| Stop wiring schedule loading loop on 404 | **DONE** — abort + exit workstation |
| Shared delete matcher | **DONE** — `assignmentMatchesDeletion` in `entityConsistency.ts` |

---

| Item | Status |
|------|--------|
| User-facing label rename | **DONE** — Project Information / Edit modal / director export headers |
| Edit modal read-only state | **DONE** — badge display; no select / setState on save |
| Automatic state derivation | **PRESERVED** — values, permissions, routing unchanged |
| Status Workspace nav / PROJECT_STATUS.md | **PRESERVED** — left as-is |

---

## Drawing toolbar upload modal (2026-07-17)

| Item | Status |
|------|--------|
| Toolbar Drawing → upload popup | **DONE** — `PanelDrawingUploadModal` slot `2d` for active project/panel |
| Guard when no selection | **DONE** — toast message; Drawing View unchanged |

---

## Shared action status popups (2026-07-17)

| Item | Status |
|------|--------|
| Shared ActionStatusPanel | **DONE** — status, entity, summary, progress, removal list |
| AppDialogProvider upgrade | **DONE** — all `dialog.confirm` / alert / prompt use panel |
| Delete Permanently labels | **DONE** — DeleteConfirmModal, panel/user delete, hard reset |
| window.confirm removal | **DONE** — SmartAssignmentCenter, DbConfigTab |

---

## Status Workspace two-view redesign (2026-07-17)

| Item | Status |
|------|--------|
| All Projects view (KPI + expandable rows) | **DONE** — `CompactStatusWorkspace.tsx` |
| Selected Panel view (activity + Panel Report) | **DONE** — preserved Technician Activity + Reports & Review |
| Live data / SSE refresh | **PRESERVED** — projects + frames + `allPanels` + workflow events |
| Permissions / report rules | **PRESERVED** — `panelReportAvailable`, review/submit unchanged |

---

## Panel Report consolidation (2026-07-17)

| Item | Status |
|------|--------|
| Remove Project Executive Report (Status workspace) | **DONE** — `CompactStatusWorkspace.tsx`; no project-level report card |
| Standardize name **Panel Report** | **DONE** — UI cards, preview modal, PDF/Excel title (`PANEL_REPORT_TITLE`) |
| Per-panel reports (multi-panel projects) | **PRESERVED** — selected panel row + other-panel list unchanged |
| Backend project `report-pdf` API | **PRESERVED** — `ProjectPdfPreviewModal` unwired from live UI only |

---

## Topbar login-theme colour alignment (2026-07-17)

| Item | Status |
|------|--------|
| Login hero stop tokens | **DONE** — `--t-login-hero-stop-1/2/3` on default, arctic, harbor, graphite, ingenious |
| Derived topbar chrome | **DONE** — `--t-header-bar`, `--t-header-bar-border`, `--t-header-bar-shadow`, `--t-header-bar-accent` |
| Topbar wiring | **DONE** — `[data-theme] .topbar` + design-system fallbacks use header-bar tokens |
| Layout / routing / permissions | **Unchanged** |
| Aurora role theme | **Preserved** — `aurora.css` still overrides topbar for scoped roles |
| `npm run build` | **Exit 0** |

---

## Controlled project data reset (2026-07-17)

| Item | Status |
|------|--------|
| Pre-operation backup | **DONE** — `Backup/2026-07-17_14-51` |
| pg_dump + uploads archive | **DONE** — `backend/uploads/backups/PROJECT_RESET_2026-07-17T10-53-39` |
| Project DB + file purge | **DONE** — 1 project, 493 session_log, 1 file_hash, 2 upload folders |
| Users preserved | **41 users** unchanged |
| Post-reset counts | **0** on all project-scoped tables |
| Smoke test (create/delete) | **PASS** — `RESET-SMOKE-TEST` |
| Deletion cascade fix | **DONE** — engineering/GA/Twin tables in `project-delete.util.ts` |
| Backend tests | **PASS** — 137/137 |

---

## Live 3D Twin Phase 1 — GA Foundation (2026-07-17)

| Item | Status |
|------|--------|
| GA source upload (PDF/DWG/DXF) | **DONE** — panel-scoped via `UploadService` + `ga-foundation` |
| PDF page / crop / face images | **DONE** — PDF.js in `GaFoundationWorkspace` |
| Canonical GA Asset Set | **DONE** — `ga_asset_sets`, `ga_faces` (Prisma) |
| Mapping Catalog (server) | **DONE** — `panel_models` / device / terminal geometries |
| Schedule correlation + finalization | **DONE** — `ga_correlation_results`, exception queue |
| Release gate (wiring start) | **DONE** — `TechService` + `assertPanelReleased` |
| Background jobs + LibreDWG provider | **DONE** — `background_jobs`, external-process only |
| Migration SQL | **ADDITIVE** — `20260717121500_live_3d_twin_phase1` |
| Backend tests | **PASS** — 127/127 (includes 10 ga-foundation tests) |
| Frontend build | **PASS** — `npm run build` exit 0 |
| Phase 2 (3D viewer / live wire paint) | **DONE** — `OperationalTwin3D` + `VITE_ENABLE_OPERATIONAL_TWIN_3D` |
| Report | `docs/LIVE-3D-TWIN-PHASE-1-REPORT.md` |

---

## Live 3D Twin — Project completion (2026-07-17)

| Item | Status |
|------|--------|
| Master handoff report | **DONE** — `docs/DWES-LIVE-3D-TWIN-PROJECT-COMPLETION-REPORT.md` |
| Panel completion report guide | **DONE** — `docs/DWES-PANEL-COMPLETION-REPORT-GUIDE.md` |
| Automated verification (re-run) | **PASS** — typecheck/build/lint exit 0; **192/192** tests |
| Release decision | **READY FOR CONTROLLED PILOT** |
| Open pilot items | Authenticated E2E (DEF-003), tablet FPS (DEF-004), backup drill |

---

| Item | Status |
|------|--------|
| Window title | **DONE** — `DWES — Digital Wiring Execution System \| Ingenious Network FZC` |
| Native controls | **Preserved** — Windows/browser owns minimize, maximize, close |
| Title-strip colour | **DONE** — manifest/meta navy `#1B2958` |
| Small-size app icon | **DONE** — navy tile + white inset + canonical Ingenious mark |
| Icon assets | **Regenerated** — PWA PNGs, favicon `.ico`, Windows shortcut `.ico`, Apple icon |
| Tests | **PASS** — PWA install test 3/3; frontend build exit 0 |

---

## Ingenious Network primary theme (2026-07-17)

| Item | Status |
|------|--------|
| Primary theme | **Ingenious Network** (`ingenious`) — loads on first visit + one-time migration |
| Switcher (login + topbar) | **Default** + **Ingenious Network** only |
| Light surfaces | Sidebar, canvas, cards, tables, panels (`#E8ECF0` / `#FFFFFF`) |
| Dark chrome | Topbar navy gradient, workspace section headers, key action controls |
| Stale session fix | Inline `index.html` bootstrap + `dwes-primary-ingenious-20260717` migration |
| Hidden themes | Arctic, Harbor, Graphite — CSS retained, not in switcher |
| `npm run build` | **Exit 0** |

---

## Light sidebar + topbar breathing room (2026-07-17)

| Item | Status |
|------|--------|
| Sidebar light surface (light mode) | **DONE** — white→slate gradient, slate text, subtle border, brand-blue active pill |
| Sidebar dark mode | **Unchanged** — Default/Arctic base dark navy chrome preserved |
| Sidebar tokens | **DONE** — new `--t-sidebar-toggle-bg`, `--t-sidebar-active-text`; hardcoded values tokenized |
| Topbar height/spacing | **DONE** — `--topbar-control-h` 44/46 → 46/48px; padding bumped; `--dash-topbar-height` fallback updated |
| Topbar branding/controls | **Preserved** — DWES / Ingenious Network FZC, profile pill, utility icons, clock/date |
| Topbar light/dark support | **DONE** — stays dark navy brand chrome in both modes (works in light + dark) |
| Shared dashboard header | **Already unified** — `DashboardShell` → `PageHeading` → `DashboardPageHeader` for all 5 roles |
| Sales Director | **Excluded** — not a supported DWES role |
| Themes | **Five in switcher:** Default, Arctic, Harbor, Graphite, Ingenious Network (`ingenious`) |
| `npm run build` | **Exit 0** |
| Concurrent worker (ProjectsTab) | **Skipped** — not touched |

---

## Themes (2026-07-17 — Ingenious Network primary)

| Theme | Role | Notes |
|-------|------|--------|
| **Ingenious Network** | **Primary** — default load | Logo navy `#1B2958`, teal `#2E9DAA`, white, light grey `#E8ECF0`; light content + dark chrome |
| **Default** | Alternate (switcher) | Modern high-contrast brand-blue baseline |
| Arctic / Harbor / Graphite | Hidden | Palettes in CSS; not in login/topbar switcher |

**Theme id (primary):** `ingenious` · **Display name:** Ingenious Network

**How to switch:** Login theme button **or** top-bar Palette — **Default** and **Ingenious Network** only. Preference: `localStorage` `dwes-app-theme`. Retired ids (arctic/harbor/graphite) → ingenious.

**Hard refresh once:** `Ctrl+Shift+R` if old dark UI persists (service worker / cached CSS).

**Backup archive:** `src/styles/theme-backup-harbor-graphite.css`

---

## Supervisor Project Information (2026-07-17)

| Item | Status |
|------|--------|
| Duplicate Re-upload in Project Information | **Removed** — upload/re-upload stays on Projects header Wiring Upload + FramesTab modal |
| Essential actions on card | Add Panel · Digital Wiring View · Drawing View · Edit |
| Layout groups | Project Summary · Selected Panel · Assigned Technician · Wiring Progress / status |
| AppShell / sidebar | **Unchanged** |

---

## Login brand panel (2026-07-17)

| Item | Status |
|------|--------|
| Left brand stage — flat / in-panel (no floating glass card) | **DONE** — vignette softened; glass sheet/rim/card removed |
| Brand copy preserved | INGENIOUS NETWORK FZC · DWES · tagline · progress + schedules features · enterprise badge · version |
| QC feature bullet on Login | **Removed** (LoginPage only; app QA/QC unchanged) |
| Auth / WebAuthn | **Unchanged** |

---

## Dashboard page header (2026-07-17)

| Item | Status |
|------|--------|
| Shared `DashboardPageHeader` via `DashboardShell` → `PageHeading` | **DONE** — Supervisor, Technician, QA/QC, Operations Director, System Administrator |
| Sales Director | **Excluded** — not a supported DWES role |
| Role-specific hero CSS (`--technician`, `admin-dashboard-hero`) | **Neutralized** — same look for all roles |
| Theme tokens for title/subtitle | **DONE** — light/dark via CSS variables |

---

## Director / sidebar (2026-07-17)

| Item | Status |
|------|--------|
| Director Workspace sidebar (`Live Status`) | **DONE** — same AppShell pattern as other roles |
| Pin sidebar (all dashboards) | **DONE** — pin in Workspace head; persists `sidebarPinned` |

---

## Technician Operational Twin (2026-07-16)

| Item | Status |
|------|--------|
| Layout source | **Approved panel PDF** (primary) via `panelDrawing` / slot `2d` |
| Cable path | Schedule **colour code** + **length-aware** SVG overlay |
| Fake Excel schematic as twin | **Hidden** when PDF present; honest awaiting state otherwise |
| Engineering / Flat 3D | Behind `VITE_ENABLE_PANEL_3D` (off) — not fabricated |
| **3D Operational Twin (OT3D)** | **Not inside Digital Wiring Schedule** (removed 2026-07-18). Remains under dashboard **2D Operational Twin** / Cable Digital Twin when flag on + GA released. |
| DWG (TYPE-01) | Secondary reference only — **not** parsed yet |
| Wiring actions / Skip / Mid Change / KPI / RBAC | **Preserved** |

---

## Themes (important)

| Theme | Role | Notes |
|-------|------|--------|
| **Default** | **Production baseline** — loads for everyone unless changed | Modern high-contrast solid brand-blue chrome (2026-07-17 refresh) |
| Arctic | Optional | Liquid glass slate/navy + cyan |
| Harbor | Optional | Steel glass + teal (restored 2026-07-17) |
| Graphite | Optional | Charcoal glass + brand blue (restored 2026-07-17) |
| Ingenious Network | Optional | Logo brand navy/teal/white/grey (`ingenious`) — **NEW 2026-07-17** |

**How to switch:** Login page theme button (top-right of form) **or** AppShell top-bar Palette icon. Preference: `localStorage` key `dwes-app-theme`. Unknown ids → **Default**.

**Open on Default (2026-07-16):** one-time reset via `dwes-theme-reset-default-20260716` clears overnight Arctic and loads **Default**; after that, user palette picks persist.

**2026-07-17:** Five themes in switcher (Default, Arctic, Harbor, Graphite, Ingenious Network). Login left brand panel flattened (no floating glass; QC bullet removed from Login only).

---

## Morning report — overnight session (2026-07-16)

### UI — login + icon rail + themes

| Item | Status |
|------|--------|
| **Default** = original DWES (solid chrome, high contrast) | **DONE** |
| Optional Arctic / Harbor / Graphite | **DONE** |
| Switcher lists Default first (login + top bar) | **DONE** |
| Login instant (liquid entrance / delay removed) | **DONE** |
| Icon-rail / collapsed labels under icons (all roles) | **DONE** |
| AppShell contrast (icons/borders/bg) | **DONE** |
| How to switch | Login palette · top-bar Palette · `dwes-app-theme` |

### Live E2E (persisted in WiringSchemeDB)

| Item | Detail |
|------|--------|
| Project | `ENOWA_DEMO_202607161747` — ENOWA Mobile Substation - Overnight Demo |
| Panel | `=H00+R` — 400 cables → **tech24** (assignment 89) |
| Twin | SCHEMATIC SRC→DST e.g. `74R1:4 → 86B2:B6` |
| Wiring | Start → Complete×3 → Skip → Pause → Resume |
| Submit→Director | **SKIP** — panel not fully completed |
| Users | supervisor1, tech24, ops_director1 (demo passwords local-only) |
| Walkthrough | `docs/DIRECTOR-WALKTHROUGH.md` |

### Coverage matrix

| Path | Result |
|------|--------|
| ENOWA E2E create/assign/wire/twin | **PASS** |
| Submit to director | **SKIP** (needs completed panel) |
| Director live status simplify | **PASS** |
| Default + optional themes + contrast | **PASS** |
| Login instant (no liquid delay) | **PASS** |
| Icon-rail labels (collapse / tablet) | **PASS** |
| Cloud | **SKIP** (tomorrow) |

---

## Git / restore points

| Item | State |
|------|--------|
| Repository | Branch `main` (baseline commit `294cc2e`; **no `origin` remote configured yet**) |
| OCI deploy | **BLOCKED** — zero cloud resources created this session. Real hosting requires the user to reply exactly **approve OCI hosting** (plus tenancy access / credentials). Infra scripts under `infra/oci/` remain planning-only until then. |
| OCI security readiness (local/repo) | **Documented 2026-07-16** — see Production security checklist below |
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
| Dashboard — single Current Assignment card (no My Assigned Panels list) | **DONE** |
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
| My Assigned Panels — modern cards + animated progress border | **REMOVED** (superseded by single Current Assignment card) |
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
| **Supervisor** — Excel Wiring Upload inline column checkboxes + column filters | **DONE** (search/filter removed 2026-07-17; Select All + column checkboxes only) |
| **Supervisor** — Excel Wiring Upload full-view expand overlay for worksheet review | **DONE** |
| **Supervisor** — Excel Wiring Upload full-view Excel-like grid (sticky headers, frozen # col, column resize) | **DONE** |
| **Supervisor** — Excel Wiring Upload full-view rendering fix (single-modal swap, flex scroll chain) | **DONE** (2026-07-08) |
| **Supervisor** — Excel Wiring Upload all-rows parse (Full View + import; S.NO 1 retained) | **DONE** (2026-07-08; readHeaders rows restored 2026-07-17) |
| **Supervisor** — Excel Wiring Upload direct Upload (no Validate & Preview) + TOTAL CABLES header | **DONE** (2026-07-17) |
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

## Production security checklist (local/repo readiness — 2026-07-16)

Verified in code (no VM / production `.env` modified this session):

| Check | Status | Evidence |
|-------|--------|----------|
| Missing `JWT_SECRET` fails startup | **PASS** | `backend/src/auth/auth.module.ts` `validateJwtSecret`; `main.ts` production assert |
| Weak/default JWT secrets rejected | **PASS** | Known-default set in `auth.module.ts` (≥32 chars required) |
| `DEMO_MODE` gates demo endpoints | **PASS** | `demo-mode.util.ts` `assertDemoMode` → 404; login-hints / device preview |
| Production must set `DEMO_MODE=false` | **DOCUMENTED** | `docs/hosting/DEPLOYMENT_RUNBOOK.md`; open flag #4 seed passwords |
| CORS allowlist | **DOCUMENTED** | Set `CORS_ORIGINS` to final HTTPS origin(s) before go-live |
| WebAuthn domain | **DOCUMENTED** | `RP_ID` / `RP_ORIGIN` must match production HTTPS domain (`dwes.ingenious-network.com` when approved) |
| Secrets not committed | **POLICY** | Never commit `.env` / Vault material; rotate if ever shared |

**Hosting gate:** Reply exactly **approve OCI hosting** (with tenancy access) before any OCI create / DNS / Vault fetch / production deploy.

**Load readiness:** `npm run load:tech70` (k6 ≥70 technician-like VUs) — localhost / staging only. See `docs/LOAD-TEST.md`.

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
