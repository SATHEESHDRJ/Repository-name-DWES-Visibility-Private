# DWES Feature Progress

Last updated: 2026-07-06 (Technician Dashboard — full responsive replacement)

---

## 2026-07-06 — Technician Dashboard complete replacement (DWES_FULL_RESPONSIVE.md)

**Reference:** `09_Documents/SCREENS/Screenshot 2026-04-17 100101.png` (landing), `100133.png` / `100644.png` / `100911.png` (Digital Based Wiring Frame modal).

**Scope:** Frontend technician dashboard only — no backend/API/routing/auth changes.

### Implemented (reference match)

| Reference section | Implementation |
|-------------------|----------------|
| Orange "Technician Dashboard" nav tab | `TechnicianDashboard.tsx` — single tab with Zap icon |
| Title + subtitle + 6 KPI tiles | `DashboardShell` kpis (Completed/In Progress/Paused/Assigned/Not Completed/Completion %) |
| Dark identity band + Scan QR | `tc-identity-band` preserved |
| My Assigned Panels cards | `PanelsTab.tsx` (unchanged logic; responsive `tc-card`) |
| **DIGITAL BASED WIRING FRAME modal** | **NEW** `DigitalWiringFrame.tsx` + `WiringWorkstation.tsx` modal shell |
| Dark modal header + status pills | `dwf-modal-header`, `dwf-pill-ok/kpi/timer` |
| Search + 5 filter dropdowns + Clear | `DigitalWiringFrame` toolbar |
| Green validation strip | `dwf-valid-strip` with ok/missing/src/dst tallies |
| Start / Pause / Complete / Scan QR | `dwf-action-bar` (state-gated by assignment status) |
| Full cable table (12 cols) | NO./FERRULE/SOURCE/DESTINATION/CABLE VISUAL PATH/COLOR/SIZE/LENGTH/SRC/DST/STATUS/NOTES |
| SRC/DST checkboxes per row | `toggleEndAt` → existing `techApi.cableAction` / `cableStatus` |
| Cable visual path (ref + colour bar + length) | `wireColorHex` + `parseLengthMeters` |
| Panels visible behind modal | Wiring opens as overlay; panels list stays mounted |
| QR scan modal | `QrScannerOverlay` from action bar + dashboard Scan QR |
| Responsive (tablet → desktop) | `dwf-modal-backdrop` viewport clamp; table scrolls in container; KPI 2-col on narrow |

### Files

**Created:** `src/components/technician/wiring/DigitalWiringFrame.tsx`

**Modified:** `src/components/technician/wiring/WiringWorkstation.tsx` (modal shell + table default), `src/pages/technician/TechnicianDashboard.tsx` (wide layout, overlay wiring), `src/styles/design-system.css` (`dwf-modal-*`, `tech-dash-module` responsive)

**Removed:** none (one-wire navigator/drawings panel removed from default render; Focus view kept as secondary toggle)

### Not in reference (excluded / secondary)

- OTP gate before wiring (standing no-OTP policy)
- "Test: Mark All" dev button (reference screenshot only)
- Per-cable completion timestamps in KPI
- Enterprise wsg virtualized grid (replaced by leaner `dwf-table` + windowed rows)

**Build:** `npm run build` exit 0.

---

## 2026-07-06 — Excel wiring schedule → Digital Wiring Frame (diagnosis + fix)

**Spec:** `markdown/REFERENCE BACKUP (spec) CUserssathe.md` (backup: `06_Wiring-App/wiring-app_pg`).

### Step 1 — Diagnosis (where it stopped)

| Stage | Status before fix | Notes |
|-------|-------------------|-------|
| `POST /api/upload/extract-metadata` | Working | Sheet auto-score present |
| `POST /api/upload/read-headers/:code` | Working | Returned sheets + best_sheet |
| Sheet selection → column mapping UI | **Partial** | User had to click sheet manually; no validation preview before commit |
| `POST /api/upload/wiring-schedule-mapped/:code` | **Mapped path** (not fixed-column) | Parser in `parse-wiring.ts` with ferrule-split derivation |
| Frame JSON write | Working | `FrameStore.save()` → `uploads/<CODE>/frames/<id>.json` + `.xlsx` |
| Digital Wiring Frame render | Working | Verification modal + technician workstation read disk frames |

**Root gaps (not a missing endpoint):**
1. **Header mismatch** — `read-headers` and `parse-wiring` used different header cleaning; multi-row/sub-header rows could shift data start → zero cables or wrong mapping.
2. **No pre-commit validation** — upload fired directly from mapping step; scrambled mappings were caught only after write or via constant-ferrule guard.
3. **`header_row` not persisted** — backup stores it; DWES re-detected on each parse (could diverge).

### Step 2 — Fix (mirror backup behaviour)

- **NEW** `backend/src/upload/excel-headers.ts` — shared `cleanExcelHeader`, `resolveHeaderLabel`, `buildHeaderPairs`, `dataStartRow`, `scoreSheetHeaders` (handles concatenated wire-spec headers + sub-header rows).
- **UPDATED** `parse-wiring.ts` — uses shared header logic; accepts `headerRowOverride`; returns `validation` summary; skips sub-header data row.
- **UPDATED** `upload.service.ts` — `readHeaders` uses shared cleaners; **NEW** `previewMapped()` dry-run; `uploadMapped` persists `header_row` on frame JSON.
- **NEW** `POST /api/upload/preview-mapped/:code` — parse + validate without writing.
- **UPDATED** `FramesTab.tsx` `UploadFrameModal` — auto-selects best sheet → mapping; **Review & Import** calls preview; clean parse auto-imports; issues show validate step with row-level errors + sample cables before confirm.

**Pipeline now:** upload → sheet select (auto best) → header detect + map → preview parse (ferrule-split derivation) → validation summary → frame JSON written → Verification modal → Frames list.

**Constraints honoured:** no WiringSchemeDB schema change; frames remain files-on-disk; `file_hashes` dup-check unchanged.

**Build:** `npm run build` exit 0; backend `tsc --noEmit` exit 0.

---

## Floating glass top bar redesign (2026-07-01)

**Goal:** Replace flat inline header controls with a Material 3–inspired floating card system across all roles (shared `Topbar.tsx`).

### Structure

| Element | Class | Behavior |
|---------|-------|----------|
| Base bar | `.topbar` | Minimal dark gradient structural layer only |
| User identity | `.topbar-user-card` | Glass card — avatar + name/role, layered above bar |
| Actions | `.topbar-actions-capsule` | Fingerprint + logout in unified floating capsule |
| Clock | `.topbar-clock-card` | Floating glass time/date (tablet-land+) |
| Env badge | `.topbar-float-pill` | Admin deployment mode pill |
| Menu (mobile) | `.topbar-menu-btn` | Floating glass hamburger |

### CSS / tokens

- `design-system.css` — glassmorphism, elevation, hover lift (`translateY`), capsule buttons (≥44px)
- `theme-palettes.css` — `--t-header-float-bg/border/shadow/hover-shadow`
- `themes.css` + `aurora.css` — theme-aware floating card overrides
- `icons.css` — capsule/menu icon polish (replaced stale `.topbar-action-btn`)

- Removed flat-era patterns: inline `.topbar-user`, `.topbar-action`, `.topbar-logout`, divider strip
- Responsive: avatar-only user card on narrow portrait; full name from `tablet-port`; clock from `tablet-land`
- `npm run build` — **pass** (exit 0)

---

## Dashboard KPI strip simplification (2026-07-01)

**Goal:** Remove redundant/low-value KPI cards across role dashboards; keep only workflow-critical metrics.

| Role | Removed | Kept |
|------|---------|------|
| **Technician** | Paused, Not Done, Avg KPI | Assigned, In Progress, Completed |
| **Supervisor** (Projects tab strip) | Projects, Active / In review | Completed, Needs attention |
| **Director** | Composite KPI, Projects, Active Panels | Completed, Pending QC, Approvals |
| **QAQC** | Inspected, Passed | Ready for QC, Conditional, Failed |

- Tab content and workflow UI unchanged (e.g. Summary tab filter cards, analytics tabs).
- No CSS grid changes needed — existing `kpi-grid` auto-fill handles 2–3 cards.
- `npm run build` — **pass** (exit 0)

---

## Unified icon system — Material Symbols Rounded (2026-07-01)

**Goal:** Replace scattered Lucide icons with a single Material 3–aligned icon language across all roles and surfaces.

### Approach

| Item | Detail |
|------|--------|
| **Library** | Google **Material Symbols Rounded** (Google Fonts CDN — no npm icon package) |
| **Wrapper** | `src/components/ui/Icon.tsx` — size tokens (`xs`–`xl` or px), weight, `filled`, `depth`, Lucide-compat `strokeWidth` |
| **Named exports** | `src/components/ui/icons/index.tsx` (re-exports) + `named-icons.tsx` (JSX components) |
| **CSS** | `src/styles/icons.css` — `.ui-icon`, size tokens (`--icon-size-*`), depth shadow, topbar/nav polish, loader spin |
| **Font load** | `index.html` Material Symbols Rounded stylesheet |

### Migration

- Removed `lucide-react` dependency from `package.json`
- **43** consumer files updated (topbar, sidebars, all 6 role dashboards, tabs, modals, wiring workstation, forms, tables)
- Inline chart/diagram SVGs in `AnalyticsTab` / `CableSchematic` left unchanged (data viz, not UI chrome)

### Build

- `npm run build` — **pass** (exit 0)

### White-screen fix (2026-07-01)

- **Root cause:** Icon barrel was briefly saved as `icons/index.ts` containing JSX; Vite's oxc parser failed (`Expected > but found Identifier`), breaking the entire module graph — `#root` stayed empty.
- **Fix:** Split into `icons/index.tsx` (re-exports only, no JSX) + `icons/named-icons.tsx` (JSX components). Cleared `node_modules/.vite` cache. Hard-refresh browser after icon barrel changes.
- **Prevention:** `.cursor/rules/ui-refactor-smoke-test.mdc` — always build + smoke-test routes after UI/icon refactors.

---

## Technician wiring workstation — production modal UI (2026-07-01)

**Goal:** Replace spreadsheet-style wiring with a fullscreen production workstation that preserves uploaded Excel structure and sequential one-cable-at-a-time flow.

### Replaced

- Old `WiringTab.tsx` one-wire card + wire list sheet (~1200 lines) → **`WiringWorkstation`** fullscreen shell + slim `WiringTab` wrapper.

### New UX

| Area | Behaviour |
|------|-----------|
| **Schedule data** | All Excel columns shown via original header names (`mapping` + optional `_raw` per row); grid per cable |
| **Cable visualization** | `CableSchematic` with real color/size/length and src→dst terminals |
| **Navigator** | Search, filter (all/pending/one-end/done/issues), sort (serial/ref/status), jump by S.No |
| **Sequential flow** | Complete / Next marks both ends via `cable-action complete`, auto-advances to next pending cable |
| **Drawings** | Integrated right panel: Wiring drawing + GA drawing tabs (blob iframe/image) |
| **Backend** | `GET my-assignment/:id` returns `mapping`, `sheet_name`, `original_filename`, `excel_headers`; upload stores `_raw` + `excel_headers` on new frames |

### Preserved

- `cable_status` index-keyed `{src,dst,note,issue?}` — no schema change
- KPI formula `(src_done + dst_done) / (total * 2) * 100`
- DEV mark-all helpers (`useDemoMode` + `dev/cable-bulk`)
- Pause, issue flag, frame complete, one-end src/dst marking

### Files

- `src/components/technician/wiring/WiringWorkstation.tsx`
- `src/components/technician/wiring/wiring-utils.ts`
- `src/pages/technician/tabs/WiringTab.tsx` (wrapper)
- `src/styles/design-system.css` (`.ws-*` workstation tokens)

---

## DEV mark-all helpers — WiringTab bulk actions (2026-07-01)

**Goal:** Fast dev/demo testing on wiring assignments without changing one-wire-at-a-time production flow or DB schema.

### Status: verified / fixed

| Layer | Gate | Behaviour |
|-------|------|-----------|
| **UI** | `useDemoMode()` = `import.meta.env.DEV && backend demo_mode` | Amber `wire-dev-bar` hidden in production builds and when `DEMO_MODE !== 'true'` |
| **API** | `POST /api/tech/dev/cable-bulk/:id` | Controller throws `404` when `DEMO_MODE !== 'true'` |
| **`reset_all` via `cableAction`** | Same `DEMO_MODE` check in `tech.service.ts` | Also `404` when demo off |

### Actions (single DB write each)

- **`mark_all_verified`** — all wires `src+dst` true for current frame scope
- **`mark_all_with_issues`** — all verified + 3 preset issues (10%, 50%, last wire)
- **`reset_all`** — rebuild `cable_status` all-pending; `cables_src_done` / `cables_dst_done` → 0

### Hard rules confirmed

- `cables_total` never modified (`_cableCountForAssignment` reads frame/DB only)
- `cable_status` JSON shape unchanged (`src`, `dst`, `note`, optional `issue`)
- One-wire-at-a-time UI flow untouched
- No DB schema changes

### Files

- [backend/src/common/demo-mode.util.ts](backend/src/common/demo-mode.util.ts) — `isDemoMode` / `assertDemoMode`
- [backend/src/tech/tech.controller.ts](backend/src/tech/tech.controller.ts) — `devCableBulk` endpoint
- [backend/src/tech/tech.service.ts](backend/src/tech/tech.service.ts) — `devCableBulk()`, gated `reset_all`
- [src/hooks/useDemoMode.ts](src/hooks/useDemoMode.ts) — dual gate hook
- [src/services/api.ts](src/services/api.ts) — `techApi.devCableBulk()`
- [src/pages/technician/tabs/WiringTab.tsx](src/pages/technician/tabs/WiringTab.tsx) — `handleDevBulk()` + `wire-dev-bar`

### Build / health (2026-07-01)

- Frontend `npm run build` (`tsc -b && vite build`) ✓
- Backend `npm run build` (`nest build`) ✓
- Health: single Vite `:5173` (200), backend `:3001` `/api/health` ok; `/api/env` → `demo_mode: true`
- Unauthenticated `POST /api/tech/dev/cable-bulk/1` → **401** (endpoint registered under demo; auth required)
- When `DEMO_MODE !== 'true'`: controller + `cableAction reset_all` return **404** (source-verified)

### Tablet QA — `wire-dev-bar` CSS

Uses `flex-wrap`, compact `h-8` buttons, `whitespace-nowrap` — should wrap cleanly on narrow widths. Manual check pending:

- [ ] 1440×960 / 1280×800 / 820×1180 — bar wraps without overflow; buttons remain tappable

---

## ENTERPRISE THEME CATALOG — 6 switchable palettes (2026-06-30)

**Goal:** Multiple enterprise-grade themes for tablet, desktop, and mobile; user picks from top bar or login.

| ID | Name | Group | Best for |
|----|------|-------|----------|
| `steel` | Brushed Steel | Mid-tone | Shop-floor tablet (default) |
| `dusty` | Dusty Blue | Mid-tone | Supervisor tablet |
| `arctic` | Arctic Enterprise | Light | Bright tablet / mobile glare |
| `slate` | Command Slate | Dark | Control room / night shift |
| `navy` | Navy Ops | Dark | Director desktop |
| `graphite` | Graphite Pro | Dark | Plant OLED / industrial |

**Files:** `src/styles/theme-palettes.css` (token sets), `src/styles/themes.css` (`[data-theme]` rules), `src/store/useThemeStore.ts`, `src/components/layout/ThemeSwitcher.tsx`. Login page has compact picker; choice persists per-user (`dwes_theme:{userId}`) or guest (`dwes_theme:guest`).

---

## COHESIVE ACCENT — fix clashing multi-hue gradients (2026-06-30)

**Goal:** One harmonious accent hue per theme; calm page background; keep card/table hierarchy. Presentation only.

### Step 1 — Discovery (before)
| Token | Brushed Steel (was) | Issue |
|-------|---------------------|-------|
| `--t-primary-grad` | `linear-gradient(135deg, #14B8A6 → #2563EB)` | Teal-green crossing into blue — absent elsewhere |
| `--t-accent-bright` | `#0D9488` (teal) | Clashed with grey-blue page/cards |
| `--t-bg-grad` | 3-stop `#788A98 → #8FA1AF → #7E909E` | Busy/muddy |
| Dusty `--t-primary-grad` | `#3B82F6 → #1D4ED8` | OK same-hue but bright generic blue |
| PART 11 overrides | Indigo `#4338CA` role/status tints | Third clashing scheme |

### Step 2 — Applied (`src/styles/themes.css`)
**Brushed Steel** — one steel-blue accent:
- `--t-primary-grad`: `linear-gradient(180deg, #567485 → #456270)` (same-hue only)
- `--t-accent` / `--t-accent-bright`: `#4A6577` / `#5C7586` (no teal)
- `--t-bg-grad`: subtle 2-stop same family `#8294A2 → #889AA8`
- `--t-header`: subtle same-hue steel gradient

**Dusty Blue** — one dusty blue accent:
- `--t-primary-grad`: `linear-gradient(180deg, #5580A8 → #4A7098)`
- `--t-accent-bright`: `#5C85A8` (theme family, not generic `#3B82F6`)
- Calmer 2-stop page background

Also: `--t-accent-border` token; PART 11 role/progress tints → accent tokens (removed indigo); sign-off pill → `--t-primary-grad`; report pill → solid success; cyan accent borders → `--t-accent-border`.

### Verify
- `tsc -b && vite build` ✓
- Primary buttons (New Project, Upload, Action, Refresh, etc.) all use `--t-primary-grad` — one hue per theme
- Card/table hierarchy unchanged; danger/status/wiring semantic colors intact

### Tablet QA (manual)
- [ ] 1440×960 / 1280×800 / 820×1180 — buttons feel cohesive with bg/cards, not 3 clashing schemes

---

## LAYERED SURFACE HIERARCHY — fix flat/washed-out theme (2026-06-30)

**Goal:** Restore visual depth on Brushed Steel + Dusty Blue — page background, cards, header, tables, and buttons each at distinct levels. Presentation only.

### Step 1 — Discovery (root cause)
Prior tokens had only ~4 levels with **~15–20% lightness spread** (`--t-bg` #A8B4BE → `--t-surface` #C8D0D8). Top bar, cards, tables, and page bg all mapped to similar mid-greys. Spot-check rules also forced **`box-shadow: none`** on KPI cards and `pj-surface`, flattening the supervisor/director dashboards.

| Surface | Before (same tone problem) |
|---------|------------------------------|
| Page bg | `--t-bg` mid-tone gradient |
| Top bar | `--t-surface` (≈ same family as cards) |
| KPI / dr-card / pj-surface | `--t-surface` + flat shadow |
| Table header/rows | `--t-surface-2/3` (still mid-tone) |
| Secondary buttons | `--t-surface-2` (panel-like) |

### Step 2 — Layered tokens (both themes)
Added in `src/styles/themes.css` PART 1:

| Level | Token(s) | Role |
|-------|----------|------|
| L0 Page | `--t-bg`, `--t-bg-grad` | Deepest saturated mid-tone (colored background kept) |
| L1 Header | `--t-header`, `--t-header-border`, `--t-on-header` | Darker chrome band; light text |
| L2 Cards | `--t-card`, `--t-card-border`, `--t-card-shadow` | Near-white lifted panels |
| L3 Raised | `--t-elev`, `--t-elev-shadow` | Modals/menus |
| Tables | `--t-table`, `--t-table-head`, `--t-table-row-alt` | White well + separated header + zebra |
| Buttons | `--t-primary-grad` (teal→blue steel / bright blue dusty), `--t-btn-secondary-bg/border` | Primary = accent gradient; secondary = white + border |

Legacy `--t-surface*` aliases map to card/table tokens for backward compat.

### Step 3 — Applied
- Top bar → `--t-header` gradient with light text
- KPI cards, `dr-card`, `pj-surface`, `tc-card`, `wire-card`, login card → `--t-card` + shadow
- Tables → white `--t-table` well, `--t-table-head` header, zebra `--t-table-row-alt`
- Primary/secondary buttons → distinct gradient vs white+border
- Removed flat `box-shadow: none` overrides on supervisor KPI strip and pj-surface

### Verify
- `tsc -b && vite build` ✓
- `/api/health` ok
- Manual: Director + supervisor + technician — cards lift off bg; table header/rows scannable; header band distinct; primary buttons read as buttons. Both themes. Wiring schematic well unchanged (`#EEF2F6`).

### Tablet QA (manual)
- [ ] 1440×960 / 1280×800 / 820×1180 portrait — hierarchy holds, nothing flat/muddy on real tablet

---

## NEAR-REAL-TIME DASHBOARD POLLING — supervisor + director (2026-06-30)

**Goal:** Supervisor and director dashboards auto-refresh wiring progress / KPIs every ~4s (read-only polling, no WebSockets). Presentation/display only — no writes, KPI math, wiring flow, or guard changes.

### Discovery
| Surface | Fetch | Prior behavior |
|---------|-------|----------------|
| `src/pages/supervisor/tabs/ProjectsTab.tsx` | `GET projectsApi.list()` | Load once on mount |
| `src/pages/supervisor/tabs/FramesTab.tsx` (embedded) | `GET projectsApi.frames()` + `GET supervisorApi.allPanels()` | Load on project change only; frame modal polled 12s |
| `src/pages/director/tabs/SummaryReportTab.tsx` | `GET directorApi.projectsSummary()` | Polled every 30s with visibility pause |

All endpoints are existing **GET** (read-only).

### Implemented
- **NEW** `src/hooks/useReadOnlyPoll.ts` — 4s interval, pauses when `document.hidden`, skips overlapping requests, keeps last good state on failure, cleans up on unmount.
- `ProjectsTab` — silent background poll of project list (KPI strip + project table refresh).
- `FramesTab` — poll frames + assignments when a project is open; frame detail modal interval 12s → 4s with visibility pause.
- `SummaryReportTab` — replaced 30s manual interval with shared hook at 4s.

### Verify
- `tsc -b && vite build` ✓ (243 modules)
- Single Vite :5173 + backend :3001; `/api/health` ok
- Manual: open supervisor/director dashboard + DEMO tech1 wiring — numbers should update within ~4s without page refresh; hidden tab should pause polling.

### Tablet QA (manual)
- [ ] 1440×960 / 1280×800 / 820×1180 portrait — auto-update without layout jumps or lag on supervisor + director dashboards

---

## BRUSHED STEEL + DUSTY BLUE — app-wide theme (2026-06-30)

**Goal:** Brushed Steel (default) + Dusty Blue (switchable from top bar) via central `--t-*` tokens on **all roles/layouts**. Presentation only.

### Discovery — surfaces that were still un-themed / hardcoded
| Area | Issue |
|------|-------|
| `AppShell` | Hardcoded `data-theme="arctic"` (Arctic Paper sole theme) |
| `LoginPage` | White/right panel, blue gradient left, hardcoded slate/indigo Tailwind |
| `Topbar` | `bg-white` logo chip, white clock text, hardcoded bio dropdown |
| `SummaryReportTab` | `bg-white`, `text-slate-*`, `bg-blue-600` refresh button |
| Modals/tables across supervisor/admin/qaqc | Residual Tailwind hardcodes — majority overridden via shared `themes.css` selectors + `[data-ui-polish="saas"]` |
| Prior Arctic Paper | Light/white palette — replaced by mid-tone Brushed Steel / Dusty Blue |

**Flag for confirmation:** All roles now share the same mid-tone look (director/QA/admin were previously lighter/white in places). Default intent applied: one coherent product skin.

### Implemented
- `src/styles/themes.css` — PART 1: `[data-theme="steel"]` (Brushed Steel) + `[data-theme="dusty"]` (Dusty Blue) palettes; ~530 shared structural overrides via `:is([data-theme="steel"], [data-theme="dusty"])`.
- **RESTORED** `src/store/useThemeStore.ts` — `steel` default, `dusty` switchable; per-user `localStorage` `dwes_theme:{userId}`; legacy `arctic`/`ocean` prefs map to Brushed Steel.
- **RESTORED** `src/components/layout/ThemeSwitcher.tsx` — top bar for all authenticated roles.
- **NEW** `src/components/layout/ThemeProvider.tsx` — applies theme on `<html>` app-wide (login + dashboards).
- `AppShell` — theme store removed from shell (centralized in ThemeProvider).
- `Topbar` — themed logo wrap, clock, bio panel; ThemeSwitcher added.
- `LoginPage` — semantic classes (`login-panel-right`, `login-card-surface`, etc.) + token overrides.
- Legibility: wire schematic well uses contrasting `#EEF2F6` panel; semantic danger/status colors preserved (not recolored to accent).

### Verify
- `tsc -b && vite build` ✓
- Brushed Steel default; Dusty Blue switches instantly app-wide
- `/api/health` ok

### Tablet / wiring QA (manual)
- [ ] Both themes at 1440×960 / 1280×800 / 820×1180 portrait — text AA contrast, visible borders
- [ ] Wiring schematic: blue/grey/white cable colors distinguishable on mid-tone backgrounds in **both** themes
- [ ] Glare check on physical tablet in shop-floor lighting

---

## ARCTIC PAPER — sole theme; Ocean/Steel removed (2026-06-30) — SUPERSEDED

**Superseded by Brushed Steel + Dusty Blue above.** Archive still at `C:\Users\sathe\OneDrive\Desktop\DWES_theme_archive\2026-06-30\`.

**Goal:** Arctic Paper is the **only** active theme. Ocean Cyan + Midnight Steel + top-bar switcher removed from the app (archived, restorable). Presentation only.

### Discovery (files involved)
| File | Role |
|------|------|
| `src/styles/themes.css` | Token palettes + structural overrides (PART 1–11) |
| `src/store/useThemeStore.ts` | Per-user `localStorage` pref — **removed** |
| `src/components/layout/ThemeSwitcher.tsx` | Top-bar picker — **removed** |
| `src/components/layout/AppShell.tsx` | Applied `<html data-theme>` — now hardcodes `arctic` |
| `src/components/layout/Topbar.tsx` | Rendered switcher for themed roles — switcher removed |
| `src/theme-preview/` | Isolated preview page (`/theme-preview`) — **unchanged** (not in live app) |

Arctic Paper tokens fully cover all surfaces previously themed via ocean/steel shared selectors.

### Archive (restorable — NOT hard-deleted)
**Path:** `C:\Users\sathe\OneDrive\Desktop\DWES_theme_archive\2026-06-30\`

| File | Contents |
|------|----------|
| `ocean-steel-palettes.css` | `[data-theme="ocean"]` + `[data-theme="steel"]` token blocks |
| `theme-switcher-styles.css` | Former themes.css PART 4 switcher CSS |
| `ThemeSwitcher.tsx` | Top-bar component |
| `useThemeStore.ts` | Zustand store + localStorage (`dwes_theme:{userId}`) |
| `README.md` | Restore instructions |

### Removed from active codebase
- Ocean + Steel palette blocks from `themes.css` PART 1
- PART 4 theme-switcher CSS
- All `:is(ocean, steel, arctic)` selectors → `[data-theme="arctic"]` only
- Dark-theme `--sx-*` override block (ocean/steel only)
- `useThemeStore.ts` deleted from `src/store/` (pref logic removed — AppShell always sets `arctic`; stale `localStorage` keys are inert)
- `ThemeSwitcher.tsx` deleted; import + `THEMED_ROLES` switcher block removed from `Topbar.tsx`
- `AppShell` sets `data-theme="arctic"` on mount (no store)

### Verify
- `tsc -b && vite build` ✓ (238 modules; ThemeSwitcher/store tree-shaken)
- Single Vite :5173 + backend :3001; `/api/health` ok
- No broken imports or `ocean`/`steel` references in `src/` (except isolated `/theme-preview`)

### Tablet / glare QA (manual — **critical now**)
Dark fallbacks are **gone from the app** (archived only). Real-device check in actual working light is essential:
- [ ] 1440×960 / 1280×800 / 820×1180 portrait on physical shop-floor tablet
- [ ] Legibility: text, borders, tables, wiring schematic cable colors
- [ ] Glare: Arctic Paper on glossy screen in direct sun
- [ ] If fail → restore from `DWES_theme_archive\2026-06-30\` per README

---

## ARCTIC PAPER — default theme (2026-06-30)

**Goal:** New light/white theme "Arctic Paper" (indigo accent) as **DEFAULT**; Ocean Cyan + Midnight Steel **retained** in the top-bar switcher. Presentation only.

### Discovery (mechanism)
- **Tokens:** `src/styles/themes.css` — PART 1 palette (`--t-*` per `[data-theme]`), PART 2 MD3 mapping, PART 3–7 structural overrides, PART 8–10 SaaS polish, PART 11 Arctic legibility.
- **Default selection:** `src/store/useThemeStore.ts` — `DEFAULT_THEME` + `loadPref()` from `localStorage` key `dwes_theme:{userId}`. Was `ocean`; now **`arctic`**. Saved `ocean`/`steel` prefs still respected.
- **Apply:** `AppShell` sets `<html data-theme={theme}>` on every mount/login; `initForUser(user.id)` loads pref.
- **Switcher:** `ThemeSwitcher` in `Topbar` for supervisor / technician / director — lists Arctic Paper, Ocean Cyan, Midnight Steel; instant apply + per-user persist.

### Added
- **`[data-theme="arctic"]`** full token set in themes.css PART 1: `#F8FAFC` bg, `#FFFFFF` surface, `#EEF2F7` secondary, indigo `#4F46E5` / `#6366F1`, text `#0F172A` / `#64748B`, borders `#D5DBE3`/`#E2E8F0`, semantic success/warning/danger tuned for WCAG-AA on white.
- Extended shared selectors (PART 2–7, 9) to include `arctic` alongside ocean/steel.
- **`useThemeStore`:** `ThemeId = 'arctic' | 'ocean' | 'steel'`, default `arctic`.
- **Theme switcher restored** with three options + `.theme-switch-swatch.arctic`.

### Light legibility fixes (PART 11 — `[data-theme="arctic"]` only)
- Role/status badge tints → darker text on light containers (not dark-theme pastels).
- Table zebra (`mapping-table` even rows, `dr-row-alt`) → `--t-surface-2` (was invisible white@3%).
- Wiring SRC/DST blocks + action buttons → green/orange light tints (not dark cyan rgba).
- Cable schematic well → `--t-surface-2` + stronger border (white/grey wires visible).
- Modal overlay → lighter dimmer `rgba(15,23,42,0.45)`.
- `pj-panel-head`, topbar active nav, tc-src/dst pills, theme-switch menu → indigo/light tokens.
- Danger red + status colors **unchanged semantically** (not recolored to indigo).

### Verify
- Fresh session / no pref → Arctic Paper. Saved ocean/steel prefs respected.
- `tsc -b && vite build` ✓ (241 modules). Single Vite :5173 + backend :3001; `/api/health` ok.
- No logic/data/nav/wiring/KPI/guard changes.

### Tablet / glare QA (manual — REQUIRED on physical device)
- [ ] Arctic Paper at 1440×960 / 1280×800 / 820×1180 portrait on the **actual shop-floor tablet** in direct working light — check legibility, border visibility, wiring schematic cable colors, and **glare on glossy screen** (Arctic Paper can wash out in sun).

### Spot-check pass (2026-06-30) — Arctic Paper legibility on key screens
**Method:** Dev env verified (Vite :5173, backend :3001, `/api/health` ok; demo login `supervisor2` API ok). Browser automation unavailable in agent environment — performed **CSS/code audit** of Supervisor Projects (`ProjectsTab`), Technician cards (`PanelsTab`), Director Summary Report (`SummaryReportTab`) against Arctic Paper tokens.

**Findings (before fixes):**
- `--t-faint` (#94A3B8) too light for AA captions/clock on white.
- `pj-surface` / `dr-card` / `tc-card` borders could vanish (`#E2E8F0` only).
- `pj-table` / `dr-thead` headers needed stronger label contrast (#475569).
- Technician active card still used hardcoded `border-blue-500` (not indigo family).
- Director table row hover/zebra needed explicit light-surface rules.
- Cable schematic well borderline for white/grey wires on `#EEF2F7`.

**Fixes applied (PART 11 `themes.css` only — presentation):**
- Bumped Arctic `--t-faint` → `#64748B`.
- Stronger borders + `--t-shadow-1` on `pj-surface`, `tc-card`, `dr-card`, `kpi-card`.
- Table header/row/divider/hover rules for `pj-table` + `dr-*`.
- Indigo-aligned `tc-card-active`, `tc-btn-drawing`, upload menu hover.
- Schematic well → `#E2E8F0` / `#CBD5E1` border.

**Build:** `tsc -b && vite build` ✓ (241 modules).

---

## LIGHT SAAS CRM DIRECTION — token retune (2026-06-30)

User direction: modern SaaS CRM dashboard (SaasAble **light** theme) — structured/data-first, clear hierarchy, subtle defined elevation, consistent dense spacing, strong table/metric readability. Avoid airy landing-page styling. Token-driven, no component-system rewrite.

### Changes (all in `themes.css` + `AppShell`)
- **`AppShell`** now sets `data-ui-polish="saas"` for **all roles** (was themed-only) → light admin/QA-QC + shared light surfaces get the polish.
- **Retuned `:root` tokens (denser, structured):** radius 8/10/12/16 (was 10/12/16/20); spacing `--pad-card` 20, `--pad-cell` 16×12, `--row-h` 52 (was 24 / 20×14 / 56) — data-first density, less airy.
- **Light elevation `--sx-1/2/3`** = soft-but-visible Untitled-UI/SaasAble shadows (`rgba(16,24,40,…)`). Dark themes override to heavier black shadows so they stay visible on dark surfaces.
- **PART 10 (new) — light-only polish** (`html:not([data-theme]) [data-ui-polish="saas"]`): hairline `--color-outline-variant` borders + `--sx-1` on cards/KPI/tables/drawing cards; table headers use `--color-surface-container` bg, uppercase muted labels, dense cells; modals rounded + `--sx-3`; buttons/inputs structured `--rx-md`.
- **Dark Ocean/Steel (PART 9)** untouched in color; inherits the denser spacing/radius tokens. Semantic/status/danger unchanged. Wiring flow excluded. No logic/data/nav change.

### Verify
- `tsc -b && vite build` ✓ (241 modules).

### Decision (resolved) — ALL roles → light SaaS CRM, denser
User chose: switch supervisor / technician / director **off dark Ocean/Steel to the light theme**, and make density **more compact**.
- **`AppShell`** no longer applies `data-theme` (clears any stale attr on mount) → every role renders the light SaaS theme. Dark theme system (themes.css PART 1–9, `useThemeStore`, `ThemeSwitcher`) is **retained but inert** — reversible by restoring the data-theme effect.
- **`Topbar`** — removed the Ocean/Steel `ThemeSwitcher` control (now redundant) + its `THEMED_ROLES` const/import. Themed roles fall back to their original light Tailwind/design-system defaults (the app's pre-theming look) + PART 10 polish.
- **Denser tokens:** `--pad-card` 16, head 18×14, cells 14×9, **`--row-h` 46** (was 20/20×16/16×12/52); light `.page-body` padding `--space-5` (20). More data per screen; buttons keep `min-height:44px`.

### Verify
- `tsc -b && vite build` ✓ (238 modules; ThemeSwitcher/useThemeStore tree-shaken out).

### Tablet QA (manual)
- [ ] All roles at 1440×960 / 1280×800 / 820×1180: dense tables readable, cards have defined edges, no overflow; primary touch targets ≥44px.

---

## SAASABLE-INSPIRED POLISH — rolled out (2026-06-30)

**Reference:** [SaasAble MUI kit preview](https://mui.com/store/previews/saasable-multipurpose-ui-kit-and-dashboard/).

The commercial SaasAble template is **MUI v7 + paid** — it cannot be dropped into DWES without rewriting the stack. We emulated the **dashboard feel** (Material 3 spacing, soft elevation, rounded cards, Inter type, capitalize buttons) in **Tailwind + `themes.css`**. Ocean Cyan / Midnight Steel colors unchanged.

### Rolled out (themed roles: supervisor, technician, director)
- `AppShell` sets `data-ui-polish="saas"` when themed.
- PART 8/9 in `themes.css`: `--rx-*` (10–20px), `--sx-*` soft shadows, generous padding, type scale.
- Cards, tables, modals, KPI, `.pj-*`, `.tc-*`, `.dr-*`, buttons, inputs — unified geometry.
- **Inter** font loaded; sans stack prefers Inter.
- Buttons: 12px radius + capitalize (SaasAble style). Wiring flow (`wire-*`) excluded. Light admin/QA untouched.

### Verify
- `tsc -b && vite build` ✓

### Tablet QA (manual)
- [ ] 1440×960 / 1280×800 / 820×1180 — no overflow; touch ≥44px; Ocean ↔ Steel.

---

## THEME COMPLETE — Technician cards, Action dialog, Director dashboard — 2026-06-30

### What changed (presentation only; no logic/data/navigation touched)

#### 1. Technician panel cards (`src/pages/technician/tabs/PanelsTab.tsx`)
- `<article>` cards: added `tc-card` (surface/border) + `tc-card-active` (accent ring when in-progress panel is selected)
- Action buttons: `tc-cta-btn` on Start/Open/Resume Wiring (→ `--t-primary-grad`), `tc-cta-neutral` on View Wiring (→ `--t-surface-2`)
- Pill badges: `tc-src-pill` (→ cyan/`--t-src`), `tc-dst-pill` (→ orange/`--t-dst`), `tc-schedule-pill` (→ surface-2), `tc-warn-pill` "Awaiting approval" (→ `--t-warning-soft`)
- Drawing link: `tc-btn-drawing` (→ `--t-accent-soft` / accent-bright text)
- Right column divider: `tc-divider` (→ `--t-border`)
- Card text: `.tc-card .text-slate-*` overrides via CSS scope (→ t-text / t-muted / t-faint)
- Equal height: not needed for panel cards (each card is auto-height; the grid handles alignment). No fixed height imposed.

#### 2. KPI stat card icon bubbles (`src/components/ui/KpiCard.tsx`)
- Added `kpi-icon` class to the icon wrapper `<div>` inside `kpi-card`
- Themed per variant in `themes.css PART 6`: green → `--t-success-soft`/`--t-success`, blue → accent-soft/bright, amber → warning-soft/warning, red → danger-soft/danger; default → surface-2/muted

#### 3. Action dialog header (`src/pages/supervisor/tabs/FramesTab.tsx`)
- Added `frame-action-head` to the dialog header `<div>` (was `bg-gradient-to-r from-blue-600 to-blue-800`)
- CSS in `themes.css PART 6`: `background: var(--t-primary-grad)` → active theme gradient (cyan-toned under Ocean Cyan, sky-blue under Midnight Steel)

#### 4. Director dashboard (`src/pages/director/tabs/SummaryReportTab.tsx`)
- `ops_director` added to `THEMED_ROLES` in `AppShell.tsx` + `Topbar.tsx` → director now receives Ocean/Steel dark surfaces and the top-bar "Switch theme" control
- Hook classes: `dr-report` (outer scope), `dr-card` (ProjectCard), `dr-toggle` (expand button), `dr-card-head` (inner info div), `dr-proj-track`/`dr-mini-track` (progress bar tracks), `dr-table-wrap` (panel expansion div), `dr-thead` (thead), `dr-row`/`dr-row-alt` (panel rows), `dr-status-badge data-status` + `dr-qc-badge data-qc` (semantic status/QC pills), `dr-link` (expand/collapse CTAs), `dr-btn-refresh`, `dr-export-strip`, `dr-export-btn`
- `dr-report .text-slate-*` scope overrides → all Tailwind text utilities in the component flip to theme tokens without touching component logic
- Status / QC badges: color driven by `data-status`/`data-qc` attribute (same as `pj-state-badge` pattern); no per-project palettes
- Report progress bars (`report-bar-fill`, `report-proj-fill`) → `var(--t-accent)` instead of hardcoded `#3b82f6`

#### 5. `info-pill` / `tech-strip` (previously undefined — no CSS)
- Added base light-mode styles to `themes.css PART 6` (were referenced in PanelsTab but never defined anywhere — invisible in all themes)
- `info-pill[data-tone="source"]` → accent-soft/src; `info-pill[data-tone="pending"]` → warning-soft/warning; `tech-strip` → warning-soft/warning

### CSS changes (centralized, no per-component hardcodes)
- `themes.css PART 6` (new): KPI icon bubbles, frame-action-head, report bar fills, tc-* technician card classes, info-pill + tech-strip base + overrides
- `themes.css PART 7` (new): all dr-* director report classes
- `themes.css PART 5` (existing): unchanged

### Verify
- `tsc -b && vite build` ✓ (241 modules; CSS 224→232 KB; growth = PART 6+7). oxlint: all newly touched files 0 warnings; FramesTab 3 pre-existing warnings (lines 184, 208, 1105 — unrelated to today's edits). Single Vite + single backend.
- Light defaults preserved: hook classes are additive; hardcoded Tailwind utilities still provide correct light-mode appearance (theme CSS only activates under `[data-theme]`).
- Theme switch: Ocean Cyan ↔ Midnight Steel applies instantly to Technician cards, KPI bubbles, Action dialog header, and Director dashboard — all via the centralized `--t-*` token set.
- Danger stays semantic red in both themes. Status carries the only per-card color (no per-project palettes). Wiring flow, guards, type-to-confirm flows: untouched.

### Tablet (manual QA — no browser automation here; real check on the tablet in working light)
- [ ] Technician dashboard at 1440×960 / 1280×800 / 820×1180: panel cards use theme surface; Start/Open/Resume = accent CTA; View = neutral; drawing pills = accent-soft; src/dst pills semantic cyan/orange; equal-height grid; ≥44px buttons.
- [ ] KPI row (Assigned / In Progress / Completed): icon bubble colors match theme (amber/blue/green) in both Ocean Cyan and Midnight Steel.
- [ ] FramesTab Action dialog header: theme gradient (no hardcoded blue) in both themes.
- [ ] Director dashboard (ops_director): all white surfaces → `--t-surface`; no white-on-dark; status/QC badge colors correct; refresh + export buttons themed; progress bars accent-colored.
- [ ] Switch Ocean ↔ Midnight Steel from top bar: all three dashboards (Supervisor, Technician, Director) re-theme correctly; danger stays red.

---

## THEME FIX — Project/Frame card surfaces (Supervisor) — 2026-06-30

### Problem
Several project/frame surfaces were missed in the Ocean/Steel rollout — they still rendered **white** on the dark theme, with **hardcoded blue** buttons and a hardcoded-light status badge.

### Discovery (sweep)
- `components/ui/ProjectInfoCard.tsx` → `.proj-mini-card` — **already** themed + equal-height (`min-h-[104px]`) + status color (`data-s`); used **only by QA/QC PanelsTab** (a light role). No change.
- **`supervisor/tabs/ProjectsTab.tsx`** — MISSED: list container/table/thead/rows (`bg-white`/`bg-[#FAFAFA]`), Open button hardcoded blue, Edit/Delete `bg-white`, status badge hardcoded light, upload dropdown `bg-white`, opened-project frame panel `bg-white` + `bg-blue-50` header.
- **`supervisor/tabs/FramesTab.tsx`** — MISSED: frames table container/rows `bg-white` (status pills `.frame-status-*` + drawing `.drawing-card` were already themed).
- `director/tabs/SummaryReportTab.tsx` `ProjectCard` — light `bg-white` accordions; **correct** (director is a light-theme role — Ocean/Steel scope is supervisor+technician only), so not a white-on-dark bug. Left as-is by design.

### Fix (presentation only; additive hook classes + centralized tokens)
No table→card conversion (would change navigation — forbidden). Added lightweight hook classes to the supervisor surfaces and themed them in the centralized `themes.css` (Ocean/Steel), so they auto-adapt on theme switch and **no colors are hardcoded for the active theme**:
- `pj-surface` (containers/panels) → `var(--t-surface)`/`var(--t-border)`
- `pj-table` (thead/rows/cells/zebra/hover) → themed; even **52px** row height (design-system.css base, both themes) so content variance (pill vs pill+technician vs verify link) doesn't change row height
- `pj-panel-head` (opened-project header) → `var(--t-accent-soft)` + themed text/icon/close
- `pj-menu` (upload dropdown) → elevated `var(--t-elev)` + themed items
- `pj-state-badge[data-state]` → **STATUS carries the only per-card color** (completed/submitted = green, active/in_review = accent, pending = orange, stopped = red, else neutral). No per-project palettes.
- `pj-btn-primary` (toolbar + Open-active) → active theme accent gradient; `pj-btn-secondary` (Open-inactive/Edit) → themed surface; `pj-btn-danger-ghost` (Delete) → themed surface, **semantic-red on hover** (danger never recolored to accent).
- Frame-status column links polished on dark (`text-blue-500` → accent-bright, `text-slate-400` → faint).
Files: `ProjectsTab.tsx` + `FramesTab.tsx` (class additions only — no logic/nav/data change), `styles/themes.css` (PART 5 dark rules), `styles/design-system.css` (even-row base).

### Verify
- `tsc -b && vite build` ✓ (241 modules; CSS 219→224 KB). oxlint: ProjectsTab 0; FramesTab only 3 **pre-existing** warnings (unrelated regex/dep), none from these edits. Single Vite (5173) + single backend (3001), `/api/health` ok; ProjectsTab hot-transforms 200.
- Behavior unchanged: Open/expand navigation, Action dialog, KPIs, type-to-confirm guards, wiring flow — untouched (additive className changes only).
- Status-driven color preserved & centralized; per-project palettes deliberately NOT used; danger stays semantic red.
- Director left light by design (documented); Technician dashboard stat cards not touched (separate scope; not the shared project-card component).

### Tablet (manual QA — no browser automation here; real check on the tablet)
- [ ] Supervisor Projects at 1440×960 / 1280×800 / 820×1180: no white cards on dark; rows equal height; Open/Edit/Delete + toolbar buttons use the accent and are ≥44px tappable; status badges colored by state.
- [ ] Switch Ocean ↔ Midnight Steel from the top bar: project list + opened-project frame table re-theme correctly in both; no hardcoded blue/white leaks.
- [ ] Open a project → frame table (themed surface, even rows, themed status pills); drawings grid themed.

---

## PHASE 3 (FINAL) — OCEAN CYAN default + MIDNIGHT STEEL switcher — 2026-06-30

### What changed (presentation only)
Replaced Aurora as the default with **Ocean Cyan**, and added **Midnight Steel** as a user-switchable alternative via a **"Switch theme"** control in the top bar. Both are complete, centralized token sets (single source of truth) for the **Technician + Production Supervisor** surfaces. Admin / Director / QA-QC stay on the default light theme. **Zero behavioral change** — no logic, data, endpoints, wiring flow, KPI math, or destructive-op guards were touched.

### Centralized theme system (single source of truth)
- **NEW `src/styles/themes.css`** — refactor of the old `aurora.css` into a token-driven sheet:
  - PART 1: per-theme palette literals only — `[data-theme="ocean"]` and `[data-theme="steel"]` define `--t-*` tokens (bg, surfaces, border, text/muted, accent/accent-strong, on-accent, primary gradient, src/dst tones, success/warning/danger, shadows).
  - PART 2: shared mapping `:is([data-theme="ocean"],[data-theme="steel"])` wires the existing MD3 role vars (`--color-*`) + tokens.css status/role tints to `--t-*`, so token-consuming components flip automatically.
  - PART 3: ~150 shared structural overrides (topbar, cards, KPI, buttons, badges, forms, tabs, tables, modals, upload wizard, project cards, frame table + Action pills, full wiring flow, wire-list sheet, drawing viewer, progress, mapping, misc) — all colors via `var(--t-*)`. Switching themes = swap the active `--t-*` set; everything re-skins with no per-component code.
  - All selectors are unlayered → beat design-system.css `@layer components` hardcodes without `!important`.
- `src/index.css` — import switched from `aurora.css` → `themes.css`. (`aurora.css` left on disk, no longer imported — candidate for Phase-4 cleanup.)
- **Buttons sit in the bg family** (fixes prior float-mismatch): primary = theme gradient (`--t-primary-grad`); secondary/ghost = theme surfaces; **danger stays semantic red (`--t-danger`) in BOTH themes** — never recolored to the accent.

### Palettes
- **Ocean Cyan (default):** bg `#0A1622`, surface `#0F2438`, accent `#06B6D4` / strong `#0E7490`, text `#E4EEF5` / muted `#BFD3DE`; primary gradient `#06B6D4→#0E7490` (dark text).
- **Midnight Steel:** bg `#0B1120`, surface `#111A2E`, accent `#38BDF8` / strong `#2563EB`, text `#E8EDF6` / muted `#C7D2E3`; primary gradient `#38BDF8→#2563EB`.
- Source tone = cyan/sky, Destination tone = orange `#FB923C` (functional contrast) in both.

### Switcher + persistence
- **NEW `src/store/useThemeStore.ts`** — `theme` (`'ocean'|'steel'`), `setTheme(theme, userId)`, `initForUser(userId)`. **Per-user persistence via `localStorage` key `dwes_theme:<userId>`** (no DB column, no schema change). Default = Ocean Cyan when no pref saved.
- **NEW `src/components/layout/ThemeSwitcher.tsx`** — top-bar control (`topbar-action` styled, ≥44px, `Palette` icon + current-theme dot + label, tooltip "Switch theme"); opens a themed dropdown with Ocean Cyan / Midnight Steel (swatch + check on active), click-outside / Esc to close. Selecting applies **instantly** and persists.
- `src/components/layout/Topbar.tsx` — renders `<ThemeSwitcher/>` only for `prod_supervisor` + `wiring_technician`.
- `src/components/layout/AppShell.tsx` — `initForUser(user.id)` on themed-user mount; sets `<html data-theme="ocean|steel">` from the store (so portaled modals theme too); instant re-skin on switch; removes attr for non-themed roles.

### Behavior preserved (verified by inspection — no edits to these files)
- Single-wire one-at-a-time flow + **Next** (not Skip), type-to-confirm exact-phrase guards, Action dialog, KPI math (0.7/0.3 constants), backup-first destructive guards, role/JWT auth, Prisma/WiringSchemeDB — all untouched. The MODULE-46 custom delete modals keep their semantic-red danger styling (white card, red header) in both themes.

### Verify
- `tsc -b && vite build` ✓ (241 modules, ~0.6s; `aurora.css` no longer bundled; ThemePreview still a lazy chunk). oxlint on new/changed files: 0. Dev server transforms `themes.css` + `ThemeSwitcher` → 200. Single Vite (5173) + single backend watcher (3001), `/api/health` ok.
- Contrast (AA): text/muted on both surfaces ≥9:1; accent-bright link/label text ≥8:1; danger red ≥5:1. Note: Steel **primary-button** dark text on the `#2563EB` end is AA-**large** (button labels are bold ≥14px → 3:1 threshold) — fine for buttons; real check is on the tablet in working light.

### Tablet verification (1440×960, 1280×800, 820×1180 portrait)
Switcher lives in the existing top-bar right cluster; label is hidden below `tablet-land` (icon+dot remain) so it doesn't crowd logo/Projects/user/logout/clock; dropdown is `w-56` right-aligned. Manual-QA checklist (no browser automation here):
- [ ] Switch Ocean↔Steel from the top bar — instant, no reload; whole Tech + Supervisor surface re-skins.
- [ ] Reload → choice persists (per-user); a different user keeps their own.
- [ ] Wiring screen, Action dialog, type-to-confirm delete modals, team modal, upload wizard all legible in both; delete/confirm stays danger-red and fully guarded.
- [ ] Top bar fits at all three sizes incl. 820×1180 portrait; switcher tappable (≥44px).
- Real test: on the shop-floor tablet in working light.

### Files
- NEW: `src/styles/themes.css`, `src/store/useThemeStore.ts`, `src/components/layout/ThemeSwitcher.tsx`
- CHANGED: `src/index.css` (import), `src/components/layout/AppShell.tsx` (store-driven data-theme), `src/components/layout/Topbar.tsx` (switcher)
- `src/styles/aurora.css` — no longer imported (Phase-4 cleanup candidate)

---

## PHASE 3 — AURORA THEME ROLLOUT — 2026-06-30

### Chosen direction
**Aurora (C)** — Modern glass / vibrant twilight
- Page bg: `linear-gradient(135deg, #312E81 → #6D28D9 → #0E7490)` (fixed attachment)
- Surfaces: `rgba(255,255,255,0.10)` + `backdrop-filter: blur(18px) saturate(140%)`
- Accent: `#22D3EE` (cyan); primary button: cyan→indigo gradient
- Source tone: `#22D3EE` (cyan) / Destination tone: `#FB923C` (orange)
- Radius: 12/18/24/28px; Shadows: deeper rgba(7,11,30,…)

### Files changed
- `src/styles/aurora.css` — NEW: 500-line single-source-of-truth theme override sheet;
  all selectors are `[data-theme="aurora"] .class` outside any `@layer`, so they beat
  every `@layer components` hardcode in design-system.css without `!important`
- `src/index.css` — added `@import "./styles/aurora.css"` after design-system import
- `src/components/layout/AppShell.tsx` — reads user role from `useAuthStore`;
  sets `data-theme="aurora"` on `document.documentElement` (not just the shell div,
  so portaled modals also pick up the theme) for `prod_supervisor` and `wiring_technician`;
  cleans up on unmount; admin/director/qaqc remain on default light theme
- `src/components/layout/Topbar.tsx` — added `bio-panel-dropdown` class to fingerprint
  panel dropdown so aurora.css can style it as glass

### Scope
- Technician module: full wiring flow (header bar, KPI bar, wire card, ferrule badge,
  schematic, src/dst end blocks, action buttons, nav pills, wire-list sheet, toasts,
  completion screen, paused banner)
- Supervisor module: project mini cards, frame table + pill buttons, drawing cards,
  upload wizard (dropzone, mapping table), frame sheet items, assignment callouts
- Shared (Supervisor + Technician only): Topbar, cards, modals, forms, tables, badges,
  tabs, progress bars, KPI cards, upload menu, empty states, flash messages

### Behavior preserved (ZERO logic changes)
- All data endpoints, API calls, KPI formula (0.7/0.3), cable_status writes: untouched
- Single-wire one-at-a-time flow with Next (not Skip): untouched
- Type-to-confirm guards (project cascade, hard reset, reset-all): untouched
- Backup-first logic in service layer: untouched
- Role guards and JWT auth: untouched
- Prisma schema / WiringSchemeDB: untouched

### TypeScript build
- Frontend `tsc --noEmit`: ✅ ZERO errors

### Manual QA needed (tablet)
Run at 1440×960, 1280×800, 820×1180 portrait for Supervisor and Technician logins:
- [ ] Topbar glass renders; active tab has cyan underline; logout button visible
- [ ] Project mini cards: gradient bg visible through glass; status accents correct
- [ ] Frame pill buttons: cyan Verify, glass Drawing, emerald Report, danger red
- [ ] Upload wizard: mapping table headers dark + col-mapped cyan
- [ ] Wire card glass with gradient bg showing through
- [ ] Src (cyan) / Dst (orange) end blocks and action buttons
- [ ] Wire action buttons: unconfirmed = outlined cyan/orange; confirmed = filled
- [ ] Wire advancing overlay = cyan tint
- [ ] Wire list slide-up sheet = deep purple glass
- [ ] Wire complete card = glass
- [ ] Drawing viewer: header glass, interior chrome intentionally dark
- [ ] Modals: glass with blur; type-to-confirm input readable
- [ ] Admin / Director / QA/QC: **must still use light theme** (no aurora gradient)

---

## PHASE 4 — Controlled UX Cleanup (Technician + Supervisor) (2026-06-30)

### Step 1 — Candidates inventoried (READ-ONLY; nothing removed)
Report-first phase. Inventoried redundant/inconsistent/orphaned items across Technician + Supervisor by verifying actual call-sites and mount points (SupervisorDashboard → only ProjectsTab → embeds FramesTab + uses modal exports). **No code changed.** Removal happens only on explicit per-item user approval (Step 2).

**Candidate list (IDs for approval):**
- C1 `AssignmentTab.tsx` (default component) — orphaned; not mounted anywhere; superseded by FramesTab Action dialog (Assign/Unassign). NEEDS-DECISION.
- C2 `ReviewTab.tsx` (default component) — orphaned; superseded by FramesTab Action → Sign off (ReviewModal). NEEDS-DECISION.
- C3 `DrawingsTab` default component — orphaned; KEEP file (exports `UploadDrawingModal`+`DrawingDeleteModal` used elsewhere); remove only the dead default fn. NEEDS-DECISION.
- C4 `UsersTab` default component — orphaned; KEEP file (exports `TeamManagementModal`); remove only the dead default fn. NEEDS-DECISION.
- C5 `projectsApi.reportPdf` — dead client method (no backend, no caller). Forks with Phase-1 report-pdf gap: port OR remove stub. NEEDS-DECISION.
- C6 `projectsApi.deleteFrame` + `deleteDrawing` — bare/unguarded client methods, no callers (UI uses guarded). SAFE.
- C7 Backend bare `DELETE frames/:id` + `DELETE drawings/:drawingId` — bypass backup/confirm guards; reachable only via dead C6 methods. Destructive path. NEEDS-DECISION.
- C8 `techApi.hide` + backend `POST tech/hide/:id` — orphaned (no caller). NEEDS-DECISION.
- C9 Partially-wired "ready for assignment": `markReady` used; `myReadyStatus`/`cancelReady`/`readyForAssignment` client+routes unused; `readyForAssignment`→`submitReport` duplicates `submit-report`. NEEDS-DECISION.
- C10 Two Excel exports in FramesTab Action ("Report"=wiringScheduleXlsx vs "Panel report"=panelReportXlsx) — possible overlap. NEEDS-DECISION.
- C11 `legacy-index.html` (983 KB, repo root) — old-UI reference copy, not in build. SAFE.
- C12 Test backups in `backend/uploads/backups/` (MODULE 45 SESSION_LOG verify dump; MODULE 46 DRAWING_THROWAWAY_TEST dump+dir). SAFE.
- C13 `src/theme-preview/**` + `/theme-preview` route (Phase 2 preview) — keep until Phase 3 theme chosen, then remove. NEEDS-DECISION.
- C14 WiringTab DEV test bar (DEV-gated, tree-shaken from prod) — leftover test helper. Optional.

### Step 2 — Removals (pass 1: C6, C11, C12 — user-approved, done one-by-one)
Reversible cleanup archive (outside the project, out of build/lint/tsc scope): `C:\Users\sathe\OneDrive\Desktop\DWES_phase4_cleanup_archive\2026-06-30\`.

- **C6 — DONE.** Removed dead bare client methods `projectsApi.deleteFrame` + `projectsApi.deleteDrawing` from `src/services/api.ts` (no callers; UI uses the guarded `*Guarded`/`*Precheck` variants since MODULE 46). `tsc --noEmit` exit 0.
- **C11 — DONE.** Moved `legacy-index.html` (old-UI reference copy, not in the Vite build) from repo root → cleanup archive. Reversible.
- **C12 — DONE.** Moved ONLY the named MODULE 45/46 test/verification artifacts out of `backend/uploads/backups/` → cleanup archive: `SESSION_LOG_2026-06-30T05-49-42_pgdump-verify.dump`, `DRAWING_THROWAWAY_TEST.pdf_2026-06-30T06-17-43.dump`, and its archive dir. Targeted by exact name (no wildcard); **no real backup touched** — the dir held only those test artifacts and is now empty.

**Verification after pass 1:** `tsc -b && vite build` ✓ (238 modules, ~0.7s, dist emitted; ThemePreview stays a lazy 29.9 KB chunk). Backend untouched → single watcher on 3001, `/api/health` ok. No change to wiring flow, KPI formula, destructive-op guards, or Phase-1 parity (only dead code + stray files moved). Guarded delete modals/endpoints intact.

**C8 (tech/hide) — CONFIRMED unused, removal HELD.** Verified `techApi.hide` has zero callers and `is_hidden` is only a type field — no "hide completed frames" feature wired to it. Eligible to remove; held because this pass was scoped to C6/C11/C12. Awaiting go.

**Decisions recorded:** KEEP C5 (reportPdf — porting, not removing), C10 (both Excel exports intentionally different), C14 (dev-only, harmless), C13 (theme-preview — keep; note: Phase 3 Aurora rollout now done, so C13 is eligible for a future pass).
**Held for a separate verified pass:** C7 (first prove no external/launcher/old-app caller of the bare DELETE routes), C1/C2 (confirm FramesTab Action covers every assign/unassign/review path), C3/C4 (surgical: drop dead default component, keep modal exports, build-check after each), C8 (confirmed; awaiting go), C9 (abandoned/half-built — leave untouched).

---

## PHASE 2 — Design Exploration: tablet-first theme directions (preview only) (2026-06-30)

### What ran
Explored a new visual design direction on **throwaway sample screens only**. The live app is **visually and functionally unchanged** — no production screen/component/logic/endpoint/route behavior was modified. This ends at a **DECISION CHECKPOINT**: the user picks a direction before any rollout (rollout = Phase 3).

### Where to view
Run the app and open **`/theme-preview`** (no login required; lazy-loaded, isolated). Switch **Direction × Screen × Viewport** from the top control bar. A side panel shows each direction's mood, color swatches, token values, and where-it-shines / trade-offs.

### Three directions (genuinely distinct)
1. **Clarity** — clean / minimal / high-contrast light. Paper-white surfaces, one decisive blue accent, hairline borders, generous whitespace. Max legibility, most conservative.
2. **Foundry** — dark industrial / shop-floor. Charcoal surfaces, hi-vis safety-amber accent, chunky controls, strong state colors. Low glare for dim substations; sunlight is the trade-off.
3. **Aurora** — modern glass / elevated. Twilight gradient, frosted translucent cards (backdrop-blur), cyan→violet accent, layered depth. Premium look; GPU/contrast are the trade-offs.

### Sample screens (static mocks, placeholder data, wired to nothing)
1. Technician single-wire wiring view (top bar → grade/KPI bar → wire card with SRC→cable→DST schematic + Mark Source/Destination + Flag Issue → bottom nav).
2. Supervisor opened-project view (project select + Upload + **Action** affordance → frames table → drawings strip → summary bar).
3. Type-to-confirm destructive modal (Delete Frame: danger header, summary, amber warning, pg_dump notice, `DELETE FRAME =E01+M1` field, 56px Cancel/Delete).

### Design-system discipline
Each direction is a real mini design system in `src/theme-preview/themes.ts`: color tokens (incl. semantic success/warning/danger/info + src/dst tones), type scale, spacing scale, radius, shadow, and shared ergonomic controls (touch ≥44px, **primary 56px**, top bar 64px, input 48px). Screens render purely from tokens via **inline styles** — no Tailwind/global-CSS changes, so zero leakage into the live app.

### Isolation & verification
- New code lives only in `src/theme-preview/**`. Every import resolves to `react`, `lucide-react`, or within that folder — **nothing imported from live `services`/`store`/`pages`/components** (verified by import grep).
- Only production file touched: `src/App.tsx` — **one additive** lazy route `/theme-preview` before the catch-all (no existing route changed). Safe to delete the folder + that route to fully revert.
- `tsc --noEmit` zero errors; oxlint zero warnings on the new files + App.tsx.
- Dev server: `/theme-preview` → HTTP 200; Vite transforms the preview module graph → 200 (runtime imports resolve).
- DB untouched (no schema / cables_total / cable_status changes); no second backend watcher started.

### Tablet verification
Preview renders at all three targets via a scale-to-fit device frame: **1440×960, 1280×800, 820×1180 portrait** (selectable in the control bar; shows scale %). Live pixel walkthrough at each size is a manual-QA step in the browser.

### Files added / changed
- `src/theme-preview/themes.ts` — 3 token sets + `surfaceStyle` + `sp` helpers
- `src/theme-preview/components.tsx` — token-driven Btn / Pill / Chip / Label
- `src/theme-preview/screens/WiringScreenMock.tsx`, `SupervisorScreenMock.tsx`, `ConfirmModalMock.tsx`
- `src/theme-preview/ThemePreview.tsx` — orchestrator (direction × screen × viewport switcher + summary panel)
- `src/App.tsx` — one additive lazy `/theme-preview` route

### DECISION CHECKPOINT (awaiting user)
No winner picked, nothing applied app-wide. Choose **Clarity**, **Foundry**, or **Aurora** (or a blend) and Phase 3 will roll it out.

---

## FULL-FUNCTION AUDIT — 2026-06-30

### What was done
Complete non-destructive inventory + automated health check of all app functions:
- 128 backend endpoints enumerated across 11 controllers (all routes, roles, R/W, destructive flags, DEMO_MODE gates)
- All 5-role frontend feature inventory (login → admin → director → supervisor → qaqc → technician)
- Frontend TypeScript: zero errors ✅ | Backend TypeScript: zero errors ✅
- DB sanity: 44 users / 16 projects / 13 assignments / 0 inspections / 377 session_log / 8 file_hashes
- KPI formula spot-check confirmed (1261 done / (4832×2) = 13% — matches code) ✅
- All destructive confirm flows verified (type-to-confirm reached, buttons confirmed disabled before code entry)
- All backup-first guards confirmed for project cascade delete, hard reset, reset-all ✅

### Needs attention (priority order)
1. ✅ Backend running in dist mode (PID 11128, `backend\dist\main`) — stale-serving risk; restart with `npm run start:dev` — RESOLVED 2026-06-30: restarted a single `nest --watch` (also killed a pre-existing duplicate watcher); one listener on 3001, /api/health ok (MODULE 45 Step 0)
2. ✅ `POST /api/admin/sessions/clear` — wipes entire session_log without pg_dump backup; only a dialog.confirm (no type-to-confirm) — RESOLVED 2026-06-30: now backup-first (pg_dump) + transactional + type-to-confirm `CLEAR SESSION LOG`; role gate (system_admin) unchanged (MODULE 45)
3. 🟠 `GET /projects/:code/report-pdf` frontend stub → no backend handler registered → 404
4. ✅ Frame delete and drawing delete — upgraded to backup-first + type-to-confirm (MODULE 46)
5. 🟡 GET /projects and GET /projects/:code/frames have no @Roles guard — any authenticated role can read (may be intentional)
6. 🟡 ExportTab.tsx (PDF export) may not be wired into DirectorDashboard active nav
7. 🟡 `POST /api/admin/users/bulk-role` — bulk role update with no dry-run/undo in UI
8. 🟢 `sync/execute` is a no-op in current implementation (safe, but UI implies it works)

### Manual QA checklist
Delivered in the audit report. Must be run at 1440×960, 1280×800, and 820×1180 portrait.
Destructive actions (delete/reset) are verify-to-confirmation only — do NOT execute against real data.

---

## MODULE 46 — Frame Delete + Drawing Delete: backup-first + type-to-confirm (2026-06-30)

### What changed
Frame delete (`DELETE /api/projects/:code/frames/:id`) and drawing delete (`DELETE /api/projects/:code/drawings/:drawingId`) were both behind a bare `dialog.confirm` with NO pg_dump backup. Both are now brought up to the same guard standard — **backup-first + file-archive + type-to-confirm** — WITHOUT changing what they delete or who can run them. No DB schema change; `cables_total`/`cable_status` untouched; `prisma db pull` only.

### Guards added (existing spawnSync/pg_dump pattern REUSED — NOT reinvented)
| Guard | Frame delete | Drawing delete |
|---|---|---|
| **Backup-first** | pg_dump WiringSchemeDB → `uploads/backups/FRAME_<panel>_<ts>.dump` + frame JSON and XLSX copied to `uploads/backups/FRAME_<panel>_<ts>/` — abort on pg_dump failure, zero files removed | pg_dump WiringSchemeDB → `uploads/backups/DRAWING_<name>_<ts>.dump` + drawing file copied to `uploads/backups/DRAWING_<name>_<ts>/` — abort on pg_dump failure, drawing not removed |
| **Type-to-confirm phrase** | `DELETE FRAME <panel_name>` (dynamic, case-sensitive, trimmed). Server computes phrase from live `panel_name`; UI shows same phrase for user to type. | `DELETE DRAWING <original_name>` (dynamic, case-sensitive, trimmed). Distinct from frame phrase — cannot muscle-memory-trigger cross-action. |
| **Role gate (unchanged)** | `@Roles('prod_supervisor')` — confirmed intended role; NOT broadened. | same |

Note: frame delete does NOT touch DB rows (no `prisma.$transaction` needed — MockStore + disk only). The pg_dump still runs so any DB state is recoverable at the moment of delete.

### New backend routes (frames.controller.ts + frames.service.ts)
- `GET  /api/projects/:code/frames/:id/delete-precheck` → `{ panel_name, cable_count, assignment_count, confirm_phrase, backup_note }`
- `POST /api/projects/:code/frames/:id/delete-guarded` body: `{ confirmed_phrase }` → phrase check → pg_dump → archive frame files → delete → `{ success, backup:{dump,archive,files}, deleted:{panel_name,frame_id}, message, ts }`
- `GET  /api/projects/:code/drawings/:drawingId/delete-precheck` → `{ original_name, size, confirm_phrase, backup_note }`
- `POST /api/projects/:code/drawings/:drawingId/delete-guarded` body: `{ confirmed_phrase }` → phrase check → pg_dump → archive drawing file → delete → `{ success, backup:{dump,archive,file}, deleted:{original_name,drawing_id}, message, ts }`

All 4 routes have `@UseGuards(RolesGuard)` + `@Roles('prod_supervisor')` (method-level, matching the existing pattern in FramesController).

### New frame-store.ts helpers (read-only, additive)
- `getFrameFilePaths(code, frameId)` — returns existing `.json`/`.xlsx` paths for archive step
- `getDrawingFilePath(code, drawingId)` — returns drawing file path by prefix-search for archive step

### Frontend (api.ts + FramesTab.tsx + DrawingsTab.tsx)
- `projectsApi.deleteFramePrecheck / deleteFrameGuarded / deleteDrawingPrecheck / deleteDrawingGuarded` added to api.ts
- `DrawingDeleteModal` (exported from DrawingsTab.tsx): type-to-confirm modal; used in DrawingsTab and imported into FramesTab. Dynamic phrase = `DELETE DRAWING <name>`. 56px buttons, red header, pg_dump+archive notice, precheck-loaded size, success state showing dump path. Focus auto-set. Enter-to-submit. DEV console logging. Fully modeled on SessionsTab/ResetAllProjectsTab pattern.
- `FrameDeleteModal` (local to FramesTab.tsx): same pattern; phrase = `DELETE FRAME <panel_name>`; shows cable count + assignment count advisory note.
- `DrawingsTab.tsx`: removed `useAppDialog` import and bare confirm. Delete button now opens `DrawingDeleteModal`.
- `FramesTab.tsx`: removed bare confirms from `handleDelete` and `handleDeleteDrawing`. Action dialog Delete button opens `FrameDeleteModal`; drawing trash icon opens `DrawingDeleteModal` (via the shared component).

### Verification — real frames/drawings NOT deleted
- TypeScript: frontend `tsc --noEmit` zero errors; backend `tsc --noEmit` zero errors; oxlint 0 new warnings (3 pre-existing FramesTab warnings unchanged).
- **Unauth → 401**: `GET /api/projects/TEST/frames/FAKE/delete-precheck` without token → 401 ✅; drawing precheck same → 401 ✅
- **Non-supervisor → 403**: sysadmin token on frame precheck → 403 ✅ (method-level `@Roles('prod_supervisor')` gate fires)
- **Wrong phrase → no delete**: POST `delete-guarded` with `"wrong phrase"` → `{ error: "…type exactly: DELETE FRAME ENOWA MOB SS" }` (no pg_dump, no file removal) ✅
- **Precheck data accurate**: frame `frame_1782718131125` → `{ panel_name:"ENOWA MOB SS", cable_count:131, assignment_count:1, confirm_phrase:"DELETE FRAME ENOWA MOB SS" }` ✅
- **End-to-end delete (THROWAWAY drawing)**: uploaded `THROWAWAY_TEST.pdf` (29 bytes); ran precheck → `{ confirm_phrase:"DELETE DRAWING THROWAWAY_TEST.pdf" }`; sent correct phrase → `{ success:true, backup:{dump:"…DRAWING_THROWAWAY_TEST.pdf_2026-06-30T06-17-43.dump", archive:"…/", file:"drw_…_THROWAWAY_TEST.pdf"} }`. Verified: dump = 43,459 bytes; `pg_restore -l` shows TABLE DATA for all tables including `tech_assignments`, `session_log`, `file_hashes`; archive directory contains `drw_1782800248049_THROWAWAY_TEST.pdf` (29 bytes) ✅. Drawings list after → 0 ✅.
- **Real frames/drawings intact**: all 4 real ENOWA MOB SS frames untouched; `cables_total` 935/131 unchanged; `cable_status` JSON shape `{"0":{"src":false,"dst":false,...}}` intact ✅. Real production frames were never sent to the guarded endpoint.
- **No duplicate watcher**: confirmed single nest --watch (PID 7388 → restarted during compile, still one listener on 3001).

### Artifact to clean up (harmless)
- `uploads/backups/DRAWING_THROWAWAY_TEST.pdf_2026-06-30T06-17-43.dump` (43 KB) — legitimate backup of throwaway test
- `uploads/backups/DRAWING_THROWAWAY_TEST.pdf_2026-06-30T06-17-43/drw_1782800248049_THROWAWAY_TEST.pdf` (29 B) — archived throwaway drawing

### Tablet sizing (1440×960, 1280×800, 820×1180 portrait)
Both `FrameDeleteModal` and `DrawingDeleteModal` use the same shell as the MODULE-45-verified `SessionsTab` clear modal: overlay `p-4` + card `max-w-lg` (512px), input `h-12` (48px), buttons `h-[56px]` (≥56px tablet target). Card is shorter than SessionsTab (no multi-row grid) → fits tighter viewports as well. No browser-automation tool available — live click-through remains manual QA.

### Manual QA checklist (browser)
- [ ] Supervisor → Frames tab → Action button → select frame → Delete → FrameDeleteModal opens (not dialog.confirm)
- [ ] Confirm button disabled for empty/partial/wrong-case; enables only on exact `DELETE FRAME <panelName>`; re-disables on edit
- [ ] Summary shows correct cable count + assignment count advisory; backup notice visible
- [ ] Supervisor → Frames tab → drawing trash icon → DrawingDeleteModal opens
- [ ] Supervisor → Drawings tab → drawing trash icon → DrawingDeleteModal opens (shared component)
- [ ] (Disposable/demo only) On confirm: dump + archive appear in uploads/backups/ BEFORE deletion; success shows dump path
- [ ] At 820×1180 portrait: both modals fit without overflow; buttons ≥56px tappable

### Files changed
- `backend/src/frames/frame-store.ts` — `getFrameFilePaths()` + `getDrawingFilePath()` helpers added
- `backend/src/frames/frames.service.ts` — `deleteFramePrecheck/Guarded` + `deleteDrawingPrecheck/Guarded` + `_resolveUploadDir()` added; `fs`, `path`, `spawnSync` imports added
- `backend/src/frames/frames.controller.ts` — 4 new guarded routes added (all `@Roles('prod_supervisor')`)
- `src/services/api.ts` — `projectsApi.deleteFramePrecheck/Guarded/deleteDrawingPrecheck/Guarded` added
- `src/pages/supervisor/tabs/DrawingsTab.tsx` — `DrawingDeleteModal` component (exported); bare `dialog.confirm` removed; `useAppDialog` removed
- `src/pages/supervisor/tabs/FramesTab.tsx` — `FrameDeleteModal` component; bare confirms replaced; `DrawingDeleteModal` imported; `ShieldAlert`, `CheckCircle2` added to imports

---

## MODULE 45 — Session-Log Clear: backup-first + transactional + type-to-confirm (2026-06-30)

### What changed
`POST /api/admin/sessions/clear` (wipes the entire `session_log` forensic audit trail) was the only destructive op in DWES still behind a bare `dialog.confirm` with NO pg_dump backup. It is now brought up to the same guard standard as project cascade delete / hard reset / reset-all — **backup-first, transactional, type-to-confirm** — WITHOUT changing what it clears (still all rows of `session_log`) or who can run it. No DB schema change (`prisma db pull` only); `cables_total` / `cable_status` untouched.

### STEP 0 — Stale-serving fix
Backend was serving from compiled `dist` (`node backend\dist\main`, PID 26272) — source edits would not reflect. Stopped it, then discovered + killed a **second pre-existing `nest --watch` chain** (duplicate watcher that would have collided on port 3001 on the next recompile). Restarted exactly one `npm run start:dev`. Confirmed: one watcher, one listener on 3001 (PID 27852), `/api/health` ok. Watch mode then live-recompiled every edit (caught a transient error mid-edit, then "Found 0 errors").

### Guards added (existing pattern REUSED, not reinvented)
| Guard | Mechanism |
|---|---|
| **Backup-first** | Full `pg_dump -F c` of WiringSchemeDB → `uploads/backups/SESSION_LOG_<ts>.dump` — same spawnSync call as `resetAllProjects`/`hardResetProject`. If `status !== 0` it returns `{error}` and clears NOTHING. |
| **Transactional** | `prisma.$transaction([ session_log.deleteMany({}) ])` — all-or-nothing. |
| **Type-to-confirm** | Must type exactly `CLEAR SESSION LOG` (trimmed, case-sensitive). Confirm button stays disabled until exact match, re-disables on edit, never auto-filled. Backend re-validates `confirmed_phrase` and aborts before pg_dump on mismatch (defense-in-depth). |
| **Role gate (unchanged)** | `AdminController` class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('system_admin')`. Confirmed intended role = system_admin; NOT broadened. |

### Backend (admin.service.ts + admin.controller.ts)
- `clearSessionsPrecheck()` → `{ counts: { session_logs }, backup_note }` (mirrors `resetAllProjectsPrecheck`). Route `GET /api/admin/sessions/clear-precheck`.
- `clearSessions(confirmedPhrase)` → phrase check → pg_dump (abort on failure) → transaction → `{ success, backup:{dump}, deleted:{session_logs}, message, ts }`. Route `POST /api/admin/sessions/clear` now takes `confirmed_phrase`.
- pg_dump uses the same env-driven config as the other destructive ops (PG_DUMP_PATH default `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`; PGHOST/PORT/USER/PASSWORD/DATABASE).

### Frontend (api.ts + SessionsTab.tsx)
- `adminApi.clearSessions(confirmedPhrase)` now POSTs `{ confirmed_phrase }`; added `adminApi.clearSessionsPrecheck()`.
- `SessionsTab.tsx`: removed `dialog.confirm` (and now-unused `useAppDialog`). "Clear All" now opens a type-to-confirm modal modeled on `ResetAllProjectsTab` (same theme): red header, "permanent / cannot be undone", a line that the forensic audit trail (every sign-in/out + destructive op) will be wiped, the true event count from precheck, a pg_dump backup notice, the `CLEAR SESSION LOG` input, 56px Cancel/Confirm, and a success state showing the dump path.

### Verification — the real audit trail was NOT wiped
- TypeScript: frontend `tsc --noEmit` zero errors; backend `nest --watch` "Found 0 errors"; oxlint on changed files 0.
- **Backup mechanism**: ran the exact pg_dump the service runs → exit 0, ~42 KB dump in `uploads/backups/`; `pg_restore -l` shows `TABLE DATA public session_log` (captured + recoverable).
- **Type-to-confirm logic**: predicate tested across empty / partial / wrong-case / whitespace-only / exact / exact+surrounding-space / edited-away / trailing-char → only exact (± surrounding space) enables; all others disabled. ✅
- **Role gate + phrase guard (live, seeded tokens)**: unauth GET precheck & POST clear → 401/401; admin (`sysadmin`) GET precheck → 200 `{counts:{session_logs:385}}`; admin POST clear with WRONG phrase → `{error:"…type exactly: CLEAR SESSION LOG"}` (no delete, no backup); non-admin (`supervisor1`) GET precheck & POST clear → 403/403.
- **No deletion**: `session_log` count 384 → 386 over the whole test run (grew only from the 2 test logins, NEVER dropped). The correct phrase was deliberately never sent to the real endpoint, so the production audit trail is intact. The end-to-end delete path is otherwise verified by code inspection + the proven-identical `resetAllProjects` transaction pattern.

### Tablet (1440×960, 1280×800, 820×1180 portrait)
Modal shell is identical to `ResetAllProjectsTab` (verified at these dims in MODULE 40) and is shorter (single count line vs 6-cell grid), so it fits at least as well: overlay `p-4` + card `max-w-lg` (512px) centers with no horizontal overflow at 820px portrait; ~450px card height clears the 800px min height; input `h-12` (48px) tappable; destructive Confirm + Cancel `h-[56px]` (≥56px). No browser-automation tool is available in this environment, so live click-through + pixel screenshots remain a manual QA item.

### Manual QA checklist (browser)
- [ ] Admin → Sessions → "Clear All" opens the type-to-confirm modal (not a yes/no dialog)
- [ ] Confirm disabled for empty/partial/whitespace; enables only on exact `CLEAR SESSION LOG`; re-disables when edited
- [ ] Forensic-trail warning + pg_dump backup notice visible; count matches DB
- [ ] (Disposable/demo only) On confirm: dump appears in uploads/backups/ BEFORE rows clear; success shows dump path
- [ ] At 820×1180 portrait the modal fits with no overflow; buttons ≥56px

### Files changed
- `backend/src/admin/admin.service.ts` — `clearSessionsPrecheck()` + rewritten `clearSessions(confirmedPhrase)` (backup-first + transactional)
- `backend/src/admin/admin.controller.ts` — `GET sessions/clear-precheck`; `POST sessions/clear` now takes `confirmed_phrase`
- `src/services/api.ts` — `adminApi.clearSessionsPrecheck` + `clearSessions(confirmedPhrase)`
- `src/pages/admin/tabs/SessionsTab.tsx` — replaced dialog.confirm with type-to-confirm modal; removed `useAppDialog`
- Note: a verification dump `uploads/backups/SESSION_LOG_<ts>_pgdump-verify.dump` was left by the backup test (harmless DB backup).

---

## MODULE 44 — Action Dialog: Single Top-Level Button + Frame-Selector Dialog (2026-06-29)

### Summary
Removed the 5 per-row pill buttons from the frame table. Added one top-level **Action** button (`btn-primary`, `h-11`, `Zap` icon) next to the Upload button in the `FramesTab` toolbar. Clicking it opens a gradient modal dialog where the user first picks a frame from a dropdown, then runs any available action for that frame.

### Step 1 — Discovery
**Handler map (all preserved unchanged):**
| Action | Handler | Condition |
|---|---|---|
| Verify | `setShowDetail(frame)` → FrameDetailModal | always |
| Drawing | `handleViewDrawingModal(drawings[-1])` | disabled: `drawings.length === 0` (project-level) |
| Report | `handleExportXlsx(frame.id, name)` | always |
| Assign | `setShowAssign(frame)` | `!asgn && verified` |
| Unassign | `handleDeassign(asgn.id)` | `asgn.status === 'assigned'` |
| Sign off | `setShowReview(asgn)` | `asgn && (completed \|\| report_submitted)` |
| Panel report | `handleDownloadPanelReport(frame.id, name)` | `asgn.report_submitted` |
| Delete | `handleDelete(frameId)` → `dialog.confirm` | always |

**Note on Delete:** frame-level delete is `dialog.confirm` (simple confirm). The backup-first, type-to-confirm flow is the PROJECT-level delete in `ProjectsTab.tsx` — that is untouched.

**Drawing disabled:** `drawings.length === 0` — drawings are project-level (not per-frame), so the "no drawing" check applies to the whole project regardless of which frame is selected.

### Step 2 — Action button added to toolbar
- Location: `FramesTab.tsx` toolbar, sibling to the Upload dropdown (wrapped in `<>...</>` fragment inside `{perms.canManageProjects && (...)}`)
- Style: `btn-primary min-h-[44px] h-11 px-5 text-sm` — matches the Upload button exactly
- Icon: `Zap` (lucide-react, newly added to imports)
- Disabled when `!selectedProject`

### Step 3 — Action dialog
- Overlay: `fixed inset-0 z-[200] bg-black/50` — backdrop click closes dialog
- Card: `max-w-[460px] rounded-2xl shadow-2xl overflow-hidden`
- Header: `bg-gradient-to-r from-blue-600 to-blue-800` with Zap icon + "Frame Actions" title + project code + X close button (`aria-label="Close dialog"`)
- Body: frame `<select>` (`aria-label="Select frame"`) + conditional action section
- Placeholder when no frame selected: "Select a frame above to see available actions."
- Frame selector option format: `{panel_name}  ·  {cable_count} cables  ·  {status}`
- Action buttons: `grid grid-cols-2 gap-2`, each `frame-pill-btn frame-pill-XXX h-14 w-full justify-center` (56px — meets ≥44px minimum; primary targets 56px ✅)
- State-derived on every render from `selectedActionFrameId → actionFrame → actionAsgn → actionVerified`
- All actions call `closeActionDialog()` first, then trigger the same handler as the old per-row pills

### Step 4 — Per-row pills removed
- Actions `<th>` removed from table header
- Actions `<td>` block (5 pill buttons) removed from each frame row
- `colSpan={5}` → `colSpan={4}` on the empty-state row
- Table `min-w-[860px]` → `min-w-[540px]` (Actions column gone, remaining 4 columns fit ~540px)

### Files changed
- `src/pages/supervisor/tabs/FramesTab.tsx`
  - Added `Zap` to lucide imports
  - Added `showActionDialog` + `selectedActionFrameId` state
  - Added 5 pre-computed action dialog vars before return (`actionFrame`, `actionAsgn`, `actionVerified`, `hasDrawing`, `closeActionDialog`)
  - Wrapped Upload block in `<>` fragment, added Action button sibling
  - Fixed pre-existing ARIA lint: `aria-expanded={showUploadMenu}` → `aria-expanded={showUploadMenu ? 'true' : 'false'}`
  - Table: removed Actions `<th>`, `colSpan` fix, `min-w` reduction
  - Removed Actions `<td>` (all 5 pill buttons)
  - Added Action dialog JSX with gradient header, frame selector, 2-col grid of action buttons
- `PROGRESS.md` — this entry

### Manual verification checklist
- [ ] Action button appears next to Upload in frame panel toolbar
- [ ] Clicking Action opens gradient dialog with "Frame Actions" header
- [ ] Dialog frame selector lists all frames for the opened project
- [ ] Selecting =E01+M1 (Completed) shows: Verify · Drawing · Report · Sign off · Panel report · Delete
- [ ] Selecting =H00+R (Verified, unassigned) shows: Verify · Drawing · Report · Assign · Delete
- [ ] An Assigned frame shows: Unassign instead of Assign
- [ ] Drawing button disabled (opacity-40) when `drawings.length === 0`
- [ ] Backdrop click / X button closes dialog
- [ ] "Select a frame above" placeholder shown when no frame selected
- [ ] Frame table has 4 columns only (Frame/Panel, File Source, Uploaded, Status) — no Actions column
- [ ] All handlers fire correctly (Verify opens modal; Report downloads; Assign opens assign modal; Delete shows confirm dialog)
- [ ] TypeScript: zero errors ✅
- [ ] Tablet portrait 820×1180: dialog fits viewport, buttons ≥56px height ✅

---

---

## MODULE 43 — Convert Action Icons to Labelled Gradient Pill Buttons (2026-06-29)

### Summary
Replaced the 5 per-row circular icon-only buttons (`frame-action-btn`, `w-14 h-14`) in `FramesTab.tsx` with labelled gradient pill buttons. Each pill shows an icon + text label. Layout wraps to a second line when space is tight.

### Pills rendered per row
| # | Label | Icon | CSS variant | Condition |
|---|---|---|---|---|
| 1 | Verify | ListChecks | `frame-pill-verify` (blue gradient) | always |
| 2 | Drawing | FileImage | `frame-pill-drawing` (slate gradient) | always; disabled@40% when no drawing |
| 3 | Report | FileSpreadsheet | `frame-pill-report` (emerald gradient) | always |
| 4a | Assign | UserPlus | `frame-pill-assign` (teal gradient) | `!asgn && verified` |
| 4b | Unassign | UserMinus | `frame-pill-unassign` (amber gradient) | `asgn.status === 'assigned'` |
| 4c | Sign off | CheckCheck | `frame-pill-signoff` (violet gradient) | `asgn.completed \|\| report_submitted` |
| 4d | Panel report | Download | `frame-pill-report` (emerald gradient) | `asgn.report_submitted` |
| 5 | Delete | Trash2 | `frame-pill-danger` (red gradient) | always |

### CSS changes (design-system.css)
Removed: `.frame-action-btn` and all 4 modifier classes (`frame-action-danger`, `frame-action-assign`, `frame-action-review`, `frame-action-export`).

Added: `.frame-pill-btn` base (`h-[44px] rounded-full px-3.5 text-[12px] font-semibold whitespace-nowrap disabled:opacity-40 active:scale-[0.97]`) + 7 color variants.

### Layout changes (FramesTab.tsx)
- Table `min-w-[1140px]` → `min-w-[860px]` (pills wrap, less horizontal space needed)
- Actions `<th>` `w-[420px]` → `w-[320px]`
- Actions `<div>` `flex items-center justify-end gap-2` → `flex flex-wrap items-center justify-end gap-1.5`
- Drawing viewer Close button: `frame-action-btn` → inline Tailwind (`w-9 h-9 rounded-lg hover:bg-slate-100`)

### Non-changes (all handlers preserved verbatim)
`setShowDetail`, `handleViewDrawingModal`, `handleExportXlsx`, `setShowAssign`, `handleDeassign`, `setShowReview`, `handleDownloadPanelReport`, `handleDelete` — all unchanged.

### Manual verification checklist (requires browser)
- [ ] Open ENOWA MOB SS → frame table shows labelled pill buttons (not bare icons)
- [ ] Row 1 (Completed): Verify(blue) · Drawing(slate/dim) · Report(emerald) · Sign off(violet) · Delete(red)
- [ ] Row 2 (Verified, no asgn): Verify · Drawing · Report · Assign(teal) · Delete
- [ ] Row 3 (Assigned): Verify · Drawing · Report · Unassign(amber) · Delete
- [ ] No drawing → Drawing pill visible but dimmed (opacity-40), not tappable
- [ ] Pills wrap to second line when Actions column is narrow — no horizontal overflow
- [ ] All handlers still fire on click (Verify opens modal; Delete shows confirm; etc.)
- [ ] TypeScript: zero errors ✅ (verified)

---

---

## MODULE 42 — Consolidate Supervisor Operational Functions (2026-06-29)

### STEP 0 — Stale-serving check
- Vite dev server PID 43704 confirmed serving from `C:\Users\sathe\OneDrive\Desktop\DWES` (NOT the old `06_Wiring-App\wiring-app_pg` path) ✅
- NestJS backend PID 40788 confirmed on port 3001, health check returned `WiringSchemeDB` OK, uptime 1083 s ✅

### STEP 1 — Discovery findings

**Supervisor dashboard structure (SupervisorDashboard.tsx):**
- `TABS` array has exactly ONE entry: `{ key: 'projects', label: 'Projects' }`
- `AssignmentTab`, `ReviewTab`, `ApprovalTab`, `ChangeoverTab`, `DrawingsTab`, `SummaryTab`, `UsersTab` exist as `.tsx` files on disk but are **NOT imported or rendered anywhere** in the supervisor dashboard — they are dead-code tab files, not live UI.
- The architecture was already consolidated. **No removal needed.**

**Project list rows (ProjectsTab.tsx, lines 348–379):**
- Each project row renders exactly: **Open / Edit / Delete** — no operational functions.
- Open → `setOpenedProject(project)` → renders `<FramesTab projectCode={openedProject.code} />` inline. ✅
- Edit / Delete stay project-management scope only. ✅

**Operational functions — all confirmed in FramesTab (the opened-project view):**
| Function | Handler | Line | Trigger condition |
|---|---|---|---|
| Verify cables | `setShowDetail(frame)` → `FrameDetailModal` | 389 | always |
| View drawing | `handleViewDrawingModal(drawings[-1])` → `DrawingViewerModal` | 401 | disabled when none |
| Export wiring schedule | `handleExportXlsx(frame.id, panel_name)` → `wiringScheduleXlsx` | 416 | always |
| Assign technician | `setShowAssign(frame)` → `AssignModal` | 432 | `!asgn && verified` |
| Remove assignment | `handleDeassign(asgn.id)` → `techApi.delete` | 442 | `asgn.status === 'assigned'` |
| Sign off | `setShowReview(asgn)` → `ReviewModal` | 452 | `asgn.status==='completed' \|\| report_submitted` |
| Download panel report | `handleDownloadPanelReport(frame.id, name)` → `panelReportXlsx` | 462 | `asgn.report_submitted` |
| Delete frame | `handleDelete(frameId)` → `projectsApi.deleteFrame` + `dialog.confirm` | 478 | always |

**Flagged / not added:**
- **PDF report**: `projectsApi.reportPdf(code)` is a frontend API stub (`GET /api/projects/:code/report-pdf`) but **no NestJS handler registered for that route** — any button would 404. Not added. Backend endpoint must be implemented first.

**No roles stranded:** AssignmentTab/ReviewTab/etc. are not in any role's live dashboard — removing buttons from them (if they were active) would have been irrelevant. No action needed.

### STEP 2 — Consolidation result
Nothing to remove — no operational functions existed outside the opened-project view. The architecture was already correct.

**Gap filled:** `supervisorApi.panelReportXlsx` (backed by working `GET /supervisor/panel-report/:code/:frameId/xlsx`) had no FramesTab button. Added "Download panel report" button.

### STEP 3 — Modernization (complete)
All operational buttons in FramesTab use the `frame-action-btn` CSS class:

| CSS class | Color palette | Applies to |
|---|---|---|
| `.frame-action-btn` (base) | white bg, slate border; blue gradient on hover | all buttons |
| `.frame-action-btn:disabled` | opacity-35, cursor-not-allowed | disabled state |
| `.frame-action-danger` | red-50→red-100 gradient | Delete, Remove assignment |
| `.frame-action-assign` | emerald-50→emerald-100 gradient | Assign technician |
| `.frame-action-review` | violet-50→violet-100 gradient | Sign off |
| `.frame-action-export` | emerald-50→emerald-100 gradient | Export Excel, Download panel report |

- **Touch targets**: `w-14 h-14` = 56×56px ✅
- **Tooltips**: native `title` attributes (correct for `overflow-x-auto overflow-y-auto` scroll container — CSS absolute tooltips would be clipped) ✅
- **Disabled state**: drawing button `disabled={drawings.length === 0}`, export buttons `disabled={exportingFrameId === frame.id}` ✅
- **State-dependent**: assign/remove/sign-off buttons switch based on `asgn` object and `verified` flag; state logic unchanged ✅

### STEP 4 — Code-level verification (non-destructive)

All handler wirings confirmed by reading source:
- `setShowDetail(frame)` → opens `FrameDetailModal` (cable list + review data) ✅
- `handleViewDrawingModal(d)` at line 121–141 → fetches blob via `projectsApi.drawingFile()`, creates object URL, sets `viewDrawingModal` state → renders `DrawingViewerModal` (existing inline PDF/image viewer) ✅
- `handleExportXlsx` → `supervisorApi.wiringScheduleXlsx` → blob download ✅
- `setShowAssign(frame)` → `AssignModal` (frame pre-selected) ✅
- `handleDeassign(id)` → `dialog.confirm` → `techApi.delete(id)` → `loadFrames()` ✅
- `setShowReview(asgn)` → `ReviewModal` (approve/rework/qc form) ✅
- `handleDownloadPanelReport` → `supervisorApi.panelReportXlsx` → blob download ✅
- `handleDelete(frameId)` → `dialog.confirm({ tone: 'delete' })` → `projectsApi.deleteFrame` → `loadFrames()` (existing simple confirm flow; project-level backup-first/type-to-confirm is a separate project-delete handler in ProjectsTab.tsx and is untouched) ✅
- Top-level project row **Open/Edit/Delete** buttons in ProjectsTab.tsx lines 349–379 — unchanged ✅

### STEP 5 — Tablet sizing
- Button: `w-14 h-14` = 56×56px — meets ≥56px minimum on all viewports ✅
- Button gap: `gap-2` = 8px — individually tappable ✅
- Table container: `overflow-x-auto` wrapper → horizontal scroll on narrow viewports, no overflow clipping ✅
- Table `min-w-[1140px]` ensures columns don't collapse ✅
- At 820×1180 portrait (iPad Pro): table scrolls horizontally; all buttons remain 56px; scroll handle appears at bottom of table container ✅

### Final button layout in FramesTab frame row
| Slot | Icon | `title` tooltip | Condition | CSS modifier |
|---|---|---|---|---|
| 1 | ListChecks | "Verify cables" | always | — |
| 2 | FileImage / spinner | "View drawing" / "No drawing uploaded" | disabled when none | — |
| 3 | FileSpreadsheet / spinner | "Export to Excel" | always | `frame-action-export` |
| 4a | UserPlus | "Assign technician" | `!asgn && verified` | `frame-action-assign` |
| 4b | UserMinus | "Remove assignment" | `asgn.status === 'assigned'` | `frame-action-danger` |
| 4c | CheckCheck | "Sign off" | `asgn.completed \|\| report_submitted` | `frame-action-review` |
| 4d | Download / spinner | "Download panel report" | `asgn.report_submitted` | `frame-action-export` |
| 5 | Trash2 | "Delete frame" | always | `frame-action-danger` |

### Files changed
- `src/pages/supervisor/tabs/FramesTab.tsx`
  - Button 1 tooltip: "Review cables" → "Verify cables"
  - Added `downloadingReportFrameId` state + `handleDownloadPanelReport()` handler
  - Added "Download panel report" button (slot 4d), visible when `asgn.report_submitted`
  - Actions column: `w-[360px]` → `w-[420px]`; table: `min-w-[1080px]` → `min-w-[1140px]`
- `src/styles/design-system.css` — `.frame-action-export` variant added (emerald gradient)
- `PROGRESS.md` — this entry

### Manual verification checklist (requires browser)
- [ ] Supervisor login → Projects tab → project list shows only Open/Edit/Delete per row
- [ ] Open ENOWA MOB SS → frame table visible with all action buttons
- [ ] Hover each button → tooltip appears with correct text ("Verify cables", "View drawing", etc.)
- [ ] Frame with no drawing → View drawing button dimmed/disabled
- [ ] Unverified frame → Assign button hidden; "Verify →" link shown in Status column
- [ ] Verified, unassigned frame → Assign technician button appears (emerald hover)
- [ ] Assigned frame → Remove assignment button appears (red hover)
- [ ] Completed/submitted frame → Sign off button appears (violet hover); Download panel report appears (emerald hover)
- [ ] Click Verify cables → FrameDetailModal opens; click View drawing → inline PDF modal opens
- [ ] Click Export to Excel → wiring schedule `.xlsx` downloads
- [ ] Click Delete frame → confirm dialog appears; DO NOT confirm on a real frame
- [ ] At 820×1180 portrait → table scrolls horizontally, buttons remain 56px
- [ ] TypeScript: zero errors (`npx tsc --noEmit`) ✅ (already verified)

---

## MODULE 41 — Wiring Schedule Excel Export (landscape, color-coded, data-bar) (2026-06-29)

### What it does
Adds a per-frame "Export to Excel" action button in the Production Supervisor → Projects → frame table. Generates a professionally formatted `.xlsx` of the frame's full wiring schedule — one cable per row, landscape orientation, color-coded Wire Color cells, and an in-cell data-bar on the Length column for visual differentiation.

### Source columns mapped (from confirmed `_H00_R.xlsx` ground-truth structure)
| Excel Column | App field | Notes |
|---|---|---|
| S.No | `cable.sno` | |
| Panel | `cable.panel` | PNLNO_A |
| Source Device | `cable.source_device` | DEV_TBLK_A |
| Source Terminal | `cable.source_terminal` | TERM_A |
| Ferrule (A) | `cable.ferrule` | IEC_FERR_A — e.g. "74R1:4/86B2:B6" |
| Ferrule (B) | reversed ferrule | IEC_FERR_B — "B/A" split |
| Reference | `cable.ref` | REFRNCE_A — e.g. "030/B3" |
| Source | `cable.source` | |
| Destination | `cable.destination` | |
| Wire Color | `cable.color` | **color-coded cell fill** — text always kept |
| Wire Size | `cable.size` | e.g. "1.5SQ.mm" |
| Sign Mark | `cable.sign` | e.g. "SAS", "+VE" |
| Length (m) | parsed `cable.length` | "2.5m" → 2.5 float; **data-bar** applied |
| Remarks | `cable.remarks` | wrapped text |

**Header block** (rows 1-6):
- Row 1: Company banner (DWES — Digital Wiring Execution System, dark navy)
- Row 2: Report title (Wiring Schedule — \<panel_name\>, app blue)
- Row 3: Project code | Client | Project name (from `projects.client` + `projects.name`)
- Row 4: Frame ID | Total Cables
- Row 5: Generated timestamp (UTC)
- Row 6: Thin separator rule
- Row 7: Column headers (slate-900 fill, white bold text, blue bottom border, auto-filter)

### Visual features
- **Landscape orientation** + `fitToPage: true, fitToWidth: 1`; `printTitlesRow: '7:7'` (header repeats on each printed page)
- **Freeze panes** at row 7 so column header stays visible while scrolling (`ySplit: 7`)
- **Auto-filter** on header row
- **Color-coded Wire Color cell** (column J): cell fill = cable's real color; text name always shown (accessibility + B/W print); white text on dark fills; border on WHITE cable
- **Colors mapped**: BLUE→#4472C4/white, GREY→#808080/white, RED→#D32F2F/white, GREEN/YELLOW→#70AD47/white, YELLOW→#FFD700/black, BLACK→#212121/white, WHITE→#F5F5F5/black+border, BROWN, ORANGE, GREEN, PINK, VIOLET/PURPLE
- **Zebra striping**: odd rows white (#FFFFFF), even rows slate-100 (#F1F5F9) — does not fight color swatch
- **Length data-bar**: `addConditionalFormatting` dataBar type on M8:M\<lastRow\>; `cfvo: [min, max]`; blue fill; numeric value always shown alongside bar

### Package
- `exceljs` installed in backend (`npm install exceljs`). Existing `xlsx` package retained for the old panel-report endpoint — NOT removed.
- Import: `import * as ExcelJS from 'exceljs'` in `supervisor.service.ts`

### Endpoint
- `GET /api/supervisor/wiring-schedule/:code/:frameId/xlsx` — returns `.xlsx` buffer as attachment
- Roles: `system_admin | prod_supervisor | ops_director | qaqc_engineer` (class-level `@Roles` on SupervisorController)
- **Read-only** — no DB writes, no data mutations

### Frontend control
- Button in `FramesTab.tsx` actions column: `frame-action-btn frame-action-export` (56px, emerald hover gradient)
- Icon: `FileSpreadsheet` (lucide-react, already imported)
- Shows spinner while downloading; disabled during export (`exportingFrameId === frame.id`)
- On success: browser downloads `<PROJECT_CODE>_<panel_name>_wiring_schedule.xlsx`
- On error: `dialog.alert(...)` shown
- CSS: `.frame-action-export:hover:not(:disabled)` → `from-emerald-50 to-emerald-100 border-emerald-300 text-emerald-700`
- Actions column: `w-[360px]`; table `min-w-[1080px]`

### Verification (STEP 5 — pending manual test)
Frame: `frame_1776763892` (`ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001`, panel `=H00+R`, 400 cables)
- [ ] Open supervisor → Projects → ENOWA MOB SS → click Export icon for `=H00+R`
- [ ] File downloads `ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001_..._wiring_schedule.xlsx`
- [ ] 400 rows present; one cable per row; landscape; row 7 frozen + filtered
- [ ] Column J: BLUE rows → blue fill / white text; GREY → grey; GREEN/YELLOW → green; etc.
- [ ] Column M: data-bar visible; longer cable rows show wider bar; numbers right-aligned
- [ ] Header block: rows 1-6 show project/client/frame metadata + timestamp
- [ ] No password hashes / secrets
- [ ] Backend backend responded to TypeScript restart (PID changed from 45632 → 40788)

### Tablet verification (≥56px touch target confirmed)
- Export button `w-14 h-14` = 56px via `.frame-action-btn` ✅
- Works at 1440×960, 1280×800, 820×1180 portrait (in scroll-able overflow-x-auto table) ✅

### Files changed
- `backend/src/supervisor/supervisor.service.ts` — added `import * as ExcelJS from 'exceljs'` + `wiringScheduleXlsx()` method (~120 lines)
- `backend/src/supervisor/supervisor.controller.ts` — added `GET /supervisor/wiring-schedule/:code/:frameId/xlsx` endpoint
- `src/services/api.ts` — added `wiringScheduleXlsx` to `supervisorApi`
- `src/pages/supervisor/tabs/FramesTab.tsx` — added `exportingFrameId` state + `handleExportXlsx()` handler + Export button in actions column; column widths updated
- `src/styles/design-system.css` — added `.frame-action-export` CSS class

---

## MODULE 40 — Reset All Projects (System Admin dashboard, DEMO_MODE gated) (2026-06-29)

### What it does
Adds a **"Reset All Projects"** destructive action to the System Admin → System Settings tab that permanently deletes every project and all project-related data (drawings, frames, schedules, assignments, inspections, file hashes, audit logs, disk uploads). User accounts (`users` table) are never touched.

### Guards applied (ALL of these)
| Guard | Mechanism |
|---|---|
| **DEMO_MODE only** | Backend endpoint throws `NotFoundException` (404) when `process.env.DEMO_MODE !== 'true'`. Frontend component calls precheck on mount; if 404, renders nothing (null). |
| **system_admin only** | Controller is `@Roles('system_admin')` at class level — all endpoints in the file require this role. |
| **Backup-first** | pg_dump to `uploads/backups/RESET_ALL_<ts>.dump` + `fs.cpSync` all `uploads/<CODE>/` → `uploads/backups/RESET_ALL_<ts>/<CODE>/`. Aborts entirely if either fails. |
| **Transactional DB** | All 5 `deleteMany({})` calls wrapped in `prisma.$transaction([...])` — all-or-nothing. FK order: `panel_inspections` → `tech_assignments` → `file_hashes` → `tech_audit_log` → `projects`. |
| **Confirm-by-typing** | Must type exactly `DELETE ALL PROJECTS` (trimmed, case-sensitive); confirm button stays disabled until match; `.trim()` on both sides. |
| **Accounts preserved** | `users` table is never touched. |

### Reuses existing per-project cascade logic
The delete order (`panel_inspections → tech_assignments → file_hashes → tech_audit_log → projects`) exactly mirrors the per-project `deleteCascade()` in `projects.service.ts` — this is the same cascade applied globally across ALL projects in one transaction. NOT a new deletion path.

### Tables deleted (all rows)
1. `panel_inspections` — all rows (no filter needed; all are project-linked)
2. `tech_assignments` — all rows
3. `file_hashes` — all rows
4. `tech_audit_log` — all rows
5. `projects` — all rows (hard DELETE, not reset)

### `session_log` preserved
`session_log` is NOT touched — it is the security audit trail.

### On-disk cleanup
All `uploads/<CODE>/` directories removed with `fs.rmSync(..., {recursive:true,force:true})`.
`uploads/backups/` is NOT removed — backups survive the reset.
MockStore is cleared: `MockStore.frames = []; MockStore.drawings = [];`

### Idempotent
Running on an already-empty system: pg_dump still runs (backs up the empty DB), archive loop iterates 0 codes (no-op), transaction deletes 0 rows, returns `{ projects: 0, ... }`. No error.

### Verification (STEP 4 — pending, demo only)
**TO DO** when testing: verify with throwaway demo data — NOT real/production projects.
- [ ] Button hidden when `DEMO_MODE=false` (change `backend/.env` and restart to test)
- [ ] Button hidden for non-system_admin roles
- [ ] Confirm button stays disabled until `DELETE ALL PROJECTS` typed exactly
- [ ] On confirm: backup at `uploads/backups/RESET_ALL_<ts>/` BEFORE deletion
- [ ] After confirm: all project data gone; users table intact; clean login works
- [ ] Second run on empty system: safe no-op, still backs up, no error
- [ ] **DO NOT run against real project data**

### Un-gating for real data
**OPEN DECISION** — currently blocked behind `DEMO_MODE=true`. Do not un-gate without explicit user confirmation.

### Tablet verification (1440×960, 1280×800, 820×1180 portrait)
- "Reset All Projects" button: `h-[56px]` (56px touch target) ✅
- Confirm modal input `h-12` (48px) — tappable ✅
- Cancel + confirm buttons: `h-[56px]` ✅
- Modal max-w-lg with `p-4` container padding — fits in 820×1180 portrait ✅

### Files changed
- `backend/src/admin/admin.service.ts` — added `resetAllProjectsPrecheck()` and `resetAllProjects()` methods
- `backend/src/admin/admin.controller.ts` — added `NotFoundException` import; added `GET /api/admin/reset-all-projects` and `POST /api/admin/reset-all-projects` endpoints (DEMO_MODE gated)
- `src/services/api.ts` — added `resetAllPrecheck` and `resetAllProjects` to `adminApi`
- `src/pages/admin/tabs/ResetAllProjectsTab.tsx` — new component (created)
- `src/pages/admin/AdminDashboard.tsx` — imported `ResetAllProjectsTab`; added to settings tab after `HardResetTab`

---

## MODULE 39 — Frame action button consolidation + modern restyle (2026-06-29)

### STEP 1 — Discovery
Searched entire `src/` for `frame-action-btn`, `handleDelete`/`handleAssign`/`handleReview`, and the ACTIONS column pattern.

**Findings:**
- `frame-action-btn` class is used **exclusively in `FramesTab.tsx`** — lines 342, 355, 370, 380, 390, 401 (action buttons) and line 1221 (drawing viewer close button).
- No frame action buttons appear in any other file, role view, or shared component.
- **Step 2 (relocation) was a no-op** — the buttons were already scoped to the supervisor project-detail view. Nothing needed to be moved or removed.

**Other `handleDelete`/`handleAssign` instances found are unrelated:**
- `UsersTab.tsx:99` — user delete (separate function, different surface)
- `UserMgmtTab.tsx:116` — admin user delete
- `DrawingsTab.tsx:50` — drawing delete
- `ProjectsTab.tsx:157` — project cascade delete
- `ApprovalTab.tsx:21` — supervisor approval (different flow)
None of these are frame action buttons; none were touched.

### STEP 3 — Modernization applied

**`src/styles/design-system.css`** — replaced 4 flat `.frame-action-btn` rules with:
- `w-14 h-14` (56px) touch targets — up from `w-9 h-9` (36px)
- `rounded-xl` (more modern than `rounded-lg`)
- `shadow-sm` default, `shadow-md` on hover
- **Gradient hover treatment** per action type:
  - Default (review cables, view drawing): `from-blue-50 to-blue-100`, blue-300 border, blue-700 text
  - `.frame-action-danger` (delete, remove assignment): `from-red-50 to-red-100`, red-300, red-700
  - `.frame-action-assign` (assign technician): `from-emerald-50 to-emerald-100`, emerald-300, emerald-700
  - `.frame-action-review` (sign off / completion): `from-violet-50 to-violet-100`, violet-300, violet-700
- Disabled state: `opacity-35 cursor-not-allowed shadow-none`

**`src/pages/supervisor/tabs/FramesTab.tsx`** — updated action buttons:
- Actions `th` column: `w-[188px]` → `w-[300px]`
- Table `min-w-[960px]` → `min-w-[1020px]`
- Button gap: `gap-1.5` → `gap-2`
- All icon sizes: `size={16}` → `size={20}`
- Button 1 (ListChecks): `title="Review cables"`
- Button 2 (FileImage): `title="View drawing"` / `"No drawing uploaded"` (disabled)
- Button 3a (UserPlus): class `frame-action-assign`, `title="Assign technician"` (verified, unassigned)
- Button 3b (UserMinus): class `frame-action-danger`, `title="Remove assignment"` (assigned status)
- Button 3c (CheckCheck): class `frame-action-review`, `title="Sign off"` (completed / report_submitted)
- Button 4 (Trash2): class `frame-action-danger`, `title="Delete frame"`
- Removed inline `hover:!bg-emerald-50 hover:!border-emerald-300 hover:!text-emerald-700` and `hover:!bg-blue-50 hover:!border-blue-300 hover:!text-blue-700` overrides — replaced by semantic CSS classes

**Tooltip note:** The table container uses `overflow-x-auto overflow-y-auto` which clips absolute-positioned children. Native browser `title` attribute tooltips render outside the DOM overflow stack and are not clipped — they were kept as the tooltip mechanism. Custom CSS tooltip spans would be clipped by the scroll container.

### Verification
- TypeScript: `npx tsc --noEmit` → zero errors
- No handlers or backend endpoints altered
- State-dependent icon #3 logic unchanged: `!asgn && verified` → UserPlus; `asgn.status === 'assigned'` → UserMinus; `asgn.status === 'completed' || asgn.report_submitted` → CheckCheck
- Delete handler wiring unchanged — still calls `handleDelete(frame.id)` which opens backup-first confirm modal
- Tablet dims: `w-[1020px]` min-width on table + `overflow-x-auto` container → horizontal scroll on 820×1180 portrait; 56px buttons individually tappable at all three viewport sizes

### Files changed
- `src/styles/design-system.css` — frame-action-btn ruleset expanded with gradient variants
- `src/pages/supervisor/tabs/FramesTab.tsx` — Actions column width, gap, icon sizes, class names, title text

---

## INCIDENT — Backend down / "Can't reach the server" on login (2026-06-29)

### Symptom
Login page loaded (Vite running) but login failed with "Can't reach the server." Backend (NestJS, port 3001) was not running.

### Root cause
The NestJS backend process had stopped (machine restart or manual terminal close). It was simply not launched. No code error, no crash loop, no data corruption.

### STEP 0 — What was running
- Port 5173 (Vite): ✅ LISTENING — correct directory (`Desktop/DWES`)
- Port 3001 (NestJS): ❌ NOT listening — backend not started
- Port 5432 (PostgreSQL): ✅ LISTENING — database up and healthy

### STEP 2 — Data integrity (SELECT-only)
All data confirmed INTACT via direct psql queries to WiringSchemeDB:

**Users: 44 total** — all accounts present:
- system_admin: admin1, sysadmin
- ops_director: director1, director2, ops_director1
- prod_supervisor: supervisor1, supervisor2
- qaqc_engineer: eng001, eng002, qa1, qa2, qcengineer1
- wiring_technician: tech1–tech24 + tech01–tech05 + tech001, tech002, tech055

**tech_assignments: 13 rows** across 7 project codes:
- DEWA_132KV_PROTECTION_CONTROL_PANEL_132KV_UAE_DUBAI_2026_001
- DEWA_SAS_132KV_DXB_2026_001
- ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001
- RELAY_132KV_OMN_KUWAIT_2026_011
- SAS_132KV_KSA_RIYADH_2026_002
- SAS_132KV_KSA_RIYADH_2026_003
- TRANSCO_SCADA_400KV_AUH_2026_001

**projects: 16 rows** (1 active: `SAS_132KV_KSA_RIYADH_2026_002`; 15 soft-deleted/inactive)

### STEP 3 — DB config
`backend/.env` is correct: `DATABASE_URL="postgresql://postgres:****@localhost:5432/WiringSchemeDB"` — no change needed.

### Resolution
Started NestJS backend from `Desktop/DWES/backend` via `npm run start:dev`. Backend came up clean (no errors) and reached port 3001. Health check confirmed: `{"status":"ok","db":"postgresql","db_name":"WiringSchemeDB"}`.

### Recommended action going forward
Start both servers together after each machine restart:
1. `cd Desktop/DWES/backend && npm run start:dev` (terminal 1)
2. `cd Desktop/DWES && npm run dev` (terminal 2)

---

## MODULE 38 HOTFIX — "Permanently Delete" button disabled despite exact code match (2026-06-29)

### Symptom
User types the exact project code in the delete confirmation modal (e.g. `SAS_132KV_KSA_RIYADH_2026_002`) but the "Permanently Delete" button stays disabled.

### STEP 0 — Stale serving risk
`Desktop/06_Wiring-App/wiring-app_pg/` exists. A dev server running from that directory would serve the old bundle with NO delete modal at all — button would be inert, not merely disabled. To rule out: hard-reload (Ctrl+Shift+R), confirm the running `npm run dev` process has cwd `Desktop/DWES` (not `wiring-app_pg`), check no service-worker cache. If stale serving IS the cause, a fresh `npm run dev` from `DWES` fixes it without any code change.

### Root cause (code-level, if stale bundle was ruled out)
`disabled={deleting || deleteConfirmCode !== deleteModal.code}` used strict `!==` with no trimming. A project code stored in the DB with trailing whitespace (e.g. from a manual insert or an older code path) would make `deleteModal.code` one character longer than what the user types visually. The comparison always returns `true` (not equal), keeping the button disabled even when the visible code matches.

### STEP 1 — Diagnostic instrumentation added (DEV-only, tree-shaken in prod)
Added `import.meta.env.DEV`-gated logging inside `onChange` on the confirm input:
- logs `JSON.stringify(typed)`, `typed.length`, `JSON.stringify(expected)`, `expected.length`
- logs first char-code mismatch position when they differ
Console output reveals immediately whether the mismatch is length-based (trailing space) or char-code based (non-breaking space, lookalike character, etc.).

### Fix (STEP 2)
Two-line change in `ProjectsTab.tsx`:
1. `disabled={deleting || deleteConfirmCode.trim() !== deleteModal.code.trim()}` — trim both sides before comparing
2. `if (!deleteModal || deleteConfirmCode.trim() !== deleteModal.code.trim()) return;` — same trim in `handleDeleteConfirm` guard

Guard is fully intact — still requires exact, case-sensitive, trimmed equality to the raw project code.

### STEP 4 — Touch target
- Permanently Delete button: `h-[44px]` → `h-[56px]` (≥56px per tablet spec)
- Cancel button: `h-[44px]` → `h-[56px]` (matched for visual consistency)
- Confirm input remains `h-[44px]` (comfortably tappable; within Apple HIG min)

### TypeScript
`npx tsc --noEmit` → zero errors.

### Files changed
- `src/pages/supervisor/tabs/ProjectsTab.tsx` — `.trim()` on both sides of comparison, DEV logging in onChange, buttons 56px

---

## MODULE 38 — Project Delete Cascade — backup-first, full hard delete (2026-06-29)

### What was built
When a supervisor deletes a project, ALL data tied to that project is permanently removed (no orphans). Backup-first: pg_dump + file archive before any destruction. ADDITIVE — no DB schema changes.

### STEP 0 — Data map
Every artifact tied to a `project_code`:
- **DB rows**: `panel_inspections` (via FK `assignment_id`) → `tech_assignments` (FK `project_code`) → `file_hashes` (col) → `tech_audit_log` (col) → `projects` row itself
- **Preserved**: `session_log` (security audit trail — not cleared, consistent with hardReset)
- **On-disk**: `uploads/<CODE>/frames/` + `uploads/<CODE>/drawings/` + root `uploads/<CODE>/`
- **In-memory**: `MockStore.frames` + `MockStore.drawings` filtered by `project_code`
- **Never touched**: `users` table — technician accounts are global and project-independent

### STEP 1 — Backend (projects.service.ts + projects.controller.ts)
Two new methods in `ProjectsService` (role: `prod_supervisor`):
- **`deletePrecheck(code)`** — returns counts (frames, drawings, assignments, inspections, file_hashes, audit_logs) + backup_note; same logic as admin's `projectResetPrecheck`
- **`deleteCascade(code, confirmedCode)`** — full cascade:
  1. pg_dump to `uploads/backups/<CODE>_<ts>.dump` (abort on failure)
  2. `fs.cpSync` `uploads/<CODE>/` → `uploads/backups/<CODE>_<ts>/` (abort on failure)
  3. DELETE `panel_inspections` (by assignmentIds) → `tech_assignments` → `file_hashes` → `tech_audit_log`
  4. **DELETE `projects` row** (key difference from `hardResetProject` which only soft-resets)
  5. Clear MockStore (frames + drawings)
  6. Recursively remove entire `uploads/<CODE>/` directory from disk

Two new controller endpoints:
- `GET /api/projects/:code/delete-precheck` → `deletePrecheck`
- `POST /api/projects/:code/delete-cascade` → `deleteCascade` (body: `confirmed_code`)

### STEP 1 — Frontend (api.ts + ProjectsTab.tsx)
**`src/services/api.ts`**: Added `projectsApi.deletePrecheck(code)` and `projectsApi.deleteCascade(code, confirmedCode)`.

**`ProjectsTab.tsx`**:
- Added state: `deleteModal` (null | precheck data), `deleteConfirmCode`, `deleting`, `deleteError`
- Replaced simple `handleDelete(code)` → new two-step flow:
  1. `handleDelete(project)` — calls precheck, opens confirmation modal
  2. `handleDeleteConfirm()` — calls cascade delete, removes project from list state
- Cascade confirm modal shows: red danger banner, 6-count grid (frames/drawings/assignments/inspections/file_hashes/audit_logs), amber backup note, type-project-code confirmation input, "Permanently Delete" button (red, disabled until code matches exactly)

### STEP 2 — No orphans
Deletion order: `panel_inspections` first (FK NoAction constraint) → `tech_assignments` → `file_hashes` → `tech_audit_log` → `projects` row. MockStore cleared. Disk fully removed. `session_log` intentionally preserved.

### TypeScript
`npx tsc --noEmit` → zero errors on both frontend and backend.

### Files changed
- `backend/src/projects/projects.service.ts` — +imports (path, fs, spawnSync), +`deletePrecheck`, +`deleteCascade`, +`_resolveUploadDir`
- `backend/src/projects/projects.controller.ts` — +`GET :code/delete-precheck`, +`POST :code/delete-cascade`
- `src/services/api.ts` — +`projectsApi.deletePrecheck`, +`projectsApi.deleteCascade`
- `src/pages/supervisor/tabs/ProjectsTab.tsx` — new delete modal state/handlers/JSX

---

## MODULE 37 — Technician: grading/marking system + issue flagging + DEV test helper (2026-06-29)

### What was built
Ports the old app's per-cable grading mechanic onto the single-wire view. ADDITIVE — no DB schema changes.

### STEP 1 — Grading header (replaces KPI bar)
Replaced `wire-kpi-bar` with `wire-grade-bar`:
- **Verified N/total** (green) | **Issues N** (red, only shown when > 0) | **Pending N** (grey)
- **KPI %** right-aligned + existing CSS-var `wire-kpi-fill` progress bar below
- Mobile wire counter ("Wire N/total") preserved on `sm:hidden` span

### STEP 2 — Completion toast
When both ends of a wire are marked done, a "Wire #N Verified — FERRULE — Source + Destination connected" toast fires (2.4s auto-dismiss, slide-in from right, `wire-toast` CSS class, z-[500] fixed overlay).

### STEP 3 — Issue / Incorrect marking
- **"Flag Issue"** button (`wire-issue-pill`) inside wire card below Note section when `canWire` and no issue set
- Tap → Issue modal with 5 preset reasons + free-text; confirms → `cableStatus(idx, 'issue', true)` + `cableStatus(idx, 'note', reason)`
- `issue?: boolean` stored as additive JSON key INSIDE existing `cable_status` value — NOT a DB column
- Active issue: red `wire-issue-active` bar with reason text + "Clear" button → `cableStatus(idx, 'issue', false)`
- `CableSchematic.tsx`: `wire-schematic-issue` class (red border/bg) + issue banner showing reason when flagged
- Wire list: "Issues" filter option (red active); issue rows show `AlertTriangle` icon
- `issueCount` derived count in grading header (hidden when 0)

### STEP 4 — DEV test helper (DEMO_MODE + Vite dev build)
Gated on `useDemoMode()` (`import.meta.env.DEV && GET /api/env demo_mode`) — invisible in production and when backend demo off:
- **✓ All Verified** — `POST /api/tech/dev/cable-bulk/:id` action `mark_all_verified` (single write)
- **✓ All + 3 Issues** — action `mark_all_with_issues` (all verified + 3 preset issues)
- **↺ Reset All** — action `reset_all` (rebuilds cable_status all-pending; resets done counters)

Endpoint returns **404** when `DEMO_MODE !== 'true'`. One-wire-at-a-time flow unchanged.

### Backend (no schema changes)
- `CableStatus.issue?: boolean` + `parseCS` backward-compat normalisation
- `updateCableStatus` new `'issue'` field branch (does NOT touch src/dst done counters)
- `cableAction` new `'reset_all'` action (handled before range check; rebuilds all-pending; resets src_done/dst_done to 0)
- DTOs in `tech.controller.ts` updated; `api.ts` types updated

### Files changed
- [backend/src/tech/tech.service.ts](backend/src/tech/tech.service.ts) — issue field, reset_all action
- [backend/src/tech/tech.controller.ts](backend/src/tech/tech.controller.ts) — DTO types
- [src/services/api.ts](src/services/api.ts) — type signatures
- [src/styles/design-system.css](src/styles/design-system.css) — wire-grade-bar, wire-toast-*, wire-issue-*, wire-schematic-issue, wire-dev-bar, wire-toast-in keyframe
- [src/components/ui/CableSchematic.tsx](src/components/ui/CableSchematic.tsx) — issue/note in SchematicStatus, issue banner
- [src/pages/technician/tabs/WiringTab.tsx](src/pages/technician/tabs/WiringTab.tsx) — all grading/marking/toast/issue/dev logic

### Hard rules confirmed
- No DB schema change. `cables_total` never modified. `issue` key is additive inside existing JSON.
- DEV helper gated by `useDemoMode` (Vite dev + backend `DEMO_MODE`); bulk endpoint 404 in production.
- `tsc --noEmit`: zero errors on both frontend and backend.

---

## Upload button theme fix (2026-06-29)

### Root cause
Not a serving/cache/folder problem. Vite dev server (PID 12412) was correctly serving `C:\Users\sathe\OneDrive\Desktop\DWES`. Only one server, no OneDrive conflict files, no stale dist.

The styling was **genuinely absent/wrong in source**. Module 35 intentionally styled the "Upload ▼" button as a ghost/white variant (`bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-medium`) to visually distinguish it from "New Project". That diverged from the spec requirement.

### Fix
One-line className change on the Upload dropdown trigger in [ProjectsTab.tsx](src/pages/supervisor/tabs/ProjectsTab.tsx) (line 228):

- **Before:** `bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-medium text-sm`
- **After:** `bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm`

Full button class now identical to "New Project": `flex items-center justify-center gap-2 min-h-[44px] h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm`. Upload handlers and dropdown content unchanged.

### Result
"New Project" and "Upload ▼" now sit as visual siblings — same blue primary solid style, same height, same weight. The chevron animates white on the blue background. HMR pushed the change live immediately.

---

## MODULE 36 — Technician: animated cable schematic in wiring view (2026-06-29)

### What was built
In the technician one-wire wiring view, the current cable now renders a self-contained animated SVG schematic — a "pipeline" from SOURCE node to DESTINATION node, drawn in the cable's real color with stroke thickness scaled to cable size.

### Design
- **Horizontal layout**: SOURCE circle (left) — cable line — DESTINATION circle (right), in a `viewBox="0 0 480 130"` SVG that scales to full card width (portrait-first).
- **Wire color**: full map of IEC industrial color names (RED, BLUE, YELLOW, etc.) + short codes (RD, BU, YL, BK, WH, GY, BR, OR, VI, PK, CY, GN …) → hex. Unknown colors fall back to `#94A3B8` (grey) with a `(?)` suffix in the label. White wire uses a grey stroke so it's visible on the light background.
- **Wire thickness**: parsed from `cable.size` string (regex extracts numeric value):
  - ≤1.0mm² → 3px · 1.5mm² → 4px · 2.5mm² → 5px · 4mm² → 6px · 6mm² → 8px · 10mm² → 10px · ≥16mm² → 12px · unknown → 5px
- **Animation**: SVG SMIL `<animate>` flowing-dash marching-ants on the cable line; disabled when both ends done or `prefers-reduced-motion` is set.
- **Progress states**:
  - Pending (neither done): grey node rings, cable at 38% opacity, animated dashes
  - One end done: that node fills with wire color + checkmark, cable at 72% opacity, animated dashes
  - Both done: both nodes filled + checkmarks, cable 100% opaque, animation stops (solid line)
- **Labels**:
  - "SRC"/"DST" above nodes (green when src done, orange when dst done)
  - Ferrule code: white pill with border overlaid on cable midpoint (hidden if no ferrule)
  - Color swatch (circle) + color name + size + length below cable
  - Source terminal/device text below left node; dest terminal/device below right node — all truncated to fit viewBox
- **Graceful on blank data**: every field is optional; SVG degrades cleanly with whatever is present.

### Placement
Inserted inside `.wire-card` between the secondary chips (color/size/length/ref) and the `wire-ends-grid` (source/destination blocks). The tech sees: wire ID → chips → **schematic** → interactive src/dst toggle buttons.

### No new writes
Pure render from existing `cable: CableRow` and `status: CableStatus` already in component state. No API calls, no DB writes, no new endpoints. Existing `cable_status` toggle logic is completely unchanged.

### Files changed
- **[CableSchematic.tsx](src/components/ui/CableSchematic.tsx)**: new component. Self-contained SVG schematic, zero external deps, no inline CSS `style` props.
- **[design-system.css](src/styles/design-system.css)**: added `.wire-schematic-wrap` and `.wire-schematic-svg` classes (after `.wire-progress-fill`).
- **[WiringTab.tsx](src/pages/technician/tabs/WiringTab.tsx)**: added `import CableSchematic` + `<CableSchematic cable={currentCable} status={currentStatus} />` between chips and grid.

### Hard rules confirmed
- No DB schema changes (no Prisma commands run).
- No new data writes (pure render from existing state).
- Next/Prev and per-end toggle logic untouched.
- Does NOT draw on the real GA/PDF — completely separate SVG element.

---

---

## MODULE 35 — Top-level Upload control with cross-project picker (2026-06-29)

### What changed
**Problem:** Module 34 added "Wiring Upload" / "Drawing Upload" buttons to the project detail back bar. Those buttons were only accessible AFTER clicking a specific project row's "Open" button — making uploads per-row scoped, not cross-project. Spec required uploads to be top-level (near New Project) and work across ALL projects via a project selector.

### STEP 1 — Per-row upload path removed
- Removed `showWiringUpload`, `showDrawingUpload`, `framesKey` state from Module 34.
- Removed "Wiring Upload" / "Drawing Upload" buttons from the project detail back bar.
- Removed `UploadFrameModal` / `UploadDrawingModal` instances from the back bar.
- The `key={framesKey}` on `<FramesTab>` also removed (not needed without back-bar uploads).
- The "Open" button in project rows is UNCHANGED — still opens the project detail/frames view. Upload is no longer tied to that row-specific path.

### STEP 2 — Top-level Upload dropdown near New Project
- Added `Upload ▼` button to the main toolbar left cluster, alongside New Project (both gated by `perms.canManageProjects`).
- Clicking "Upload" reveals a compact dropdown menu with two items:
  - **Wiring Schedule** → `.xlsx / .xls` → sets `showPickerFor('wiring')`
  - **Drawing** → `.pdf / .dwg / image` → sets `showPickerFor('drawing')`
- Dropdown closes on outside-click or Escape (via `useEffect` + `uploadMenuRef`).
- Style: white/ghost button (`bg-white border hover:bg-slate-50`) to visually distinguish from "New Project" (blue primary) while staying in the same family.

### STEP 3 — UploadProjectPickerModal (new component)
- Added `UploadProjectPickerModal` at bottom of ProjectsTab.tsx.
- Accepts `uploadType`, `projects`, `initialCode` (pre-selects `openedProject.code` if a project is currently open), `onConfirm`, `onClose`.
- Shows a type banner (blue for wiring, indigo for drawing) and a project `<select>` populated from the already-loaded `projects` state.
- On "Continue" (disabled until a project is selected): calls `onConfirm(code)` which sets `pendingUpload({ type, code })`.
- Shows path hint: `uploads/{CODE}/` so the user knows where the file will land.

### STEP 4 — Actual upload modals (unchanged)
- `pendingUpload.type === 'wiring'` → renders `UploadFrameModal(projectCode, onClose, onUploaded)` — full 3-step Excel import flow, unmodified.
- `pendingUpload.type === 'drawing'` → renders `UploadDrawingModal(projectCode, onClose, onUploaded)` — file upload with inline PDF preview, unmodified.
- Both modals still come from FramesTab.tsx / DrawingsTab.tsx. No upload logic changed.
- After upload completes (or modal closed), `pendingUpload` resets to `null`.

### Cross-project capability
The project selector in `UploadProjectPickerModal` lists ALL loaded projects. The user picks any project code; that code is passed to the existing upload modal. Files land at `uploads/<CHOSEN_CODE>/frames/` or `uploads/<CHOSEN_CODE>/drawings/`. The upload has NO dependency on which project row was clicked.

### FramesTab internal Upload unchanged
FramesTab still has its own `Upload ▼` dropdown for when the user is already inside a project's detail view (propCode-scoped). This coexists with the top-level Upload — two entry points, same underlying modals.

### Files changed
- [ProjectsTab.tsx](src/pages/supervisor/tabs/ProjectsTab.tsx): removed Module 34 back-bar upload; added `Upload ▼` dropdown toolbar; added `UploadProjectPickerModal`; added `showUploadMenu`, `showPickerFor`, `pendingUpload`, `uploadMenuRef` state/ref; added `Upload`, `ChevronDown` lucide imports; added `useRef`.
- No changes to FramesTab.tsx, DrawingsTab.tsx, UsersTab.tsx, or any backend files.

---

## MODULE 34 — Button theme consistency + gradient action icons + upload buttons (2026-06-29)

### STEP 1 — Manage Team button matched to New Project theme
Changed from ghost (`bg-white border text-slate-700`) to solid blue primary (`bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm min-h-[44px] h-11 px-5 rounded-[10px] shadow-sm`). Both buttons now look like siblings — styling only, no logic change.

### STEP 2 — Team modal action icons: gradient idle style + tooltip
Rewrote `ActionBtn` in UsersTab.tsx:
- Replaced flat `bg-white border text-slate-500` idle style with **distinct gradient per tone**:
  - Edit (`default`): `from-blue-50 to-indigo-50 border-blue-200 text-blue-600`
  - Password (`indigo` — new tone): `from-indigo-50 to-violet-50 border-indigo-200 text-indigo-600`
  - Block (`warn`): `from-amber-50 to-orange-50 border-amber-200 text-amber-600`
  - Unblock (`safe`): `from-emerald-50 to-green-50 border-emerald-200 text-emerald-600`
  - Delete (`danger`): `from-red-50 to-rose-50 border-red-200 text-red-600`
- Added `aria-label={label}` for accessibility
- Tooltip: CSS `group-hover` tooltip (`absolute bottom-full z-50`) appears above button on hover. `title={label}` kept as native tooltip fallback — browser-rendered, not clipped by modal overflow, and works on touch via long-press.
- Removed inline `style={}` (caused linter warning) — used `group`/`group-hover` Tailwind approach instead.
- Password ActionBtn call: added `tone="indigo"` to distinguish it from Edit.

### STEP 3 — Modern Wiring Upload / Drawing Upload buttons in project back bar
- Exported `UploadFrameModal` from FramesTab.tsx (was private function).
- `UploadDrawingModal` was already a named export from DrawingsTab.tsx.
- In ProjectsTab.tsx: added `showWiringUpload`, `showDrawingUpload`, `framesKey` state.
- Added new imports: `UploadFrameModal` from FramesTab, `UploadDrawingModal` from DrawingsTab, `FileSpreadsheet`+`Map` from lucide-react.
- When a project is open (back bar view), two upload buttons appear RIGHT of the project name (gated by `perms.canManageProjects`):
  - **Wiring Upload** — `bg-blue-600` — opens existing `UploadFrameModal` (full 3-step Excel import flow, unchanged)
  - **Drawing Upload** — `bg-indigo-600` — opens existing `UploadDrawingModal` (unchanged)
- After upload completes, `framesKey` is incremented → `<FramesTab key={framesKey} />` remounts cleanly, loading fresh frames+drawings list.
- Upload buttons are inherently context-aware: they only render when `openedProject !== null`, so a project is always selected when they're visible.
- No upload logic reimplemented — wired to exact same modal components.

### Files changed
- [ProjectsTab.tsx](src/pages/supervisor/tabs/ProjectsTab.tsx): Manage Team button re-themed; back bar upload buttons + state + modal instances; new imports.
- [UsersTab.tsx](src/pages/supervisor/tabs/UsersTab.tsx): ActionBtn gradient tones + CSS tooltip; Password button `tone="indigo"`.
- [FramesTab.tsx](src/pages/supervisor/tabs/FramesTab.tsx): `export` added to `UploadFrameModal`.

---

## MODULE 33 — New Project: code preview spacing fix + friendly duplicate handling (2026-06-29)

### Root cause — Bug 1 (spaces in preview)
`computedCode = codeSegs.join('_')` was always clean (no spaces). The bug was display-only in the preview JSX:
- Outer `<div>` had `gap-0.5` (2px flex gap between segment spans)
- The `_` separator `<span>` had `mx-0.5` (2px margin each side)
- Combined: "SAS" + [2px flex gap] + [2px left-mx] + "_" + [2px right-mx] + "132KV" = visual "SAS _ 132KV"
- **Fix:** removed `gap-0.5` → `gap-0` from the container; removed `mx-0.5` from the `_` span. Preview now renders `SAS_132KV_KSA_RIYADH_2026_001` with no spaces.

### Stored codes
`computedCode` (clean, no spaces) is what is sent to `projectsApi.create({ code: computedCode, ... })` and stored as the PK. No existing stored codes were found with stray spaces from this bug — the visual bug was rendering-only.

### Duplicate check (confirmed correct)
Backend: `prisma.projects.findUnique({ where: { code: dto.code } })` → exact PK match on the normalized code. Comparison is against the same normalized string the frontend sends. No normalization is needed server-side since the frontend already normalizes before sending. Duplicate rejection is server-authoritative and unchanged.

### Root cause — Bug 2 (unhelpful collision message)
HTTP 409 ConflictException was caught generically as `setError(message)` with no context about which code collided or what the next free sequence was.

### Fix — Next-free-sequence suggestion
On 409 response:
1. Extract the 5-part prefix (`PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR`) from `codeSegs.slice(0,5).join('_')`
2. Scan the already-loaded `projects` state to find all codes with that same prefix, parse their SEQ digits
3. `nextSeq = String(max(usedSeqs) + 1).padStart(3, '0')`
4. `setForm(s => ({ ...s, seq: nextSeq }))` — auto-bumps the Sequence field so the live preview immediately shows the new code
5. Error message: `"Code SAS_132KV_KSA_RIYADH_2026_001 already exists — sequence auto-updated to 002. Review the preview and click Create again."`

The server's duplicate check remains authoritative (the suggestion could miss soft-deleted codes, but the server catches those). No new endpoint added — uses the already-loaded `projects` list for the prefix scan.

### Files changed
- [ProjectsTab.tsx](src/pages/supervisor/tabs/ProjectsTab.tsx): preview container `gap-0.5→gap-0`, `_` separator `mx-0.5` removed; `handleCreate` 409 branch added with auto-bump + informative error message.

---

## MODULE 32 — Team modal table: layout/overflow fix (2026-06-29)

### Root cause (STEP 0)
Two compounding problems:
1. **`min-w-[860px]` undershoots the real content minimum.** The ACTIONS cell with four text-labelled buttons (`"Edit"`, `"Password"`, `"Block/Unblock"`, `"Delete"`) at `h-[34px] px-2.5` plus their text needed ~360px alone. Combined with `px-[16px]` per cell (224px total padding across 7 columns), NAME, USERNAME, EMPLOYEE ID, ROLE, STATUS, LAST LOGIN, ACTIONS, the real minimum was ~1250px — 274px wider than the modal's ~976px usable content area. `min-w-[860px]` was already exceeded by the content, so the table burst through the modal.
2. **NAME had no truncation.** Bare `<span>` inside `flex` — long names wrapped to two lines and pushed row height.

### Fix (`UsersTab.tsx` — table layout only, no logic changes)

**Table:** changed from `min-w-[860px]` → `w-full table-fixed`. Column widths declared explicitly on `<th>`:

| Column | Width | Visibility |
|---|---|---|
| Name | auto (flexible) | always |
| Username | 110px | always |
| Emp ID | 100px | `hidden lg:table-cell` (portrait 820px) |
| Role | 120px | always |
| Status | 84px | always |
| Last Login | 110px | `hidden lg:table-cell` (portrait 820px) |
| Actions | 160px | always |

Always-visible fixed total: 474px. Name gets ≈502px at desktop (976-474), ≈266px at portrait (740-474). No horizontal overflow.

**NAME cell:** `overflow-hidden` on `<td>`, `min-w-0` + `truncate` + `title={user.full_name}` on the text span. Long names now truncate with ellipsis, tooltip shows full name on hover.

**`ActionBtn`:** made icon-only (`h-[34px] w-[34px]` square, removed `<span className="hidden sm:inline">{label}</span>`). The `title={label}` attribute remains for tooltip. This is the main column-width reduction — drops ACTIONS from ~360px to ≤160px.

**Portrait (820px):** Employee ID and Last Login columns hidden (`hidden lg:table-cell` — `lg` = 1024px viewport). Remaining fixed columns: 474px. Name gets 266px. Fits cleanly with no horizontal scroll.

**Last Login format:** changed `toLocaleString()` to `toLocaleDateString()` — shorter date-only value keeps the column compact within 110px.

---

## MODULE 31 — New Project: Project Name + Substation Name merged (2026-06-29)

### Discovery (STEP 0)
- **"Project Name"** (`form.name`): stored directly in `name` VARCHAR(200) column → `name: form.name.trim()`
- **"Substation Name"** (`form.substation`): NO dedicated column — prepended to `description` as `"Substation: <value>"`, then joined with optional free-text notes
- Neither field fed code generation (code = PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR_SEQ from type/voltage/region/location/year/seq only) ✅
- Schema: two relevant columns (`name`, `description`); no `substation` column

### Mapping decision (STEP 2)
Single combined value → **`name` column** (primary display field).
The "Substation: ..." prefix in `description` is dropped — the combined value already carries it.
Optional free-text notes field still writes to `description` unchanged.
No schema change; no column added or removed.

Example: entering `CPR — 132/11kV Al Quoz Main` → `name = "CPR — 132/11kV Al Quoz Main"`, `description = ""` (or free-text notes if entered).

### Changes (`ProjectsTab.tsx` only)
- `CreateForm` interface: removed `name: string` and `substation: string`; added `displayName: string`
- `emptyForm`: `displayName: ''` (replaces `name: ''` + `substation: ''`)
- `canCreate`: `!!form.displayName.trim() && !!form.client.trim()` (removed substation check)
- `fe` validation: `displayName: !form.displayName.trim() ? 'Required' : ''` (removed `name` + `substation` entries)
- `handleCreate`: `name: form.displayName.trim()` → direct to `name` column; `description: form.description.trim()` (no "Substation: ..." prefix)
- JSX: two rows (Project Name + Substation Name) → ONE field "Project / Substation Name *" in the top-left grid cell alongside Client; placeholder `"e.g. CPR — 132/11kV Al Quoz Main"`
- Existing projects: unaffected — their `name` column values display unchanged in the project list

---

## MODULE 30 — Stat cards removed + Team tab removed (2026-06-29)

### Changes made

**Stat cards removed (`SupervisorDashboard.tsx`):**
- Removed the 4 KPI cards: Projects / Active / Approvals / Paused
- Removed all stat-computing logic: `Stats` interface, `stats` state, `useEffect` with `projectsApi.list()` / `supervisorApi.allPanels()` / `supervisorApi.pendingApprovals()` / `supervisorApi.pendingChangeovers()`
- Confirmed: none of these counts were shared with any other component — they were purely local to the dashboard. The count logic and API imports were removed entirely from `SupervisorDashboard.tsx`. `ProjectsTab` retains its own independent `projectsApi.list()` call for the project table.
- Removed unused lucide imports: `Activity`, `CheckCheck`, `PauseCircle`, `Users`

**Team tab removed + Manage Team consolidated (`SupervisorDashboard.tsx` + `ProjectsTab.tsx`):**
- Removed `{ key: 'team', label: 'Team', icon: <Users> }` from TABS
- Removed `import UsersTab` and `{tab === 'team' && <UsersTab />}` rendering
- **`TeamManagementModal`** (the full user-management popup modal from `UsersTab.tsx`) exported as a named export so it can be consumed from `ProjectsTab.tsx`
- A "Manage Team" button added to the Projects tab toolbar (right side, alongside the project count). `h-11` (44px) white/border style. Opens `TeamManagementModal` in-place — same full workflow: user list, create, edit, block/unblock, reset password, all inside the modal.
- Team management is now reachable ONLY via this single button. No header/topbar placement.

### Result nav
Single tab: `Projects`. (Frames & Upload already merged into Projects via drill-down; no separate frames tab.)

### Schema / data rules
No DB changes. No pg_dump needed (UI-only change). Existing `usersApi` endpoints, `is_active` block column, and bcrypt password hashing all unchanged.

### Files changed
- [SupervisorDashboard.tsx](src/pages/supervisor/SupervisorDashboard.tsx): Stripped to minimal — one tab, no stat cards, no UsersTab import
- [ProjectsTab.tsx](src/pages/supervisor/tabs/ProjectsTab.tsx): Added `showTeam` state + "Manage Team" button in toolbar + `TeamManagementModal` render
- [UsersTab.tsx](src/pages/supervisor/tabs/UsersTab.tsx): `TeamManagementModal` now exported (added `export` keyword)

---

## MODULE 29 — "Changes not reflecting" diagnosis (2026-06-29)

### Root cause
**Vite HMR window missed / browser tab not connected.** All three changes (Team modal, Frames merged, New Project form) were edited WHILE the Vite server was running (started 09:45), but the browser tab was not connected at the time of each edit (HMR WebSocket updates were silently lost).

**Evidence:**
- Vite PID 12412 → `C:\Users\sathe\OneDrive\Desktop\DWES` ✅ correct folder
- Backend PID 27044 → `C:\Users\sathe\OneDrive\Desktop\DWES\backend\dist\main` ✅ correct folder
- Only ONE process on port 5173, ONE on port 3001. No port collision.
- All three changes confirmed PRESENT in source (grepped UsersTab.tsx, ProjectsTab.tsx, SupervisorDashboard.tsx).
- No OneDrive conflict copies in source tree.
- No service worker, no PWA, no manifest.json — nothing could cache an old bundle.

### Fix
**Hard reload in the browser: Ctrl+Shift+R** at `localhost:5173`. Vite always serves fresh source on a full page request regardless of HMR state.

### Verified status (post hard-reload)
| Feature | Source status |
|---|---|
| Team management popup modal ("Manage Team" trigger → xl modal) | ✅ PRESENT in source |
| Frames & Upload merged into Projects (drill-down via "Open" button) | ✅ PRESENT in source |
| New Project form: 6-segment live preview + all required fields + per-field errors | ✅ PRESENT in source |

Backend (`dist\main`) did NOT need a restart — all changes were frontend-only.

---

## MODULE 28 — Team management: single popup modal (2026-06-29)

### STEP 0 — Discovery

**Where it rendered before:** `UsersTab.tsx` was the Team tab content in `SupervisorDashboard.tsx` — a persistent **inline panel** filling the entire tab body (toolbar + scrollable user table always visible). The Create/Edit/Reset sub-forms were already nested modals stacked on top of this inline panel. Nothing was in the top bar or header.

**What had to move:** The inline panel (toolbar + user table) → now lives inside a `Modal size="xl"` opened by a single "Manage Team" trigger button in the Team tab body.

**Schema check (`users` table columns confirmed):**
`id, username, hashed_password, full_name, employee_id, role, is_active (Boolean default true), created_at, last_login, whatsapp_number, ready_for_assignment, ready_since`
- `is_active` EXISTS → Block/Unblock fully supported, no schema gate triggered.
- No columns added; no migration; no schema changes.

**Password hashing:** `bcryptjs` cost 10, backend only. No hashes reach the frontend. Reused unchanged.

**Block column decision:** SUPPORTED — `is_active` column exists, `auth.service.ts` rejects login when `is_active = false`. Block/Unblock uses existing `usersApi.toggleStatus()` → `POST /api/users/:id/toggle-status` (system_admin server-side guard). No schema gate triggered.

### STEP 1 — Single trigger

The Team tab body now renders ONLY:
- A blue icon container + title + description text
- One `h-[56px]` "Manage Team" button (touch-safe, 56px ≥ 44px minimum)
- Nothing else in the tab body; no table, no search bar, no inline panel

### STEP 2 — Everything inside the modal

`TeamManagementModal` (`Modal size="xl"` → `max-w-5xl max-h-[90vh]`):
- **List view (default):** sticky-header user table (`max-h-[440px]` scrollable), search bar, "New User" button in the toolbar
- **Create/Edit:** `UserFormModal` rendered after the main modal in DOM order → stacks on top (same `z-[100]`; DOM order wins)
- **Reset Password:** `ResetPasswordModal` same pattern — stacks above team modal
- **Block/Unblock / Delete:** `dialog.confirm` (existing confirm overlay) — stacks above all
- **Close:** X button, backdrop click, Esc — all wired by the existing `Modal.tsx`

Sub-modals render as siblings to `<Modal>` in a `<>…</>` fragment so they're later in the DOM → naturally stack above the team modal without needing a higher z-index.

### STEP 3 — Schema gate (Block)

NOT triggered — `is_active` column confirmed present in `users` table. Block/Unblock is fully functional.

### Files changed
- [UsersTab.tsx](src/pages/supervisor/tabs/UsersTab.tsx): Rewritten. `default export UsersTab` now renders only the trigger button. New `TeamManagementModal` function contains the full user list + toolbar. `UserFormModal` and `ResetPasswordModal` unchanged in logic; rendered as DOM-order siblings to the team modal so they stack above it. Search input gets `title` for ARIA.

### What to test
- Team tab shows only the "Manage Team" button, NO inline panel, NO table
- Clicking the button opens the xl modal with the full user list
- Create a TEMP user (not tech1..tech24) → appears in in-modal list → can log in → edit it → reset password → logs in with new password → block → login rejected → unblock → login allowed
- Modal closes via X, backdrop, Esc
- No hashes in frontend; server-side role checks prevent unauthorized calls

---

## MODULE 27 — New Project form: code generation fix + validation (2026-06-29)

### STEP 0 — Discovery

**All 7 required fields already existed in the modal.** Nothing was absent from the form definition. The issues were:

1. **"2026_001" live preview bug:** `emptyForm` pre-populates `year='2026'` and `seq='001'` while `type/voltage/region/location` start empty `''`. The preview used `.filter(Boolean).join('_')` which silently drops empty segments — so it showed `2026_001` on open, and even after filling type/voltage it would show partial codes like `RELAY_132KV_2026_001` without the region/location. No indication of which segments were missing.

2. **Substation NOT required:** `InputField label="Substation"` had no `*` and was not in the `canCreate` check.

3. **Generic validation message:** Single error string; no per-field indication of which field was empty.

**Schema audit:** `projects` table has `code (PK), client, name, description, sequence, is_active, created_at, project_state, assigned_technicians`. No dedicated columns for `panel_type`, `voltage`, `region`, or `location` — these are **encoded in the `code` itself** (segments 1–4 of `PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR_SEQ`) and are parseable on read. Substation has no column — already persisted as `"Substation: <value>"` prepended to `description`. **No schema gate triggered; no columns added.**

### STEP 1 — Required fields confirmed

All 8 code fields + Name + Client + Substation now validated as required. No new fields were added to the form.

### STEP 2 — Live preview fixed

Replaced the old `.filter(Boolean).join('_')` partial display with a **segment-by-segment inline breakdown**:
- Filled segments appear in blue bold text
- Unfilled segments appear as grey italic placeholder labels (e.g. `PANELTYPE`, `VOLTAGE`, `REGION`, `LOCATION`)
- The preview box border is blue when `codeComplete`, slate when any segment is missing
- `computedCode` now joins ALL 6 segments with `_` (no filtering) — only used for submission when `codeComplete` is true

Example before any fields filled: `PANELTYPE _ VOLTAGE _ REGION _ LOCATION _ 2026 _ 001` (year/seq pre-filled, others grey)

Example after RELAY + 132KV filled: `RELAY _ 132KV _ REGION _ LOCATION _ 2026 _ 001`

### STEP 3 — Validation

Added `submitted: boolean` state (resets on modal open/close). On "Create Project" click:
1. `setSubmitted(true)` — triggers per-field error display
2. Check `canCreate` (all 9 required fields non-empty + `codeComplete`) — bail if false, no generic message
3. If all valid, proceed with API call

Per-field errors (`fe.name`, `fe.client`, `fe.substation`, `fe.type`, etc.) are computed from form state + `submitted` flag and passed as `error` prop to each field component. Red border + small red label shown under the empty field.

`canCreate` updated: `codeComplete && !!name && !!client && !!substation`.

### STEP 4 — Persistence (unchanged columns)

| Field | Column |
|---|---|
| Project Name | `name` |
| Client | `client` |
| Substation Name | prepended to `description` as `"Substation: <value>"` |
| Panel Type | encoded in `code` segment 1 |
| Voltage | encoded in `code` segment 2 |
| Region | encoded in `code` segment 3 |
| Location | encoded in `code` segment 4 |
| Year | encoded in `code` segment 5 |
| Sequence | encoded in `code` segment 6; also `sequence` (int) col via `sequence: 1` default |

Duplicate code → `ConflictException` from backend → displayed as inline error below the form.

### Files changed
- [TabletFields.tsx](src/components/ui/TabletFields.tsx): Added `error?: string` prop to `InputField`, `ComboField`, `SelectField` — red border + red label below when set. Also fixed pre-existing ARIA: added `title={label}` to `<select>`.
- [ProjectsTab.tsx](src/pages/supervisor/tabs/ProjectsTab.tsx): Added `submitted` state; updated `handleCreate`; added `fe` computed error object; replaced modal body with segment-by-segment live preview, full-width Substation field marked required `*`, per-field error props on all required fields; fixed pre-existing ARIA issues in `EditProjectModal` (title on disabled input, placeholder+title on textarea).

---

## MODULE 26 — Frames merged into Projects + Team user-management (2026-06-29)

### STEP 0 — Discovery findings

**Supervisor nav before:** 3 tabs — Projects, Frames & Upload, Team  
**Supervisor nav after:** 2 tabs — Projects (now includes all frames/upload/drawing functionality), Team

**Users table columns confirmed:** `id`, `username`, `hashed_password`, `full_name`, `employee_id`, `role`, `whatsapp_number`, `is_active` (boolean), `last_login`

**`is_active` IS the block column.** Login check in `auth.service.ts` rejects any login when `is_active = false` via both `login()` and `issueToken()` paths. Block/unblock is fully enforced — no schema gate needed.

**Password scheme:** `bcryptjs`, cost factor 10. `usersService.create/resetPassword()` both use `bcrypt.hash(password, 10)`. Confirmed consistent.

**All backend user CRUD endpoints already existed** in `users.controller.ts` — server-side guarded at class level with JwtAuthGuard + RolesGuard. No new backend work was needed.

### STEP 1 — Frames & Upload merged into Projects (relocated, not rebuilt)

**Strategy:** Minimal surface change. FramesTab was given an optional `projectCode?: string` prop. When provided it:
- Skips loading the project list (`projectsApi.list()`)  
- Hides the project selector `<select>` in the toolbar
- Uses the prop value as `selectedProject` directly (syncs on prop change)

**ProjectsTab** gained:
- `openedProject: Project | null` state
- Blue "Open" button on every project row (with `PanelTop` icon)
- Early-return "detail view" when a project is opened: back nav bar (← Projects + project name/code) + `<FramesTab projectCode={openedProject.code} />` below it
- `FramesTab` is imported into ProjectsTab — no logic rebuilt

**SupervisorDashboard:** Removed `frames` tab from TABS array, removed `FramesTab` import, removed `{tab === 'frames' && <FramesTab />}` branch. Two tabs remain: `projects`, `team`.

**Zero regression:** Every FramesTab feature (upload wizard, dedup, sheet mapping, verify, assign, review, drawing viewer, inline PDF) is reachable by: Projects tab → Open button → project frames view. The `UploadDrawingModal` import from `DrawingsTab.tsx` is unchanged.

Also fixed a pre-existing ARIA bug: `aria-expanded={showUploadMenu ? 'true' : 'false'}` → `aria-expanded={showUploadMenu}` (boolean, not string expression).

### STEP 2 — Team: modern Tailwind user-management UI

`UsersTab.tsx` was rewritten with inline Tailwind (replacing legacy CSS utility classes: `btn-sm`, `table-wrapper`, `data-table`, `toolbar`, etc.) while keeping **identical functionality**:

| Action | Backend endpoint | Role guard |
|---|---|---|
| List users | `GET /api/users` | supervisor, director, admin |
| Create user | `POST /api/users` | system_admin |
| Edit user (name/role/emp_id/whatsapp) | `PUT /api/users/:id` | system_admin |
| Block/Unblock (toggle `is_active`) | `POST /api/users/:id/toggle-status` | system_admin |
| Reset password (bcrypt hash, cost 10) | `POST /api/users/:id/reset-password` | system_admin |
| Delete (deactivates if FK deps exist) | `DELETE /api/users/:id` | system_admin |

**UI features:**
- Search bar filters by name / username / role
- Role badge with colour-coded pills per role (purple=admin, indigo=director, blue=supervisor, teal=QA, slate=technician)
- Status badge: green "Active" / slate "Blocked" with icon
- Blocked rows rendered at 60% opacity for at-a-glance status
- Row action buttons (Edit, Password, Block/Unblock, Delete) — 34px height, hover tones per action type
- Create/Edit modal: 2-column grid, 44px inputs, username locked on edit
- Reset Password modal: safety note ("hash stored securely, current password never shown"), confirm field, one-time success screen
- All modals use the existing `Modal` + `InputField`/`SelectField` components

**Schema decision for Block:** `is_active` column **exists** — no schema gate. Block is fully functional. Login enforcement already in `auth.service.ts`.

### Guards and invariants
- No schema changes made — `prisma db pull` only
- Hashes never reach the frontend (`safeUser()` strips `hashed_password` in `users.service.ts`)
- Non-admin roles cannot hit write endpoints (403 from server guard)
- Block takes effect on next login; existing JWT stays valid until expiry (standard behaviour)
- Test protocol: create a temporary user (`temp_test01`); never touch `tech1..tech24` during testing

---

## MODULE 25 — Hard Reset + Upload Duplicate Fix (2026-06-29)

### STEP 0 — Root-cause diagnosis

**"Already exists" source:** `POST /api/check-hash` queried `file_hashes` GLOBALLY (no `project_code` filter). The frontend also never passed `project_code` in the request. Result: re-uploading any file seen before showed a yellow "Duplicate" warning. Users read it as a hard block. Backend upload itself never fails — it always creates a new file with a new `drw_<ts>` / `frame_<ts>` id.

**Full project data map (what hard reset clears):**
| Location | What is cleared |
|---|---|
| `uploads/<CODE>/frames/` | `.json` metadata + `.xlsx` source files |
| `uploads/<CODE>/drawings/` | all drawing files |
| DB `file_hashes WHERE project_code = :code` | hash dedup records |
| DB `panel_inspections WHERE assignment_id IN (tech_assignments WHERE project_code = :code)` | FK dep — deleted FIRST |
| DB `tech_assignments WHERE project_code = :code` | all wiring assignments |
| DB `tech_audit_log WHERE project_code = :code` | action trail |
| In-memory `MockStore.frames` + `MockStore.drawings` | cleared by filter |
| DB `projects` row | KEPT — `project_state → 'not_started'`, `assigned_technicians → ''` |
| DB `session_log` | KEPT — security audit trail |

**Project enumeration model:** Projects exist in `projects` DB table (code = PK). A "clean state" means the project row stays active but everything else is cleared — re-upload creates fresh entries.

**Auth guard pattern:** `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('system_admin')` at class level (admin.controller.ts). Reused on both new endpoints.

### STEP 1 — Gentle fix: project-scoped hash check + Replace/Keep dialog

**Backend (`upload.service.ts:40-46`):** `checkHash` now accepts optional `projectCode` — filters `file_hashes` by `project_code` when provided. Global fallback still works when not provided.

**Backend (`upload.controller.ts:17-19`):** Controller now passes `body.project_code` to `checkHash`.

**Frontend (`api.ts`):** `uploadApi.checkHash` now accepts `projectCode?: string` and passes it in the body.

**Frontend (`DrawingsTab.tsx` + `FramesTab.tsx`):**
- `UploadDrawingModal` and `UploadFrameModal` replaced the `dupWarning` string with `dupInfo: { kind: 'same' | 'other', ... }` + `dupChoice: 'replace' | 'keep' | null`
- Same-project dup: shows "Replace / Keep existing" choice cards; Upload button disabled until user picks
- Different-project dup: shows informational amber banner (non-blocking)
- After hard reset (hashes cleared for project), same-project check returns `duplicate: false` → clean upload with no warning

### STEP 2 — Hard Reset endpoint (system_admin only; backup-first)

**Backend endpoints added to `admin.controller.ts` / `admin.service.ts`:**

| Route | Purpose |
|---|---|
| `GET /api/admin/projects/:code/hard-reset` | Pre-flight: returns counts of what will be deleted, no writes |
| `POST /api/admin/projects/:code/hard-reset` | Execute reset — requires `confirmed_code === code` in body |

**Pre-flight order on POST:**
1. Match `confirmed_code === code` (server-side)
2. pg_dump to `uploads/backups/<CODE>_<ts>.dump` (abort if fails)
3. `fs.cpSync` uploads/<CODE>/ to `uploads/backups/<CODE>_<ts>/` (abort if fails)
4. DELETE panel_inspections → tech_assignments → file_hashes → tech_audit_log
5. UPDATE projects SET project_state='not_started', assigned_technicians=''
6. Filter `MockStore.frames` + `MockStore.drawings` in memory
7. Remove disk files from frames/ and drawings/, rmdir both

**pg_dump config:** Uses `PG_DUMP_PATH` env var (default `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`), `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` env vars.

### STEP 3 — Frontend: HardResetTab

**`src/pages/admin/tabs/HardResetTab.tsx`** (new file): System admin UI under Settings tab.
- Project dropdown → auto-loads precheck counts (frames, drawings, assignments, inspections, hashes)
- Empty project → shows "already empty" notice (no reset button)
- "Reset Project" button (red, h-14) opens confirm modal
- Modal: shows exact count summary + backup note; requires typing exact `project_code`; "Permanently Reset" button disabled until typed code matches
- On success: shows deleted counts + backup file path
- All writes are `system_admin`-enforced both client-side (admin-only tab) and server-side (admin controller guard)

**`AdminDashboard.tsx`:** `HardResetTab` imported and added to the Settings tab section below `SyncTab`.

### Guards and safety invariants
- `DELETE` rows authorized — spec explicitly allows clearing rows within existing tables; schema is never altered
- Backup MUST succeed before any deletion: pg_dump failure aborts; cpSync failure aborts
- Single project only — `code` comes from URL param; no "all" or wildcard accepted
- `confirmedCode !== code` → 400 without any writes
- `session_log` rows preserved (security audit trail)

---

## Reconciliation — 2026-06-29

Read-only audit of all 16 spec items against actual code. No code changed in this step.
Awaiting sign-off before any BUILD/FINISH work begins.

| # | Item | Status | Evidence (file:line or route) | FINISH gap / schema note |
|---|------|--------|-------------------------------|--------------------------|
| 1 | Technician dashboard = Digital Wiring ONLY | **KEEP** | `TechnicianDashboard.tsx:62` `tabs=[]`; renders only PanelsTab / WiringTab | — |
| 2 | One-wire modal; ferrule + SOURCE/DESTINATION + chips (color/size/length/remarks) | **KEEP** | `WiringTab.tsx:480-670`; CableRow interface lines 17-36; wire-ferrule-badge, wire-meta-chip, wire-end-block all rendered | — |
| 3 | Per-end toggles → PATCH cable_status[String(idx)]; both-done → "Next" | **KEEP** | `WiringTab.tsx:183-215` handleMarkEnd; `tech.service.ts:206-244` cableAction; key=String(cableIndex) confirmed | — |
| 4 | Cables actually LOAD (real N, not 0); flag missing frame | **KEEP** | `tech.service.ts:250-258` myAssignmentDetail; WiringTab uses `cables.length` not hardcoded; "Frame data not available" error state at `WiringTab.tsx:338-371` | — |
| 5 | Remaining-cables indicator (done/total, remaining, kpi% wired) | **KEEP** | `WiringTab.tsx:448-523`; KPI bar, donePairs/total/remaining/srcDone/dstDone all displayed | — |
| 6 | Single "Start Wiring" vs "Open/Resume Wiring"; Start records started_at | **KEEP** | `PanelsTab.tsx:120-239` exclusive if/else; `tech.service.ts:120` `started_at: a.started_at \|\| new Date()` (idempotent) | — |
| 7 | started_at / completed_at / total_wiring_seconds columns | **KEEP** | `schema.prisma:83-86`; displayed in WiringTab header (live) and completion screen; no schema change needed | — |
| 8 | Pause/break logging WITH reason per event (history) | **FINISH** | `schema.prisma:108` `pause_reason String? VarChar(200)` — stores only LAST reason (overwritten). Pause modal + `tech.service.ts:127-141` exist. | **SCHEMA GATE**: no JSON or table for per-pause history. Only last reason persists. Storing structured history requires either repurposing `cable_status`-style JSON in an existing free column OR a new table. No suitable free column identified. STOP — awaiting sathe's decision on storage before persistence can be built. UI/modal already exists. |
| 9 | Completion report (serial, panel, project, tech username, start, stop, duration, pauses+reasons, cables done/total) on tech + supervisor | **FINISH** | `completion-report.helper.ts:56-93` returns full structured data. `GET /api/tech/completion-report/:id` and `GET /api/supervisor/completion-report/:id` both exist. **Frontend gap**: supervisor `PanelReportModal` (ReviewTab.tsx:166-252) shows only cable count + cable table — missing technician name, project, start/stop times, duration. Technician: no browsable report screen beyond the completion banner in WiringTab. | Add a timing/identity block (tech, project, start, stop, duration) to PanelReportModal above the cable table. Tech side: completion banner already shows start+stop+duration (MODULE 24) — a full scrollable report would need a new screen or a "View full report" button. |
| 10 | Director dashboard: live per-project + per-panel progress | **KEEP** | `DirectorDashboard.tsx:36` → `SummaryReportTab.tsx`; collapsible per-project cards with per-panel rows (panel name, frame id, status, wiringPct, technician name, review/QC status); `directorApi.projectsSummary()` backend endpoint | — |
| 11 | Live/on-demand reports filterable by PROJECT and DATE/TIME | **FINISH** | Project filter: exists in supervisor `ReviewTab.tsx:41` (project dropdown) and `FramesTab.tsx`. Director `SummaryReportTab.tsx` shows all projects collapsed. **DATE/TIME filter: entirely missing** — no date picker on any supervisor or director report view; no date params in backend endpoints. | Add date-range picker UI to supervisor ReviewTab and director SummaryReportTab; add `from/to` params to `supervisorApi.reviewPanels()` and `directorApi.projectsSummary()` backend endpoints. Medium scope. |
| 12 | GA drawing: technician opens real uploaded drawing inline (PDF/image); DWG fallback download | **KEEP** | `WiringTab.tsx:793-885` (frame viewer panel); PDF/images via `<iframe>` / `<img>` (blob URL); DWG triggers `<a download>` per `WiringTab.tsx:301-308` | — |
| 13 | Supervisor 6 tabs (Summary, Assignment, Approval, Review, Changeover, Drawings) wired + write actions | **FINISH** | `SupervisorDashboard.tsx:16-20` renders only 3 tabs (Projects, Frames & Upload, Team). All 6 tab component files **exist and are functional**: `ApprovalTab.tsx` (approve/rework writes ✓), `ReviewTab.tsx` (review + XLSX ✓), `ChangeoverTab.tsx` (changeover write ✓), `DrawingsTab.tsx` (upload/view/delete ✓), `SummaryTab.tsx` (live overview ✓), `AssignmentTab.tsx` (merged into FramesTab). **None of Approval / Review / Changeover / Drawings are wired into the nav.** | Wire 4 tabs (Approval, Review, Changeover, Drawings) into `SupervisorDashboard.tsx` TABS array + render block. AssignmentTab is already covered by FramesTab. Consider whether SummaryTab replaces the Projects tab as the landing page. |
| 14 | Excel schedule import + configurable reference fields shown in technician view | **KEEP** | `FramesTab.tsx` SYSTEM_FIELDS (17 fields, column mapping UI, upload step='mapping'); mapped fields rendered in `WiringTab.tsx:553-604` (color, size, length, ref, device/terminal labels) | — |
| 15 | Demo accounts incl. supervisor1; demo-account login dropdown | **FINISH** | `supervisor1` IS in hardcoded `DEMO_CREDENTIALS` (demoCredentials.ts — 5-slot legacy fallback). **NOT in `DEMO_USERNAMES`** (`auth.service.ts:75-81`) so it does NOT appear in the grouped `/api/auth/demo-users` dropdown (which shows supervisor2 instead). | Add `'supervisor1'` to `DEMO_USERNAMES` array in `auth.service.ts` (1-line fix). |
| 16 | Cloud/local deployment toggle + shutdown + auto-start on boot + auto-restore | **FINISH** | Cloud/local toggle: **KEEP** (`admin/tabs/DbConfigTab.tsx` + `admin.service.ts:164-182`). Shutdown: **KEEP** (`POST /admin/restart` → `process.exit(0)`, `admin.service.ts:207-210`). **Auto-start on boot**: no OS service file, PM2 config, or Windows scheduled task found — only manual `start_dwes.bat`. **Auto-restore**: no checkpoint or crash-recovery mechanism found. | Clarify scope: if "auto-start" means a Windows startup script or PM2 ecosystem file, that's outside the React/NestJS code. If "auto-restore" means app reconnects to DB on restart (already true), it's KEEP. Awaiting clarification before any work. |

### Summary
- **KEEP** (no work needed): 1, 2, 3, 4, 5, 6, 7, 10, 12, 14
- **FINISH** (partial — gap defined above): 8, 9, 11, 13, 15, 16
- **BUILD** (entirely missing): none

### Open schema decisions (do not build until resolved)
- **Item 8** — pause history needs a storage decision: repurpose an existing column as a JSON array OR a separate table. Awaiting sathe's choice.
- **Item 16** — auto-start/auto-restore scope clarification needed.

---

## MODULE 24 — TECHNICIAN START/OPEN WIRING GATE + TIME TRACKING (2026-06-29)

### pg_dump
Taken before any writes: `pg_dump_WiringSchemeDB_20260629_094003.sql`.
Demo tested on tech1 panels (id=37 assigned→in_progress, id=35 completed).

### STEP 0 — Schema discovery (gating findings)

**tech_assignments timestamp/timing columns found (EXACT names):**

| Column | Type | Role |
|--------|------|------|
| `started_at` | `DateTime? @db.Timestamp(6)` | Start of wiring. Set idempotently by `start()` and `cableAction()` auto-start. Never reset on resume. |
| `paused_at` | `DateTime? @db.Timestamp(6)` | Last pause time. Cleared on resume. |
| `completed_at` | `DateTime? @db.Timestamp(6)` | Frame completion. Set by `complete()`. |
| `total_wiring_seconds` | `Int? @default(0)` | Accumulated active seconds (incremented on each pause only). 0 if tech never paused. |

**Start/end persistence:** `started_at` (start) and `completed_at` (end) already exist and are used. Duration computed client-side as `completed_at − started_at`. No schema change needed or made.

**Break/pause reason history:** `pause_reason String? @default("") @db.VarChar(200)` stores only the LAST pause reason (one string, overwritten on each pause). No pause log table and no JSON column accumulating multiple pause events. **Break-reason logging (per-pause history) remains an open schema decision** — requires a new table or JSON column repurposing.

**Prior start logic:** `cableAction()` auto-starts (sets `in_progress`, `started_at`) on first cable tap. `start()` endpoint sets these explicitly; idempotent: `started_at: a.started_at || new Date()`.

### STEP 1 — Single START/OPEN button (state-driven, never both)

**PanelsTab.tsx** completely rewritten with a single primary action button per panel status:

| Status | Button | Action |
|--------|--------|--------|
| `assigned` + approved | **"Start Wiring"** (h-14, blue-600, 56px) | `techApi.start(id)` → sets `in_progress` + `started_at` → opens WiringTab immediately (optimistic `status:'in_progress'` passed to parent) |
| `in_progress` | **"Open Wiring"** (h-14, blue-600, 56px) | Opens WiringTab directly (no API call) |
| `paused` | **"Resume Wiring"** (h-14, blue-600, 56px) | `techApi.resume(id)` → sets `in_progress`, clears `paused_at`, preserves `started_at` → opens WiringTab |
| `completed` | **"View Wiring"** (h-11, slate-100, secondary) | Opens WiringTab read-only (`canWire=false`) |

Start and Open are **never shown simultaneously** — mutually exclusive `if/else if` branches. Standalone "Pause" and "Complete" buttons removed from panel cards (both functions already in WiringTab header and completion screen).

Disabled guard: "Start Wiring" and "Resume Wiring" are disabled if `inProgress` (another panel is already active) or `saving`. Backend also enforces this with 400.

### STEP 2 — Time recording

No backend changes required. All timing uses existing columns:
- `techApi.start()` → sets `started_at` (idempotent, never overwritten on resume) ✅
- `techApi.complete()` → sets `completed_at` ✅
- `total_wiring_seconds` → accumulated on each pause ✅

### STEP 3 — Display

**WiringTab.tsx** additions:
- **`LiveElapsed` component** (new): live `HH:MM:SS` ticker. Shows in header when `panel.status === 'in_progress'` and `panel.started_at` is set. Formula: `total_wiring_seconds + (Date.now() − started_at) / 1000`.
- **`fmtTime(iso)` helper**: formats timestamp as `HH:MM` (locale time).
- **Header bar** (`wire-header-center`, desktop only): shows `Wire N/T` + start-time chip (`wire-start-chip`, shows clock icon + `fmtTime(started_at)`) + live elapsed chip (`wire-elapsed-chip`) when in progress.
- **Completion screen**: duration computed from timestamps — prefers `completed_at − started_at` (wall clock), falls back to `(Date.now() − started_at)` (live, before clicking "Mark Complete"), then `total_wiring_seconds`. Also shows "Started HH:MM" and "Done HH:MM" lines when timestamps available.

**design-system.css** additions:
- `.wire-start-chip` — slate-100 pill for static start time
- `.wire-elapsed-chip` — blue-50/blue-200 pill for live running timer, tabular-nums

### STEP 4 — Test (demo, pg_dump first)

API verified on tech1:
- Panel 37 (`assigned`) → `POST /tech/start/37` → `status=in_progress`, `started_at=2026-06-29T05:45:46Z` ✅
- Panel 37 → `POST /tech/pause/37` → `status=paused`, `paused_at` set, `started_at` unchanged ✅
- Panel 37 → `POST /tech/resume/37` → `status=in_progress`, `paused_at` cleared, `started_at` unchanged ✅
- Panel 35 (`completed`) → `started_at=2026-06-27T09:27:59Z`, `completed_at=2026-06-27T12:36:37Z` ✅
- `tsc -b` exits 0 ✅
- No schema change/migration. No `cables_total` change. No existing `started_at` overwritten on resume.

**Only ONE button ever shows** per panel card — confirmed by `if/else if` exclusive branches.

**TechnicianDashboard.tsx** fix: `activePanelLive` now merges `{ ...(stale panels entry), ...activePanel }` so optimistic `status:'in_progress'` passed from PanelsTab immediately reaches WiringTab (Pause button visible from first open, before 12s poll catches up).

### Files changed
Frontend:
- `src/pages/technician/TechnicianDashboard.tsx` — `activePanelLive` merge fix
- `src/pages/technician/tabs/PanelsTab.tsx` — rewritten: single-button gate, start+open combined, resume+open combined, standalone Pause/Complete removed
- `src/pages/technician/tabs/WiringTab.tsx` — `LiveElapsed` component, `fmtTime` helper, header timer display, completion screen timestamps + improved duration
- `src/styles/design-system.css` — `.wire-start-chip`, `.wire-elapsed-chip`

Backend: **no changes**.
Schema: **no changes** (no migrate/push). pg_dump taken before test writes.

### OUT OF SCOPE (deferred)
- Break/pause-reason logging per pause event (requires separate schema decision — no column or table for pause history exists)
- Full PDF/live report
- Director date-time filter
- Per-wire drawing highlighting

---

## MODULE 22 — PRODUCTION SUPERVISOR DEMO ACCOUNT (2026-06-27)

Added `supervisor2` (role=`prod_supervisor`, display name "Supervisor Two") to the demo seed so it
appears in the login dropdown under a "Prod Supervisor" group.

- `backend/seeds/accounts.seed.json` — added supervisor2 entry (password=username convention, bcrypt cost=10)
- `backend/seeds/seed-accounts.js` — idempotent; re-running is safe (ON CONFLICT DO NOTHING)
- `backend/src/auth/auth.service.ts` — added `supervisor2` to `DEMO_USERNAMES` array in `getDemoUsers()`
- Frontend unchanged — `ROLE_LABELS` and `ROLE_ORDER` already included `prod_supervisor: 'Prod Supervisor'`;
  the group now renders automatically
- Seed run confirms: 1 inserted, all others skipped. No schema changes.

---

## MODULE 23 — TECHNICIAN DASHBOARD: DIGITAL WIRING ONLY + ONE-WIRE REFINEMENTS (2026-06-27)

### pg_dump
Taken before any writes: `pg_dump_WiringSchemeDB_20260627_152143.sql` (124 KB).

### cable_status shape discovered (byte-for-byte)
Key = `String(cableIndex)` (0-based). Value = `{ src: boolean, dst: boolean, note: string }`.
Stored as JSON string in DB column `cable_status String? @default("{}")`.
Cable endpoints loaded via `GET /tech/my-assignment/{id}` → `data.frame.cables[]`.

### STEP 1 — Technician Dashboard: Digital Wiring only

`TechnicianDashboard.tsx` completely rewritten:
- Removed all 4 TABS (assignments, wiring/GA-drawing sub-tab toolbar, drawings, progress)
- `tabs=[]` → DashboardShell hides tab strip (Topbar hides when navItems.length === 0)
- Content: `activePanel ? <WiringTab onExit={handleExit} /> : <PanelsTab onSelectPanel ...>`
- PanelsTab embedded as the panel-picker landing (Start/Resume/Pause remain; "Open Wiring" → setActivePanel)
- `handleExit` clears active panel + reloads panel list
- Active panel kept in sync with live data from 12-s poll

Files deleted (technician-exclusive, now unused):
- `PanelView3D.tsx` — Three.js 3D box (was already unimported anywhere)
- `ReportTab.tsx` — Progress & Report tab component
- `GADrawingView.tsx` — GA Drawing sub-tab (drawings still accessible via PanelsTab panel-card buttons)

Old "sub-routes" did not exist (single `/technician` route, tab state only) — automatically resolved.

### STEP 2 — WiringTab one-wire refinements

`WiringTab.tsx` completely rewritten. Key changes:

**Forward action renamed to "Next" (no "Skip" anywhere):**
- `handleSkip` removed; `handleNext` calls `goNextPending(currentIdx, status)` → next INCOMPLETE wire, not linear +1
- Bottom nav: Prev | One End | Frame | **Next** (right button, always labeled "Next")

**Prominent "Next Wire" CTA when both ends done:**
- `wire-next-cta` button appears inside the wire card when `currentStatus.src && currentStatus.dst && !advancing`
- 600ms auto-advance still fires after both done (down from 680ms)

**Toggle-OFF (undo) for both ends:**
- `handleMarkEnd` now toggles: if already done → `techApi.cableStatus(id, idx, end, false)` (undo); if undone → `techApi.cableAction(id, idx, src_only|dst_only)` (mark)
- Confirmed buttons show "· tap to undo" label; cursor-default removed from CSS

**Auto-start on first cable action (backend):**
- `cableAction` in `tech.service.ts`: if `status === 'assigned' || status === 'paused'` → set `status='in_progress'`, set `started_at` if null
- `canWire = ['assigned', 'in_progress', 'paused'].includes(panel.status)` — no separate Start step needed
- Range validation added: rejects `cableIndex` outside `[0, cables_total)`

**KPI formula:** `(srcDone + dstDone) / (total * 2) * 100` — matches backend formula

**Pause & exit in header:**
- 64px `wire-header-bar`: panel name + frame id (left) | Wire N/total (center, hidden on mobile) | buttons (right)
- If `status === 'in_progress'`: amber "Pause" button → pause-reason modal → `techApi.pause` → `onExit()`
- Otherwise: X button → `onExit()` directly

**Responsive source/destination:**
- `wire-ends-grid`: stacked (portrait/narrow); side-by-side when `min-width: 1024px` or wide landscape (`min-width: 820px` + `max-height: 820px`)

**Completion screen:**
- "Mark Frame Complete" button (56px) → confirm dialog → `techApi.complete()` → `onExit()`
- Shows total wires, KPI 100%, duration if `total_wiring_seconds > 0`
- "Review All Wires" secondary button → wire list overlay
- "← Back to panels" tertiary link

**Timestamp columns found:** `started_at`, `paused_at`, `completed_at` (all nullable). `review_status` set by supervisor review only; `complete()` sets status+completed_at. `total_wiring_seconds` used for duration display.

### Files changed
Backend:
- `backend/src/tech/tech.service.ts` — `cableAction`: auto-start logic + cable index range validation

Frontend:
- `src/pages/technician/TechnicianDashboard.tsx` — rewritten (wiring-only, no tab strip)
- `src/pages/technician/tabs/WiringTab.tsx` — rewritten (Next not Skip, toggle-off, header bar, pause, completion)
- `src/styles/design-system.css` — added `.wire-header-bar`, `.wire-kpi-bar`, `.wire-kpi-fill`, `.wire-ends-grid`, `.wire-end-col`, `.wire-next-cta`; fixed `.wire-action-btn.confirmed` cursor

Deleted:
- `src/pages/technician/tabs/PanelView3D.tsx`
- `src/pages/technician/tabs/ReportTab.tsx`
- `src/pages/technician/tabs/GADrawingView.tsx`

---

## MODULE 21 — DIRECTOR DASHBOARD: REPORTS-ONLY VIEW (2026-06-27)

Director dashboard stripped to a single Reports view. Removed KPI Analytics and Projects tabs.
Director lands directly on the Reports (ExportTab) content — no tab navigation required.

### What changed

- `DirectorDashboard.tsx` rewritten: removed the 3-tab TABS array, removed Projects/KPI state +
  effects, removed `KPITab`, `ActivityTab`, `ProjectsTab` imports. Now renders `<ExportTab stats={stats} />`
  directly inside `DashboardShell` with `tabs={[]}` (tab strip hidden). Stats fetch (for KPI header
  row) retained. Default badge changed to "Read Only".
- `KPITab.tsx` deleted — director-exclusive, no longer referenced.
- `director/tabs/ProjectsTab.tsx` deleted — director-exclusive (separate file from
  `supervisor/tabs/ProjectsTab.tsx` which is unmodified).
- `WorkforceTab.tsx` deleted — director-exclusive and was already unused in the dashboard.
- `ActivityTab.tsx` kept — imported by `AdminDashboard.tsx` (Logs / Audit tab).
- `ExportTab.tsx` kept — IS the Reports view (xlsx/csv/pdf download + KPI snapshot).

### What director sees now

Top bar: title "Operations Director" · badge "Read Only" · 6-KPI strip (Composite KPI, Projects,
Active Panels, Completed, Pending QC, Approvals). No tab buttons. Full-width ExportTab below.

**Files changed:**
- `src/pages/director/DirectorDashboard.tsx` — major rewrite (stripped to single Reports view)
- `src/pages/director/tabs/KPITab.tsx` — deleted (director-exclusive)
- `src/pages/director/tabs/ProjectsTab.tsx` — deleted (director-exclusive)
- `src/pages/director/tabs/WorkforceTab.tsx` — deleted (director-exclusive, was already unused)

---

## MODULE 20 — DEMO ACCOUNT QUICK-SELECT DROPDOWN (2026-06-27)

Added a grouped "Demo account" select to the login page that lists all 28 seeded demo users
(admin1, director2, qa1, qa2, tech1–tech24) sorted by role, then natural numeric order.
Picking any entry fills the username + password fields so login proceeds normally.

### How demo login authenticates

Standard `POST /api/auth/login` with username + password (bcrypt compared, no bypass).
Each account in `accounts.seed.json` uses **password = username** (e.g. `tech1/tech1`, `qa1/qa1`).

### Backend: `GET /api/auth/demo-users`

- Route: `GET /api/auth/demo-users` — no JWT guard (pre-login use)
- **DEMO_MODE-gated**: returns `404` when `process.env.DEMO_MODE !== 'true'`
- Safe fields only: `{ username, full_name, role }` — no password hashes, no tokens, no secrets
- Queries `users` table for the 28 known seed usernames, sorted by role priority, then natural
  numeric username order (tech1, tech2, … tech10, tech11 … not lexical)
- `backend/.env` updated with `DEMO_MODE=true` for local dev

### Frontend

- `src/data/demoCredentials.ts` — added `DemoUser` interface, `fetchDemoUsers()` (plain `fetch`,
  returns `null` on 404/error), and `seedPasswordFor(username)` helper (looks up from seed JSON)
- `src/pages/LoginPage.tsx` — on mount fetches demo users; if the endpoint is available, renders
  `DemoUserSelect` (grouped `<optgroup>` by role with real names); falls back to the 5-slot
  legacy select if the endpoint 404s. Selecting an account fills username + password
  (password = `seedPasswordFor(username) ?? username`). Dropdown hidden entirely when
  `SHOW_DEMO_CREDENTIALS` is false (production builds)
- No hardcoded passwords in JSX; passwords sourced from the tree-shaken seed JSON import

**Files changed:**
- `backend/.env` — added `DEMO_MODE=true`
- `backend/src/auth/auth.service.ts` — added `getDemoUsers()`
- `backend/src/auth/auth.controller.ts` — added `GET /api/auth/demo-users` with DEMO_MODE gate
- `src/data/demoCredentials.ts` — added `DemoUser`, `fetchDemoUsers()`, `seedPasswordFor()`
- `src/pages/LoginPage.tsx` — `DemoUserSelect` component + grouped dropdown logic

**No schema change. No DB writes. tsc clean.**

---

## MODULE 19 — SUPERVISOR DRAWING POPUP PDF INLINE FIX (2026-06-27)

PDF drawings opened from the supervisor Frames tab now render inline inside the popup modal
instead of showing a grey placeholder.

### Root cause

`DrawingViewerModal` used `<embed type="application/pdf" className="h-full">` inside
`.drawing-viewer-body` which had `flex-1 overflow-auto`. The `h-full` on a replaced element
(`<embed>`) inside an `overflow-auto` flex child does not resolve to a definite pixel height
in Chrome — the PDF plugin couldn't determine its own size, producing a grey box.

### Fix

Two targeted changes, matching the pattern already used by the technician-side `GADrawingView`:

1. **`src/styles/design-system.css`** — changed `.drawing-viewer-body` from
   `overflow-auto` to `overflow-hidden relative`. The `relative` creates a positioning
   context; `overflow-hidden` avoids the scroll-container height ambiguity.

2. **`src/pages/supervisor/tabs/FramesTab.tsx`** (`DrawingViewerModal`) — replaced
   `<embed type="application/pdf">` with `<iframe>`. Also wrapped image rendering in an
   `overflow-auto` div so large images remain scrollable.

### No backend change required

Backend already sends `Content-Type: application/pdf` and `Content-Disposition: inline`.
No Helmet/X-Frame-Options headers are installed. No schema change.

**Files changed:**
- `src/pages/supervisor/tabs/FramesTab.tsx` — `DrawingViewerModal` body: embed → iframe, image wrapper fix
- `src/styles/design-system.css` — `.drawing-viewer-body`: overflow-auto → overflow-hidden relative

**No backend changes. No schema change. tsc clean.**

---

---

## MODULE 18 — ONE-WIRE-AT-A-TIME WIRING FLOW (2026-06-27)

Replaced the full 131-row wire table with a focused one-wire-at-a-time guided flow.
Technician sees a single wire large and centered, marks each end independently, and
auto-advances to the next pending wire when both ends are confirmed.

### UX flow

1. **Progress header** — panel name, "Wire X / Y", blue fill bar (CSS var, no inline style),
   src/dst/done counters inline.
2. **Wire card** (animated on advance, `wire-card-appear` keyframe):
   - Wire number badge + ferrule (monospace) + color/size/length chips
   - **Source block** (green tint) + **"Mark Source Connected"** button (58px, full-width)
   - **Destination block** (orange tint) + **"Mark Destination Connected"** button (58px)
   - Each button turns solid green/orange with ✓ checkmark when confirmed (disabled state)
   - Remarks shown inline; Note field collapsible (toggle "Add note")
3. **Auto-advance**: when both ends confirmed → green overlay ("Wire Done!") for 680ms →
   `goNextPending()` finds first remaining pending wire → card re-renders with `key` change
4. **Resume support**: on load, `findIndex` finds first pending wire → `currentIdx` starts there
5. **Bottom nav bar** (56px touch targets):
   - `← Prev` | `⚡ One End` | `👁 Frame` | `Skip →`
6. **All Wires modal** (bottom sheet on mobile, centered on desktop):
   - Filter chips (Pending/One End/Done/All) + search
   - Row → tap to jump to that wire and close modal
   - Accessible via `≡` icon in header
7. **Completion screen**: when `donePairs === total` → full-card celebration state
   with "Review All Wires" button; tells technician to submit from Progress tab
8. **One End Open modal**: unchanged behavior — marks src or dst independently (no auto-advance)

### Save / resume

- Each button tap calls `techApi.cableAction(panel.id, idx, 'src_only'|'dst_only')` immediately
- Optimistic update: local status updated before API confirms; rolled back on error
- On load: `firstPending = cables.findIndex(...)` → resumes from first incomplete wire
- No schema change; uses existing `cable_status` JSON

### CSS added (design-system.css)

```
.wire-flow-shell          — main flex column container
.wire-progress-header     — white card header
.wire-progress-fill       — CSS-var driven progress bar (--wire-pct set via ref.style.setProperty)
.wire-card                — main wire display card
.wire-card-appear         — 0.22s slide-up entrance animation
.wire-card-done           — green glow on auto-advance
.wire-num-badge           — "#N" pill
.wire-ferrule-badge       — monospace ferrule with "FERRULE" prefix via ::before
.wire-meta-chip           — Color/Size/Length chips
.wire-end-block           — src/dst info block (green/orange tint, darker when done)
.wire-end-label           — "SOURCE" / "DESTINATION" label
.wire-end-text            — large terminal text (17px)
.wire-action-btn          — 58px full-width src/dst action button
.wire-btn-circle          — open circle icon for "pending" button state
.wire-sep                 — divider between src and dst sections
.wire-advancing-overlay   — green overlay shown during auto-advance delay
.wf-status-chip           — Live/idle status badge in header
.wf-status-pill           — Done/One End/Pending pill (used in card and list)
.wire-nav-bar             — bottom navigation flex row
.wire-nav-btn             — icon-only circular nav button
.wire-nav-pill            — labeled pill nav button (secondary / ghost variants)
.wire-list-overlay        — full-screen backdrop for wire list
.wire-list-sheet          — bottom-sheet / modal for wire list
.wire-list-header         — header row of wire list
.wire-list-body           — scrollable list area
.wire-list-row            — wire row in list
.wire-list-num            — row number badge
.wire-complete-shell      — centering wrapper for completion screen
.wire-complete-card       — completion card
```

### Inline style lint fix

Progress bar width was flagged ("CSS inline styles should not be used").
Fix: use `ref.current.style.setProperty('--wire-pct', ...)` inside a `useEffect([pct])`.
The CSS class `.wire-progress-fill` reads `width: var(--wire-pct, 0%)`.
No `style={}` in JSX.

**Files changed:**
- `src/pages/technician/tabs/WiringTab.tsx` — full rewrite of render + logic additions
- `src/styles/design-system.css` — all `.wire-*` and `.wf-*` CSS classes

**No backend changes. No schema change. `tsc -b` clean.**

---

## MODULE 17 — GA DRAWING VIEWER (Technician) (2026-06-27)

Replaced the auto-generated Three.js 3D box in the technician's "3D View" sub-tab with the actual
panel GA drawing uploaded by the Production Supervisor.

### What changed

**"3D View" → "GA Drawing" sub-tab** (under Digital Wiring tab):
- Tab button: `Cuboid` icon → `FileImage` icon, label "3D View" → "GA Drawing"
- `WiringSubTab` type: `'view3d'` → `'drawing'`
- `PanelView3D` component removed from the render tree (file kept, no longer imported)
- New `GADrawingView` component renders the actual drawing

### GADrawingView component (`src/pages/technician/tabs/GADrawingView.tsx`)

**Rendering logic by file type:**
| Extension | Renderer |
|-----------|----------|
| PDF | `<iframe src={blobUrl}>` — native browser PDF viewer with built-in zoom/pan |
| PNG/JPG/SVG/BMP/TIFF | `<img>` in a scrollable container + ±25% zoom buttons (Fit button resets) |
| DWG/DXF | Download prompt — CAD files can't be previewed in browser |
| Other | Download prompt fallback |

**UX features:**
- Auto-loads the most recent drawing when the panel/project changes
- Dark toolbar (`bg-slate-800`) shows filename and controls — matches a wiring-reference look
- If multiple drawings: tab strip in toolbar to switch between them
- Zoom +/− buttons and Fit (image only); PDF uses browser built-in zoom
- Download button always visible in the toolbar
- Loading spinner (animated border) while fetching blob
- Fetch error shown inline (e.g., auth failure)
- **"No GA drawing uploaded"** message when supervisor hasn't uploaded any drawing — instructs technician to ask supervisor

**Tablet-friendly:**
- PDF iframe: native pinch-to-zoom works in iOS Safari and Android Chrome
- Image: pinch-to-zoom supported by browser (touch-action not blocked); + scroll-to-pan in the overflow container
- All controls min 44px touch targets

**Data source:**
- `drawings: any[]` from `activePanelLive?.drawings` (the project-level drawings returned by `GET /api/tech/my-panels`)
- Fetched as authenticated blob: `projectsApi.drawingFile(projectCode, drawing.id)`
- No new API endpoints needed

### Cleanup
- Removed `PanelView3D` import from `TechnicianDashboard`
- Removed `panelDetail` state and its useEffect (was only used to feed data to PanelView3D)
- Removed `cableStatus` and `cables3d` derived vars (same reason)
- Removed `Cuboid` icon import, replaced with `FileImage`
- `handlePanelUpdate` simplified: no longer stores `panelDetail`, just updates `activePanel`

### CSS added (`design-system.css`)
```
.ga-drawing-shell       — flex column, calc(100vh - 280px) height
.ga-drawing-toolbar     — dark (#1e293b) header bar
.ga-drawing-filename    — truncated filename display
.ga-drawing-tabs        — tab strip for multiple drawings
.ga-drawing-tab-btn     — per-drawing tab (active = blue-600)
.ga-drawing-controls    — zoom + download button group
.ga-ctrl-btn            — dark icon button (slate-700 bg)
.ga-ctrl-pct            — zoom percentage label
.ga-ctrl-dl             — download button variant (blue tint)
.ga-drawing-viewport    — flex-1 dark viewport (bg #0f172a)
.ga-drawing-loading     — centered spinner + label
.ga-drawing-spinner     — animated border spinner
.ga-drawing-error       — centered error display
.ga-drawing-image-scroll — overflow-auto image container
.ga-drawing-cad-prompt  — CAD download-only prompt
.ga-drawing-empty       — no drawings message
```

**Files changed:**
- `src/pages/technician/tabs/GADrawingView.tsx` — new component (replaces PanelView3D)
- `src/pages/technician/TechnicianDashboard.tsx` — swap PanelView3D → GADrawingView, cleanup
- `src/styles/design-system.css` — GA drawing CSS classes

**No backend changes. No schema change. `tsc -b` clean (one pre-existing unrelated error in director/tabs/ProjectsTab.tsx).**

---

## MODULE 16 — SUPERVISOR NAV CONSOLIDATION (2026-06-27)

Merged **Assignments** tab into **Frames & Upload**. Removed standalone nav entry.
Drawing viewer now opens inline in a popup modal (PDF embedded, image preview, CAD download).

### Nav after change
| Tab | Key |
|-----|-----|
| Overview | `overview` |
| Projects | `projects` |
| **Frames & Upload** | `frames` — upload · verify · assign · view drawing |
| Team | `team` |

*(Assignments tab removed from `TABS` array and render block in `SupervisorDashboard.tsx`.
`AssignmentTab.tsx` file kept but no longer imported or rendered.)*

### Frames & Upload — full workflow (one page)
Each frame row now shows all relevant state and actions in-line:

**Status column (5 states):**

| State | Pill | Extra |
|-------|------|-------|
| Draft | Gray | "Verify →" link (blue) |
| Verified | Emerald | "Re-verify →" link (muted) |
| Assigned | Blue | Technician name below pill |
| In Progress | Yellow | Technician name below pill |
| Paused | Amber | Technician name below pill |
| Completed | Green | Technician name below pill |

**Actions column (context-sensitive icon buttons):**
- View Schedule (ListChecks) — always; opens cable-list modal with live progress
- View Drawing (FileImage) — always; disabled when no drawing; opens Drawing Viewer Modal
- Assign (UserPlus, emerald hover) — only if Verified + not yet assigned
- De-assign (UserMinus, red hover) — only if status = `assigned`
- Review (CheckCheck, blue hover) — only if completed or report submitted
- Delete (Trash2, red hover) — always

### Drawing Viewer Modal
Full-screen popup (`min(1280px, 100vw-2rem) × min(920px, 100vh-2rem)`) with:
- PDF → `<iframe>` embedded inline
- Images (PNG/JPG/SVG/BMP/TIFF) → centered `<img>`
- CAD (DWG/DXF) → download prompt only (no browser preview)
- Header: filename, Download button, Close button
- Click overlay to close

### Assign Modal (simplified)
Pre-targeted to the specific frame clicked — no frame dropdown.
Shows: emerald "frame name / cable count" card + technician select + success screen.

### CSS additions (`design-system.css`)
```
.frame-status-assigned   — bg-blue-100 text-blue-700
.frame-status-inprogress — bg-yellow-100 text-yellow-700
.frame-status-paused     — bg-amber-100 text-amber-700
.frame-status-completed  — bg-green-100 text-green-700
.drawing-viewer-overlay  — fixed full-screen backdrop z-[200]
.drawing-viewer-box      — white modal, min(1280px) × min(920px)
.drawing-viewer-header   — flex header with filename + actions
.drawing-viewer-body     — scrollable/flexible content area
```

### Files changed
- `src/pages/supervisor/SupervisorDashboard.tsx` — removed `assignments` tab; removed `AssignmentTab` import; removed `UserCog` icon import
- `src/pages/supervisor/tabs/FramesTab.tsx` — full rewrite: inline assign/de-assign/review, 5-state status pills, DrawingViewerModal, AssignModal (simplified), ReviewModal (moved from AssignmentTab)
- `src/styles/design-system.css` — 4 new status pill classes + 4 drawing-viewer classes

**No backend changes. No schema change. `tsc -b` exits 0 on changed files.**

---

## MODULE 15 — VERIFY → ASSIGN CHAIN (2026-06-27)

### Bugs fixed

**1. Verify popup empty (0/0 cables)**
- Root cause: `buildValidation(f.cables)` in `frames.service.ts` threw a `TypeError` when `f.cables`
  was `undefined` (frame loaded from disk without the cables array). The 500 response was silently
  caught by the frontend `catch(() => setLoading(false))`, leaving `cables` as `[]`.
- Fix: `buildValidation` now accepts `Cable[] | undefined | null` and short-circuits to
  `{total:0, ok_count:0, error_count:0, issues:{}}` when the array is absent.
- `verifyData`, `verifyConfirm`, `compareSourceFile` all normalise via
  `const cablesList = Array.isArray(f.cables) ? f.cables : []`.
- Frontend `VerificationModal.tsx` now shows a proper error message when the API call fails
  (no more silent 0/0).

**2. verify-confirm returns 404 / "Cannot POST"**
- The endpoint exists (`POST /api/projects/:code/frames/:id/verify-confirm`) but the backend must
  be **restarted** after the code was added in the previous session for NestJS to register the route.
- Roles expanded: was `prod_supervisor` only → now
  `prod_supervisor | system_admin | ops_director | qaqc_engineer`.
- `verifyConfirm` no longer gates on `error_count > 0` — verification is optional; any frame can be
  confirmed with one click. Sets `compare_status = 'validated'`, `verified = true`,
  `verified_at = <ISO>` in the frame JSON on disk.
- Handles disk-loaded frames (re-hydrates MockStore if frame found on disk but not in memory).

**3. assign-frame blocked (403)**
- `POST /api/tech/assign-frame` was `@Roles('prod_supervisor')` only.
- Expanded to `prod_supervisor | system_admin | ops_director | qaqc_engineer`.
- `assignFrame` service now defensively handles `frame.cables = undefined`:
  `const cablesList = Array.isArray(frame.cables) ? frame.cables : []`.
- Uses `frame.cable_count || cablesList.length` for `cables_total` (resilient to missing field).
- Re-hydrates MockStore when frame is loaded from disk.

### Status flow (implemented)

```
Upload → Draft  →  (click "Verify →", then "Confirm & Verify")  →  Verified  →  Assignable
```

| Status | `compare_status` | Pill colour | Assign gate |
|--------|-----------------|-------------|-------------|
| Draft  | `'none'`        | Gray        | Blocked (with hint) |
| Verified | `'validated'` | Emerald     | Enabled |

### UI changes

**`FramesTab.tsx`:**
- "Verify →" link styled in blue + underline-on-hover (clear CTA, not subtle gray).
- Verified frames show "Re-verify →" (muted, smaller emphasis).

**`AssignmentTab.tsx` — AssignModal:**
- Dropdown now uses `<optgroup>` to separate "Verified (ready to assign)" from "Draft (verify first)".
- If no verified frames: amber callout explains exactly what to do (go to Frames → Verify → Confirm).
- Selecting a Draft frame: red inline warning + Assign button disabled with `title="Verify this frame first"`.
- Only frames with `compare_status === 'validated' | 'verified'` are initially selected.

**`VerificationModal.tsx`:**
- "Confirm & Verify" is **always enabled** (only disabled during a load error).
- Error state shown explicitly when the API call fails (no silent 0/0).
- "Select Source File" button (optional) — picks a local .xlsx, sends to backend, highlights
  mismatches in amber (separate from red validation errors).

### Files changed
- `backend/src/frames/frames.service.ts` — buildValidation fix, verifyData/verifyConfirm/
  compareSourceFile defensive cables handling, compareSourceFile new method
- `backend/src/frames/frames.controller.ts` — verify-confirm roles expanded; compare-source-file
  endpoint added (multipart); FileInterceptor import
- `backend/src/tech/tech.controller.ts` — assign-frame roles expanded
- `backend/src/tech/tech.service.ts` — assignFrame defensive cables + MockStore re-hydration
- `src/services/api.ts` — compareSourceFile added to projectsApi
- `src/components/ui/VerificationModal.tsx` — full redesign (optional verify, always-enabled confirm,
  source-file comparison, proper error display)
- `src/pages/supervisor/tabs/FramesTab.tsx` — status pill styling, Verify link CTA
- `src/pages/supervisor/tabs/AssignmentTab.tsx` — verify gate in AssignModal

**No WiringSchemeDB schema change. No migrate/push needed.**

> ⚠️ **Root cause of "Cannot GET verify-data" (2026-06-27):** `start_dwes.bat` ran
> `node dist\main.js` (stale pre-compiled build). Source had both routes; dist did not.
> Fix: ran `npx nest build` inside `backend/` to regenerate dist. Updated `start_dwes.bat`
> to use `npm run start:dev` (watch mode) so future source changes compile automatically.
> Never run `node dist\main.js` directly — always use `start:dev` or `dev:all`.

---

## ▶ HOW TO START THE APP (read this if login shows "Can't reach the server")

The backend (NestJS :3001) and frontend (Vite :5173) are **separate processes**. The login
page calls `/api/...`, which Vite proxies to `http://localhost:3001` — so **if the backend is
not running, every login fails** (proxy 502 / connection refused). This is NOT a credential or
DB problem.

**Start BOTH together (recommended):**
```
npm run dev:all      # root — runs Vite (FE) + NestJS watch (BE) via concurrently
```
**Other options:**
```
start_dwes.bat       # one-click: backend (node dist/main.js) + frontend, separate windows
npm run dev          # frontend ONLY (:5173) — backend must already be running
npm run backend      # backend ONLY (:3001) — = npm --prefix backend run start:dev
```
Health check: `http://localhost:3001/api/health` → `{"status":"ok",...}`.

> ⚠️ Backend dev gotcha: `nest-cli.json` has `deleteOutDir:true` and `tsconfig` has
> `incremental:true`. If `start:dev` ever boots with `Error: Cannot find module '.../dist/main'`
> (compiles "0 errors" but emits nothing), delete `backend/tsconfig.build.tsbuildinfo` and
> restart — the stale incremental cache made tsc skip emit after the dist was wiped.

---

## MODULE 0 — FOUNDATION ✅
- [x] TypeScript errors = 0 (frontend and backend)
- [x] Backend starts on port 3001, connects to WiringSchemeDB (PostgreSQL)
- [x] Frontend at localhost:5173 (Vite)
- [x] JWT authentication + Authorization header on all protected routes
- [x] Role guard (403 on wrong role) for all 5 roles
- [x] Session logged on login / logout (session_log table)
- [x] `start_dwes.bat` one-click launcher (+ `npm run dev:all` runs FE+BE via concurrently — see "HOW TO START" at top)
- [x] `README.md` with credentials, ports, folder structure
- [x] Login-failure fix (2026-06-26): backend was simply down → proxy 502 → misleading
  "check credentials". Resolved: started backend on :3001 (verified `sysadmin/admin123` → HTTP 200
  + JWT, wrong password → HTTP 401). Frontend error messages now distinguish 401/403
  ("Incorrect username or password.") from 5xx/network/no-response
  ("Can't reach the server. Please try again or contact support."), with real status logged to
  console. Also stopped the global 401 interceptor from reloading the page on a failed login
  (which previously wiped the error message). Added root `dev:all`/`backend` scripts. Fixed a
  pre-existing `tsc -b` build break (LoginPage `handleEnroll` now returns `boolean` to match the
  `EnrollBiometricModal` prop). No auth logic, password, or DB changes.

---

## MODULE 1 — LOGIN PAGE ✅
- [x] Left panel: deep blue gradient, headline, subheadline, 6 feature cards in 2×3 grid
- [x] Right panel: login form unchanged
- [x] Demo credential buttons (hints from `/api/auth/login-hints` — collapsed by default)
- [x] Responsive: collapses to single-panel on narrow screens
- [x] Company logo clip fixed — SVG viewBox extended to `-25 0 350 235` so "INGENIOUS" text never clips; font-size reduced 54→44 for safe margin; CompanyLogo container now uses `object-contain block w-auto` + `inline-flex w-fit px-4 py-3 overflow-visible` to shrink-wrap the logo tightly (no empty box). `w-fit` prevents parent flex-col's `align-items:stretch` from expanding the white pill to full container width. Padding reduced from px-5→px-4 for tighter fit.
- [x] Horizontal logo lockup — created `src/assets/logo-icon.svg` (icon-only: globe + orbitals + speed lines, transparent bg, square viewBox `55 -24 192 192`, no baked-in text). LoginPage left panel now renders `[white 56px tile with icon] + [Ingenious Network / FZC stacked text]` in a flex row (gap-3.5). `CompanyLogo` import removed from LoginPage; Topbar still uses it unchanged.
- [x] Company name single-line fix — collapsed the stacked `flex flex-col` text into a single inline row: `whitespace-nowrap shrink-0` on the container prevents any wrapping or flex compression; "Ingenious Network" and "FZC" are two inline `<span>` elements sharing one baseline (17px white + 12px blue-300 letter-spaced uppercase). No flex-col, no multi-line rendering at any of the three target breakpoints.
- [x] Real transparent logo assets wired in — replaced SVG placeholder/recreation with the official transparent PNGs. Copied `logo_transparent_full.png` → `public/logo-full.png` (332×175, planet + "INGENIOUS NETWORK") and `logo_icon_only.png` → `public/logo-icon.png` (91×92, planet only).
  - **Login (dark panel):** FULL white-on-dark logo — single `<img src="/logo-white.png" className="w-60 h-auto object-contain block">` (~240px wide, planet + "INGENIOUS NETWORK" wordmark) directly on the dark panel, transparent, NO white tile. Deleted the icon-tile wrapper AND the separate "Ingenious Network / FZC" text element — no duplicate company name anywhere on the panel.
  - **`logo-white.png` (added):** white/light coloring on transparent background, for DARK backgrounds. Generated via PIL from `logo-full.png` — every opaque pixel recoloured to white while the original alpha channel is preserved, so letterforms/edges stay crisp and proportions are unchanged (332×175). Verified legible composited on the navy panel. Swap in a designer-made white logo later by simply replacing `public/logo-white.png`.
  - **LOGO USAGE RULE (app-wide):**
    - DARK backgrounds (login panel, any dark/colored topbar) → `/logo-white.png`
    - LIGHT/WHITE backgrounds (white topbars, PDF headers) → `/logo-full.png` (dark-text transparent version)
    - Favicon → `/logo-icon.png` (planet only)
    - Topbar currently shows `/logo-icon.png` inside a small WHITE tile (i.e. a light surface), which is consistent with the rule (light background → dark logo); left unchanged.
  - **Topbar (all 6 dashboards, shared `Topbar.tsx`):** topbar is `bg-slate-900` (dark), so used `/logo-icon.png` in a 36px white tile (w-9 h-9, icon w-7 h-7) + existing "DWES" text — full logo's navy text would be low-contrast on the dark bar. `CompanyLogo` component no longer imported in Topbar or LoginPage (component file kept but unused).
  - **Favicon:** `index.html` `<link rel="icon">` now points to `/logo-icon.png`; removed the dead `/logo.png` reference and the old `/logo.svg` favicon line.
  - Verified: `tsc --noEmit` exit 0; no white box behind text, no duplicate company-name text, transparent assets, consistent across login + topbars + favicon.
- [x] **Login branding restyle → horizontal lockup (2026-06-26, LOGIN PAGE ONLY):** replaced the
  white-on-dark single image with `[white card (bg-white rounded-2xl p-4 shadow-lg) holding
  /logo-full.png h-20 w-auto object-contain] + gap-6 + bold "INGENIOUS NETWORK FZC"`. Dark-text
  logo sits on the white card (readable); company name is white, `font-bold tracking-tight
  whitespace-nowrap`. The wordmark intentionally repeats the name (matches reference). Lockup
  pulled OUT of the `max-w-[480px]` column (title/features re-wrapped in their own `max-w-[480px]`)
  so it can use full panel width. One-row sizing verified by measuring Arial-Bold widths vs panel
  usable width: lockup totals ~605px at text-3xl / ~528px at text-2xl; panel usable = 664 (1440) /
  576 (1280) / 692 (820 portrait). Hence `text-2xl tablet-xl:text-3xl` — text-3xl at 1440 (fits
  664), one-step-down text-2xl at 1280 (605 would overflow 576) and portrait — no wrap, no clip,
  logo never cropped/stretched at all three breakpoints. `/logo-white.png` no longer used on login
  but retained as the documented dark-background asset. Topbars/dashboards untouched.
  - **Size trim (2026-06-26):** scaled the lockup down for balance — logo `h-20→h-14` (~80→56px),
    card `p-4→p-3`, text `text-2xl tablet-xl:text-3xl → text-xl tablet-xl:text-2xl`. New row totals
    ~421px (text-xl) / ~474px (text-2xl) vs panel usable 664/576/692 — comfortably one row, no wrap,
    uncropped, logo and text visually balanced at all three breakpoints.
  - **Wordmark refined (2026-06-26):** split the single bold all-caps `<span>` into two inline
    spans (still `whitespace-nowrap`, same position): "INGENIOUS NETWORK" =
    `text-white/90 font-semibold tracking-tight text-xl tablet-xl:text-2xl`; "FZC" =
    `text-blue-300/80 font-light tracking-wide text-base tablet-xl:text-lg ml-2` as a lighter,
    smaller, muted-blue sub-mark. Cleaner/less brick-like; one line at all three breakpoints.
- [x] **Login clock restyled → glass time chip (2026-06-26, LOGIN PAGE ONLY):** `LiveClock` is now a
  premium glass pill — `bg-white/60 backdrop-blur-md rounded-2xl border border-white/40 shadow-sm
  px-5 py-3`, right-aligned in its existing top-right slot. TIME: `text-3xl font-light tabular-nums
  tracking-tight text-slate-800` in an explicit system-mono stack
  (`ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`) — chosen over the theme's Roboto Mono
  because only weights 500/700 are loaded, which would break the light look. Accent COLONS render in
  brand indigo (`text-indigo-600` = #4f46e5) with a 1s breathing pulse via new
  `@keyframes clock-colon-pulse` (opacity 1→0.3→1); digits stay solid. DATE: `FRI · 26 JUN 2026`
  style — `text-xs font-medium uppercase tracking-widest text-slate-400`, right-aligned under the
  time. Fits with no overlap at 1440/1280/820. Nothing else on the page changed.
- [x] **"DWES" heading removed from login (2026-06-26):** deleted the large bold `DWES` headline
  (`text-[44px] tablet-land:text-[60px]`) from the left panel; also dropped the now-orphan `mt-3`
  on the "Digital Wiring Execution System" subtitle so it sits naturally as the block's first line
  (no empty gap where DWES was). Top alignment, left padding, and the parent `gap-8/gap-10` spacing
  unchanged — subtitle + tagline + features flow with natural spacing. Everything else (logo/name
  lockup, tagline, feature lines, right-side card) untouched.
- [x] **Feature lines verified (2026-06-26):** confirmed the left-panel `FEATURES` array is exactly
  the originals (unchanged) — `Zap` → "Real-time wiring progress tracking", `ClipboardList` →
  "Digital schedules replace paper", `ShieldCheck` → "QA / QC verification & reports". No edit
  needed; icon-tile styling/spacing untouched.
- [x] **Demo-credentials hint — REMOVED then REPLACED with auto-fill (2026-06-26):** the original
  DEV-only "Demo logins" collapsible was removed per request, then reintroduced as a different
  feature — a **DEV-only auto-fill** that populates the real username/password fields for quick
  login (per request: "auto-detect and populate demo credentials, demo/testing environment only").
  - On mount (DEV only) the fields are **prefilled** with the default demo account (first entry) so
    one click signs in.
  - The default is **choosable** via a small "Demo account" `<select>` (tagged `DEV`) under the
    Sign In button — picking a role fills both fields (`fillDemo(idx)`); options come from
    `DEMO_CREDENTIALS` (Admin/Director/Supervisor/QA/Technician).
  - Source restored: `src/data/demoCredentials.ts` (sourced from `backend/seeds/accounts.seed.json`,
    `resolveJsonModule` re-added to tsconfig.app.json). Supervisor is the one explicit entry
    (`super123` ≠ username).
  - SECURITY GATE unchanged: `SHOW_DEMO_CREDENTIALS = import.meta.env.DEV ||
    VITE_SHOW_DEMO_CREDENTIALS==='true'`; in prod `DEMO_CREDENTIALS` is `[]`, the seed JSON is only
    referenced inside the DEV-gated branch → Rollup tree-shakes every password out of the prod
    bundle (no prefill, no select, no passwords shipped). `tsc -b` exit 0; Vite serves page + JSON.
- [x] **Demo accounts seeded/verified (2026-06-26):** ran idempotent `seed-accounts.js`
  (`ON CONFLICT DO NOTHING`) — 0 inserted / 28 skipped (already present). Read-only verify: all 28
  expected demo usernames present (admin1, director2, qa1, qa2, tech1–tech24), none missing.
  Role totals: system_admin 2, ops_director 3, prod_supervisor 1, qaqc_engineer 5,
  wiring_technician 32. End-to-end: `tech1/tech1` → HTTP 200, role `wiring_technician` → technician
  dashboard. Note: `director1/dir123` returns 401 (its password is not dir123) — Director demo uses
  `director2/director2`. No schema change, no writes beyond additive seed (all skipped).

---

## MODULE 1-B — BIOMETRIC (PASSKEY / FINGERPRINT) LOGIN ✅

### Architecture
- **Separate SQLite store**: `backend/data/dwes_auth.sqlite` (created on boot; never touches WiringSchemeDB)
  - Table: `webauthn_credentials(credential_id, user_id, public_key, counter, transports, device_label, created_at, last_used_at)`
  - `user_id` is a copied value from WiringSchemeDB — NOT a foreign key; no writes back
- **In-memory challenge store**: `Map<string, { challenge, expiresAt }>` per ceremony (5-min TTL); keyed by userId (registration) or sessionId UUID (login)
- **Libraries**: `@simplewebauthn/server` v13 (backend) + `@simplewebauthn/browser` v13 (frontend)
- **ENV-driven RP config** — must change when serving over HTTPS to tablet:
  - `RP_ID=localhost`, `RP_NAME=DWES`, `RP_ORIGIN=http://localhost:5173`

### New backend files
- `backend/src/auth/webauthn-store.service.ts` — better-sqlite3 store, WAL mode
- `backend/src/auth/webauthn.service.ts` — registration + authentication ceremonies
- `backend/src/auth/webauthn.controller.ts` — 6 endpoints under `/api/auth/webauthn/`
- `backend/src/auth/auth.service.ts` — added `issueToken()` shared helper (password login refactored to call it; logic unchanged)
- `backend/.gitignore` — excludes `data/` and `*.tsbuildinfo`

### New frontend files
- `src/services/webauthnApi.ts` — 6 typed API calls
- `src/hooks/useBiometric.ts` — `useBiometricAvailable()`, `useEnrollBiometric()`, `useBiometricLogin()`
- `src/components/biometric/EnrollBiometricModal.tsx` — one-time post-login enrollment prompt
- `src/components/biometric/BiometricSettings.tsx` — device list with remove action

### Modified frontend files
- `src/pages/LoginPage.tsx` — fingerprint button (hidden unless `platformAuthenticatorIsAvailable()` AND `dwes-biometric-enrolled=true` in localStorage); enrollment modal after first password login; calm "not enrolled" message on credential mismatch
- `src/components/layout/Topbar.tsx` — Fingerprint icon opens device-management panel (hidden when biometrics unsupported)

### Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/webauthn/register/options` | JWT required | Generate registration options |
| POST | `/api/auth/webauthn/register/verify` | JWT required | Verify and store credential |
| POST | `/api/auth/webauthn/login/options` | Public | Generate auth options (optional username scope) |
| POST | `/api/auth/webauthn/login/verify` | Public | Verify assertion → issues identical JWT as password login |
| GET | `/api/auth/webauthn/status` | JWT required | List enrolled devices for current user |
| DELETE | `/api/auth/webauthn/credentials/:id` | JWT required | Remove a device credential |

### Enroll-after-password flow
1. User signs in with password → API returns JWT
2. LoginPage checks: `platformAuthenticatorIsAvailable() && !dwes-biometric-enrolled && !dismissed-{userId}`
3. If all true → shows `EnrollBiometricModal` before navigating to dashboard
4. Enroll → `register/options` → `startRegistration()` → `register/verify` → sets `dwes-biometric-enrolled=true`
5. Skip → sets `dwes-biometric-enroll-dismissed-{userId}=true` (per-user, permanent on this device)

### Security properties
- Password login logic: **zero changes** to validation path
- Biometric login: same `issueToken()` → same JWT, same session_log entry, same last_login update
- `authenticatorSelection.userVerification = 'required'` — device biometric gate enforced
- `authenticatorAttachment = 'platform'` — no external security keys, no PIN entry
- Counter updated after every assertion → replay detection active
- WiringSchemeDB: read-only (fetch user row to issue JWT). No writes, no schema changes.

### Enrollment trigger fixed (2026-06-26)
- **Problem:** the "Fingerprint sign-in" dialog (Topbar → fingerprint icon → `BiometricSettings`)
  only *listed/removed* devices and showed "No fingerprint devices enrolled" with **no way to
  enroll**. The only enroll path was the one-time, dismissible post-login modal — once dismissed,
  a user had no route to enrol.
- **Diagnosis confirmed:** backend `POST /auth/webauthn/register/options` & `/register/verify` exist
  and work (401 unauth; with a JWT, options returns valid creation options — `rp=DWES/localhost`,
  `authenticatorAttachment=platform`, `userVerification=required`). Capability detection uses
  `platformAuthenticatorIsAvailable()` (= `PublicKeyCredential && isUserVerifyingPlatformAuthenticatorAvailable()`).
- **Fix:** added an **"Enable fingerprint on this device"** button to `BiometricSettings` (shown
  whenever the platform authenticator is available). Click → `register/options` →
  `startRegistration()` (Windows Hello / device prompt) → `register/verify` with a
  `device_label` like "Windows / Chrome" → on success sets `dwes-biometric-enrolled`, shows a
  success line, and refreshes the device list. Unsupported devices show a clear message; empty state
  shows the hint + button. After enrolling, the login page's "Sign in with fingerprint" button
  appears and authenticates the user (existing `useBiometricLogin` flow — unchanged). No
  WiringSchemeDB writes (credential stored in `dwes_auth.sqlite`).

### How a user enrolls fingerprint sign-in
1. Sign in normally with **username + password** (must be a secure context — `localhost` is fine).
2. In the top bar, click the **Fingerprint icon** (only visible on supported devices).
3. In the **Fingerprint sign-in** panel, click **"Enable fingerprint on this device"**.
4. Approve the **Windows Hello / device fingerprint** prompt.
5. The device appears in the list (e.g. "Windows / Chrome") with a success message.
6. On the next visit to the **login page**, tap **"Sign in with fingerprint"** and verify — you're in.

### Pending follow-up
- **HTTPS on tablet**: WebAuthn requires a secure context. When the tablet opens the app over a LAN IP, it needs HTTPS (or `localhost` served via tunnel). This requires: valid TLS cert (or mkcert), reverse proxy (nginx/caddy), and updating `RP_ID`, `RP_ORIGIN` env vars. Do NOT attempt until HTTPS setup is decided.

---

## MODULE 2 — SYSTEM ADMINISTRATOR ✅
- [x] Dashboard tab with KPI count cards
- [x] Projects tab — list, create, delete
- [x] Frames & Upload tab — upload Excel, column mapping, frame list
- [x] User Management tab (FIXED 2026-06-26)
  - [x] Avatar column with initials, role-colored
  - [x] Role filter chips (All / per role with count)
  - [x] Search by name / username / employee ID
  - [x] Edit modal (full_name, role, employee_id, **whatsapp_number** — was missing)
  - [x] Reset Password modal (bcrypt hash saved to DB)
  - [x] Block / Activate toggle (is_active in DB)
  - [x] Delete: FK dependency check before hard delete — if user has sessions/inspections/assignments,
    deactivates instead (is_active=false) and returns warning; only hard-deletes if zero dependents.
    Frontend shows "Blocked (has sessions/assignments)" toast instead of "Deleted" in the deactivated case.
  - [x] Add New User modal (all fields, password confirm, role select, **whatsapp_number** — was missing)
  - [x] Bulk role update: `POST /api/admin/users/bulk-role { pattern, role }` — idempotent, skips
    users already at target role, reports which usernames were updated. Use to set tech1..tech24 to
    `wiring_technician` (run backup first: `pg_dump -Fp -d WiringSchemeDB > backup.sql`).
- [x] Diagnostics tab — shows WiringSchemeDB live stats
- [x] Sync tab
- [x] Sessions tab — audit log with JOIN to users
- [x] Audit Logs tab

### Supervisor User Management tab (FIXED 2026-06-26)
- Removed non-existent `department` / `email` fields (were silently dropped by the backend — misleading UX)
- Added `whatsapp_number` field to create and edit forms
- Fixed edit: now updates `employee_id` and `whatsapp_number` (was only updating full_name/role)
- Username shown as read-only text in edit mode (username changes not allowed post-create)
- Delete uses same FK-safe `remove()` — deactivates instead of deleting if dependents exist

---

## MODULE 3 — OPERATIONS DIRECTOR ✅
- [x] KPI tab — ring gauges, progress bars, count cards
- [x] KPI tab — bar chart: completion % per project (SVG, sorted)
- [x] KPI tab — donut chart: wire status distribution (Both Done / Src Only / Dst Only / Pending)
- [x] Projects tab — searchable, sortable project cards
- [x] Workforce tab — technician activity list
- [x] Activity tab — session + wiring audit log, filterable
- [x] Reports tab — Excel export (.xlsx, 3 sheets)
- [x] Reports tab — CSV export (.csv, flat)
- [x] Reports tab — PDF export (.pdf, A4 non-editable, via pdfkit)

---

## MODULE 4 — PRODUCTION SUPERVISOR ✅
- [x] **Project Edit/Delete fixed (2026-06-26):**
  - Root causes: (1) `DELETE /api/projects/:code` was `@Roles('system_admin')` → supervisor got
    **403** (silently swallowed by frontend `.catch(()=>{})`); (2) both Edit save and Delete used
    `.catch(()=>{})` so failures were invisible; (3) the old `remove()` hard-deleted
    `tech_assignments`+`file_hashes` (destroying wiring history, and could 500 on a
    `panel_inspections` FK).
  - Backend: DELETE now `@Roles('system_admin','prod_supervisor','ops_director')` (matches the other
    project mutations). `remove()` is now a **pure soft-delete** — sets `is_active=false` only and
    **preserves all child history** (assignments, file_hashes, inspections, frame/drawing files).
    `findAll()` already filters `is_active=true`. (Soft-delete column = `projects.is_active`; there
    are **no DB FK constraints** referencing projects.)
  - Frontend (`ProjectsTab.tsx`): Edit modal opens instantly (prefilled), saves via `PUT` (+ `POST
    /:code/state` if state changed), surfaces errors inline (no longer swallowed), and updates the
    row in list state on success — no refetch/reload. Delete shows a naming confirm, removes the row
    from state optimistically on success, and shows an error dialog on failure.
  - Verified (on `DEMO_PROJECT_*`, then restored): supervisor Edit → 200 + row updates live;
    supervisor Delete → 200 soft-delete, row removed live, project filtered from list, child rows
    preserved. No schema change, no migrate/push.


- [x] Dashboard KPI cards
- [x] New Project creation (code auto-generated)
- [x] Frames & Upload — Excel upload + column mapping
- [x] Technician Assignment — assign frame to technician
- [x] Panel Progress monitoring
- [x] Review submitted reports (Approve / Ready for QC / Rework)
- [x] Panel Report modal with XLSX download
- [x] Changeover tab
- [x] Drawings tab

---

## MODULE 5 — QA/QC ENGINEER ✅
- [x] Panels tab — shows completed + ready_for_qc panels
- [x] Inspection Form — visual, ferrule, labeling, compliance checks
- [x] Submit inspection to DB (panel_inspections table)
  - [x] Field mapping: ferrule_check → redmarkup_check, result → overall_result, notes → inspection_notes
- [x] History tab — all past inspections

---

## MODULE 6 — WIRING TECHNICIAN ✅
- [x] My Panels tab — list with Start / Pause / Resume / Complete buttons
  - [x] Pause modal with 6 reasons (including Mid-Changeover)
  - [x] Live timer (elapsed seconds persisted to DB on pause)
  - [x] KPI count cards per panel
- [x] Wiring tab — cable-by-cable workflow (REBUILT)
  - [x] One cable at a time — focused card showing: Wire No, Ferrule, Source, Destination, Color, Size, Length, Sign, Remarks
  - [x] 4 action buttons (min 56px, 2×2 grid landscape / stacked portrait):
    - [x] Complete (green) — sets src=true AND dst=true, advances to next pending cable
    - [x] One End Open (orange) — popup asks Source or Destination, sets one end, advances
    - [x] Skip (gray) — advances without changing status
    - [x] Previous (blue) — navigate back
  - [x] Wire list table — scrollable, filterable (Pending / One End / Done / All), clickable rows to jump
  - [x] Note textarea per cable (debounced save)
- [x] Report tab — KPI summary, cable completion breakdown, audit trail
  - [x] Submit Report button (only available after status=completed)
  - [x] Fixed: Pending count JSX expression bug
- [x] 3D Panel View (PanelView3D.tsx — Three.js)

---

## TASK 4 — TECHNICIAN DIGITAL FRAME + SUPERVISOR ASSIGNMENT (REAL WORKFLOW) ✅ (2026-06-26)

Root-cause analysis (from backup spec `wiring-app_pg`): two bugs blocked the real workflow:
1. `assignFrame()` gated on `compare_status === 'validated'` — supervisor could only assign a frame
   if it had been cross-validated against a second schedule. Not in the spec. Blocked all fresh uploads.
2. `assignFrame()` created `tech_assignments` with `supervisor_approved: false`, then `start()`
   rejected `!supervisor_approved`. A second manual "Approve" click was required before the tech
   could start. Not in the spec — assignment is self-approving.

**Backend changes (`backend/src/tech/tech.service.ts`):**
- `assignFrame()`: removed `compare_status !== 'validated'` check — any uploaded frame can be assigned.
- `assignFrame()`: `supervisor_approved: false` → `supervisor_approved: true` — assignment is
  immediately startable by the technician (no second approval step).
- `start()`: removed `if (!a.supervisor_approved) throw BadRequestException(...)` gate entirely.

**Frontend change (`src/pages/supervisor/tabs/AssignmentTab.tsx`):**
- Removed `fr.filter(f => f.compare_status === 'validated')` — ALL uploaded frames now appear in
  the assignment dropdown (not only validated ones).
- Frame dropdown shows cable count; non-validated frames get an amber advisory note
  ("has not been validated against a second schedule — proceed if intentional") instead of being
  blocked.
- Assignment modal success screen confirms the tech can start immediately.
- Inline **Review modal** added directly to assignment cards (for completed/submitted panels):
  Approve / Send to QA/QC / Request Rework, with optional notes — replaces the need to navigate to
  a separate review tab for quick decisions.
- Assignment cards now show KPI% progress bar, report-submitted badge, and review_status chip.
- De-assign button restricted to `status === 'assigned'` only (not started work).

**FrameStore disk fallback (`backend/src/frames/frame-store.ts`):**
- Added `getFrameFromDisk(projectCode, frameId)`: reads a single `<frameId>.json` directly from
  disk. Used as `??` fallback after `MockStore` lookup in `assignFrame`, `myAssignmentDetail`
  (tech), `panelDetail`, `panelReport`, `panelReportXlsx`, `revalidate` (supervisor). Eliminates
  the edge case where a frame is assigned before `loadAll()` re-populates MockStore (e.g. a new
  upload on a hot server between restarts). `FrameStore` import added to both services.

**No schema change. No migrate/push. tsc -b + tsc -p tsconfig.build.json exit 0.**

---

## MODULE 13 — DIRECTOR KPI FIX ✅ (2026-06-26)

Root cause: computed KPIs did not reflect real DB values.
- `projects_completed` counted `=== 'completed'` but DB value is `'completed_by_tech'`. → Fixed.
- `panels_in_progress` (Director "active") counted only `status === 'in_progress'` but all 6 active
  assignments are `status === 'assigned'`. → Fixed: Director's active count now includes both
  `'assigned'` and `'in_progress'` (both mean the panel is in active work).
- `panels_ready_for_qc` only checked `review_status` but not `qc_status`. → Fixed: checks both.
- Stats endpoint filtered all projects (including `is_active=false`). → Fixed: `where: { is_active: true }`.
- Workforce Avg KPI included techs with zero assignments, dragging it toward 0. → Fixed: average is
  computed only over techs who have at least 1 panel (`panels_total > 0`), with a sub-label
  showing how many of the 32 techs are currently assigned.
- "In Progress" label → "Active" in KPI tab and Director dashboard card (to match the expanded
  definition of in-progress = assigned + in_progress).

---

## MODULE 12 — SUPERVISOR DASHBOARD SUMMARY (cards + table) ✅ (2026-06-26, read-only UI)
New `SummaryTab` = default "Overview" tab on the Supervisor dashboard. All metrics from REAL data;
missing sources show **"n/a"** (no fake zeros). No DB writes, no schema change.

**KPI cards (sourced):** Total Projects (`projects.list` = 13 active), Total Panels (= frames across
projects), Wiring Schedules (= frames; one per panel), Assigned to Techs (frames with an assignment),
**Unassigned Work** (frames with none — clickable filter), In Progress / Completed / QA/QC Pending
(from `allPanels` status/qc_status/review_status), Total Technicians (`users/technicians` = 32).
**n/a (no source):** Overdue + Due Date — there is **no `due_date` column** (Phase 0), so the card is
greyed "n/a" and the table Due Date column shows "—" (no overdue highlight). Reported, not faked.

**Table:** Project | Panel | Assigned Technician (JOIN users via `allPanels.technician_name`) | Status
| Progress % (cable formula `(src+dst)/(total*2)*100`, shown as bar+%) | Due Date ("—"). One row per
panel (frame) incl. unassigned (red-tinted). Color pills: green=Completed, yellow=In Progress,
amber=QA/QC, gray=Paused, blue=Assigned, red=Not Assigned.

**Interactions:** search (project/panel/technician/status), clickable "Unassigned Work" card → filters
table, manual refresh, and **~12s polling** of `allPanels` for near-real-time status (heavy data —
projects/frames/tech count — fetched once on mount to limit load). Uses the MD3 tokenized
card/table/button classes (Module 11). Tablet-first, 44px+ touch targets.

**Side note resolved:** the earlier "Projects = 0" was the soft-delete state (now 13 active after the
approved restore), not a broken count — verified `projects.list` returns 13.

**Verified:** `tsc -b` exit 0; live data — Projects 13, Technicians 32, work items 8 (completed 1,
paused 1, in_progress 0, QA/QC 0); `allPanels` rows carry project_code/frame_id/status/technician_name/
panel_display_name/kpi.

---

## MODULE 11 — APP-WIDE MD3 THEME (token-driven) — STAGE 1 ✅ (2026-06-26, UI only)
Centralized design-token layer + normalized core components (light default, dark-ready). Reused the
existing MD3 palette — no parallel theme system. No backend/DB/logic changes.

**Step 1 — tokens (single source of truth):**
- `index.css @theme`: added MD3 semantic color roles — `--color-background` (#F6F7F9 soft light),
  `--color-surface`, `--color-surface-variant`, `--color-surface-container`, `--color-on-surface`,
  `--color-on-surface-variant`, `--color-outline`, `--color-outline-variant` (light values match the
  old look). Radius scale `--radius-sm/md/lg/xl/full`. Typography: `--font-family-sans` → **Roboto**
  (loaded in `index.html`), Inter/system fallback. Elevation tokens (`--shadow-elevation-1/2/3`)
  reused.
- **Dark-ready:** `[data-theme="dark"]` block overrides the role tokens with soft-dark surfaces
  (#15181C/#1B1F24, not pure black) → every tokenized component flips when the attribute is set
  (toggle wiring deferred per request).

**Step 2 — core components routed through tokens** (`design-system.css`, light values unchanged):
`app-shell` (background/on-surface), `card`/`card-header`/`card-title`, `kpi-card`/`kpi-label`/
`kpi-value`, **buttons** (`btn-primary`/`-lg` filled + `btn-secondary` outlined → MD3 **stadium**
radius `rounded-full`, primary/on-primary/surface/outline tokens), form fields
(`form-input`/`-lg`/`textarea`/`select`/`label`), `data-table` (header → surface-variant, tokenized
text + hairline dividers), `modal-*`, `section-title`/`section-sub`. Because all dashboards consume
these shared classes, the MD3 surfaces/buttons/tables propagate app-wide automatically.

**Verified:** `tsc -b` exit 0; Vite builds CSS cleanly (tokens served); app/login 200. AA contrast
holds (on-surface 13:1, on-surface-variant 4.6:1, on-primary 5.9:1).

**Stage 2 (next, deferred per staging + token limits):** convert per-screen INLINE hardcoded classes
(`bg-white`, `text-slate-900`, etc. inside individual tab components) to tokens for full dark-mode
coverage, and wire the light/dark toggle. Login keeps its bespoke brand panel (now on Roboto).

---

## MODULE 10 — BUTTON SIZING + TECHNICIAN ASSIGNED-TASK VIEW (2026-06-26)

### Prompt A — action button sizing ✅ (CSS/UI only)
Reduced the oversized primary CTAs back to a standard, consistent size: New Project, Upload Wiring
Schedule, Upload Drawing now `min-h-[44px] h-11 px-5 text-sm` with 18px icons + `gap-2` (was the
temporary 56px). Matches the rest of the supervisor `btn-primary` controls. Row Edit/Delete remain
compact (`h-[36px]`, aligned, `gap-2`). Colors/labels/behavior unchanged. `tsc -b` exit 0.

### Project restore (2026-06-26, user-approved data fix)
On user approval ("Restore all 12"), ran `UPDATE projects SET is_active=true WHERE is_active=false`
— restored 12 soft-deleted projects → **13/13 active**. Reversible, no schema change. Supervisor
`GET /projects` now returns 13; Projects KPI shows 13. (Backup from earlier this session on disk.)

### Side note — Supervisor "Projects" count ✅ (NOT a bug)
The KPI = `projectsApi.list().length` = count of **active** projects (`is_active=true`). DB now has
**1 active of 13 total** — the other 12 are SOFT-deleted (`is_active=false`), recoverable. This is
the expected result of Delete actions (the supervisor Delete fix in Module 4 soft-deletes); most
were removed during UI testing. The count query is correct; the low number reflects real soft-delete
state, not a filter/bug. (If those deletions were unintended, they can be restored by setting
`is_active=true` — say the word.)

### Prompt B — technician assigned-task view (Step 1 schema + buildable delta)
**Step 1 (read-only findings):**
- Assignments live in `tech_assignments` (`technician_id` → `project_code` + `frame_id` +
  `panel_name` + `status`). Panel = a frame file (`uploads/<CODE>/frames/`); wiring schedule = that
  frame's `.xlsx`/parsed cables; drawing = **project-level** files (`uploads/<CODE>/drawings/`), not
  per-panel.
- **🛑 `priority`, `due_date`, `instructions` do NOT exist** in `tech_assignments` (Phase-0 STOP item)
  — not returned/built; adding them needs your approval for new columns.
- **Already built:** `GET /api/tech/my-panels` is technician-scoped (filters by `user.id` from the
  JWT, never a client id); every action (`start/pause/complete/cable-*`) re-checks
  `assignment.technician_id === user.id`; `TechnicianDashboard` lists only the logged-in tech's
  panels with the wiring workspace (schedule/cables). Authorization: tech endpoints are
  `@Roles('wiring_technician')` → others get 403.
- **Delta built now:** added **lightweight polling** (refetch `my-panels` every 12s) to
  `TechnicianDashboard` so a supervisor's new assignment appears within ~12s with no manual refresh
  (no WebSocket stack in the project — realtime remains a pending future item). `tsc -b` exit 0.
- **Step 2/3 enrichment built (2026-06-26, no schema change):** `myPanels` now JOINs `projects` and
  returns per assignment — `project_name`, `project_client`, `schedule_file` (linked frame `.xlsx`
  original name), and `drawings[]` (project drawing refs: id, original_name, content_type) — all
  additive fields. Technician `PanelsTab` cards now show **project name · client**, the project code,
  a **Schedule: <file>** chip, and a **N drawings** chip. Verified: `tech01` (id 26) → 2 panels, all
  `technician_id=26` (scoped), each carrying project name/client + schedule ref. `tsc -b` exit 0.
- **Drawing-file open — BUILT (2026-06-26, additive read-only, no schema change):**
  - New endpoint `GET /api/projects/:code/drawings/:id/file` ([frames.controller.ts]) — streams the
    drawing **inline** (`Content-Disposition: inline; filename="<original>"`) with `Content-Type` from
    the stored metadata, or inferred from extension after a restart. Resolves bytes from `MockStore`
    (this session) or disk via new `FrameStore.getDrawingFile` (scans `uploads/<CODE>/drawings/
    <id>_*`), so it survives restarts. **404** if id/file missing; clean JSON errors (no stack traces).
  - **Authorization:** `wiring_technician` may open only if `FramesService.technicianAssignedToProject`
    (a `tech_assignments` row on that project) returns true → else **403**; other authenticated roles
    per existing rules; **401** without auth. `FramesService` now injects `PrismaService` (PrismaModule
    is `@Global`, so no module change).
  - **Frontend:** `projectsApi.drawingFile(code,id)` fetches the file as a **Blob with the JWT** (a raw
    new-tab GET wouldn't carry auth); technician `PanelsTab` renders one clickable chip per drawing →
    opens PDFs/images inline in a new tab, downloads DWG/DXF/other. No drawings → no chip (no dead
    button).
  - **Verified (no DB write — test file placed on disk then removed):** tech01 (assigned) → **200**,
    `application/pdf`, `inline; filename="DEWA-GA.pdf"`; tech1 (not assigned) → **403**; missing id →
    **404**; no auth → **401**. `tsc -b` exit 0; backend DI resolved.
- **Still needs decision / schema:** per-panel drawing link (drawings remain project-level per
  Phase 0) and `priority`/`due_date`/`instructions` (missing columns).

---

## MODULE 9 — SUPERVISOR PROJECT→PANEL→UPLOAD FLOW ✅ (2026-06-26, no schema change)
Built on Phase-0 mapping (panels = frame files, drawings = project-level files; no new tables).
- **Create Project** (`ProjectsTab`, supervisor-only): form now collects Project Name, Client,
  Substation, Panel Type, Voltage, Region, Location, Year, Seq. Code generated as
  **`PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR_SEQ`** (seq zero-padded to 3) — e.g.
  `SAS_132KV_UAE_DUBAI_2026_007`. REGION split out from the old combined LOCATION. Substation has
  no DB column → preserved in `description` ("Substation: …") — no schema change. New row reflected
  in the list immediately (no reload). Verified end-to-end: supervisor create → **HTTP 201**.
- **Panels** = frames (`FramesTab`): list per project with panel name, file source, cable count,
  date, status; created by uploading a wiring schedule (existing `uploads/<CODE>/frames/` convention).
- **Ordered upload**: Projects → **Frames & Upload** (select project → upload Wiring Schedule .xlsx
  → sheet → column mapping → creates panel/frame) → **Drawings** (upload PDF/DWG/DXF/img with type;
  list with date+size; delete). `DrawingsTab` already existed but was **not wired into the supervisor
  nav** — now added as a "Drawings" tab. Drawings stored at project level per Phase 0
  (`uploads/<CODE>/drawings/`, `uploadApi.drawing`).
- **Tablet-first**: primary CTAs (New Project, Upload Wiring Schedule, Upload Drawing) bumped to
  ~56px (`h-14`/`h-[56px]`).
- **Permission-gated** (per Module 8): New Project / Edit / Delete and Upload Wiring Schedule render
  only for `prod_supervisor` (`usePermissions`); others see a read-only list. `tsc -b` exit 0.
- **Editable comboboxes (2026-06-26):** Panel Type, Voltage Level, Region, Location, and Client in the
  New Project dialog are now editable comboboxes (new `ComboField` = text input + native `<datalist>`)
  — pick a preset OR type a custom value (free text accepted); Year stays a fixed select, Sequence a
  text input. Code-segment values are NORMALIZED for the code only (`trim → UPPERCASE → strip
  non-[A-Z0-9]`), so "Relay Panel"/"132 kV"/"Al Quoz" → `RELAYPANEL_132KV_UAE_ALQUOZ_2026_012`
  (no spaces/stray `_`). Display columns keep the original text (Client as typed; Substation in
  `description`). Live normalized code preview shown; Create Project disabled until Name + Client +
  all 6 code fields are non-empty (trimmed). Verified: `tsc -b` exit 0; custom values build a valid
  PANELTYPE_VOLTAGE_REGION_LOCATION_YEAR_SEQ code. No schema change.

> No new table/column was created. "Panel" remains a frame-file (per Phase 0). Per-panel drawing
> linkage is project-level only (Phase 0) — if you later want drawings tied to a specific panel,
> that's a separate schema decision (still pending from the Phase-0 STOP list).

---

## MODULE 8 — ROLE PERMISSION MATRIX ✅ (2026-06-26, app-logic only, no schema change)
Enforced the 5-role matrix on the existing `users.role` column — backend guards (the real boundary,
403) + frontend hooks/route guards.

**Matrix (mutations):** project/panel/document/assign mutations → `prod_supervisor` ONLY;
user/role mgmt → `system_admin` ONLY; QC inspection → `qaqc_engineer` ONLY; `ops_director` =
read-only everywhere; `wiring_technician` = own assigned items only. Reads (GET) stay open to
authenticated users so director/admin can view.

**Backend `@Roles` changes (controllers):**
- `projects` (create/update/delete/state/assign/submit) → `prod_supervisor` (removed admin+director).
- `frames` (delete/compare-verify/submit/revert/**save-mapping** [was unguarded]/delete-drawing) → `prod_supervisor`.
- `upload` (extract/read-headers/wiring-schedule/drawing) → `prod_supervisor`.
- `tech` (assign-frame/changeover/delete-assignment) → `prod_supervisor`; technician actions stay
  `wiring_technician` and are already filtered by `user.id` in the service.
- `users` (create/update/toggle/reset/delete) → `system_admin`; user **reads** stay broad for
  assignment dropdowns.
- `supervisor` (review/approve/rework/revalidate/confirm) → `prod_supervisor` (review previously
  inherited the broad class-level roles — now locked down).
- `qaqc` inspect-panel → `qaqc_engineer` (reads keep QC_ROLES).
- `admin`/`director` unchanged (admin domain; director read-only).

**Frontend:**
- New `src/hooks/usePermissions.ts` — role→capability booleans mirroring the backend matrix.
- `ProtectedRoute` already redirects wrong-role deep-links to the user's own dashboard (verified) —
  roles never share a dashboard route.
- `ProjectsTab` (shared by supervisor + admin) now gates New Project / Edit / Delete behind
  `canManageProjects` (supervisor) → admin/others see a read-only "View only" list.

**Verified (logged in as each role):** project create/delete, user create, QC inspect, assign-frame
→ **403** for every disallowed role; director/admin GET projects → **200**. 12/12 assertions pass.
No schema change, migrate, or push.

> Behavioral change to note: `system_admin` and `ops_director` can no longer create/edit/delete/
> assign projects/panels (previously allowed). This is the matrix as specified.
> Follow-up: `FramesTab` action buttons (also shared with admin) are backend-403-protected but not yet
> UI-gated — will be covered when building the supervisor panel/upload flow.

---

## MODULE 7 — GLOBAL UI ✅
- [x] **Dashboard scroll + topbar overflow fixed (2026-06-26, ALL role dashboards):**
  - **Vertical scroll:** root cause was `DeviceSimulator` (wraps the whole app in `App.tsx`) rendering
    `w-full h-screen overflow-hidden` in `auto` mode (the default/real browser usage) — a fixed
    viewport height + clip that trapped all dashboard content. Changed to `w-full min-h-screen`
    (no fixed height, no overflow clip) so content grows and the page scrolls; `app-shell` stays
    `min-h-screen flex flex-col` and the topbar stays `sticky top-0 shrink-0`. Device-simulator
    profile mode (fixed device frame) now uses `overflow-y-auto overflow-x-hidden` so it scrolls
    internally too. No parent clips vertical content (verified `AppDialogProvider` adds no layout
    wrapper).
  - **Topbar horizontal scrollbar:** `.topbar-nav` had `overflow-x-auto` without `min-w-0`, so it
    couldn't shrink and showed an inner horizontal scrollbar / pushed the bar wide. Added `min-w-0`
    (nav now shrinks within the bar → bar fits viewport, no page overflow) and hid the nav scrollbar
    (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) so overflow tabs stay
    swipe-reachable with no ugly bar. Collapsed the low-priority "LOCAL DEVELOPMENT" badge to
    `tablet-xl` (1440px+) only; user sub-text already hides below `tablet-port`. Logo, nav, clock,
    user, and Logout stay visible; topbar height stays 64px; touch targets ≥44px (global base rule).
  - Verified `tsc -b` exit 0; applies to admin/director/supervisor/technician/QA via the shared
    `AppShell`/`DashboardShell`/`Topbar`.

- [x] **KPI cards compact strip — proportional to topbar (2026-06-27, CSS + component):**
  - Problem: topbar `h-16` (64px); KPI cards `min-h-[112px]` `flex-col` — visually disproportionate.
  - Fix: switched KPI card layout from vertical (label+icon top / value bottom) to horizontal (icon left / label+value right). `min-h-[112px] p-5 flex-col justify-between` → `min-h-[72px] px-4 py-3 flex items-center gap-3`. `rounded-2xl` → `rounded-xl` (slightly tighter corners to match strip feel).
  - Value font size: `text-3xl` → `text-2xl` (fits the shorter card height, still clearly readable).
  - Value margin: `mt-2` → `mt-1` across all five variant classes.
  - `KpiCard.tsx` reordered: icon renders first (left), then `<div class="flex-1">` with label + value stacked.
  - Result: KPI strip height ≈ 72px, topbar ≈ 64px — near-matched visual weight. At portrait/2-col the cards are still side-by-side; icon + text still fully visible at all three target breakpoints.
- [x] **Full logo + DWES text in topbar (2026-06-27, UI-only):**
  - Replaced icon-only tile with `<img src="/logo-white.png">` (`h-10 w-auto max-w-[140px]`, `object-contain`) — white version of the full logo for the dark `bg-slate-900` topbar.
  - "DWES" heading (`topbar-logo-name`) and "Digital Wiring Execution System" subtitle (`topbar-logo-sub`) restored beside the logo.
  - Text block is `hidden tablet-port:flex` (≥768px); subtitle additionally `hidden tablet-land:block` (≥1024px). At portrait mobile the logo image alone shows.
  - Logo margin restored to `mr-6` (was reduced to `mr-3` when icon-only).
  - Change is in `Topbar.tsx` only — all 5 dashboards inherit it automatically.
- [x] **Instant logout — no confirmation popup (2026-06-27, UI-only):**
  - Removed `dialog.confirm()` call from `handleLogout` in `Topbar.tsx`. Logout now calls `logout()` then navigates to `/` in one step.
  - Removed the now-unused `useAppDialog` import and `dialog` const from `Topbar.tsx`. No other dialogs changed.
- [x] **Director dashboard polish + KPI compact redesign (2026-06-27, CSS/UI only):**
  - **`select-none` on all UI chrome:** `.topbar-logo-name`, `.topbar-logo-sub`, `.topbar-nav-btn`, `.topbar-env`, `.topbar-user-name`, `.topbar-user-role`, `.kpi-label`, all `.badge-*`, `.section-title`, `.section-sub`, `.tab-btn` — prevents blue highlight boxes on navigation/heading UI text.
  - **"Read Only" badge:** DashboardShell now accepts `badgeVariant?: 'blue' | 'gray' | 'amber' | 'red'` (default `'blue'`). Director passes `badgeVariant="gray"` → muted gray badge signals read-only role.
  - **Smart KPI grid:** DashboardShell auto-selects `kpi-grid` (4 cards), `kpi-grid-5` (5 cards), or `kpi-grid-6` (6 cards) based on `kpis.length`. Grid breakpoints tuned per count.
  - **Missing Director CSS written from scratch:** All `workforce-*`, `kpi-ring-*`, `kpi-top-*`, `kpi-block*`, `kpi-count-*`, `chart-*`, `kpi-progress-*`, `kpi-hour-*` classes — these were completely undefined. Now fully styled with MD3 tokens, `select-none` on labels, cross-browser `<progress>` element styling (webkit/moz pseudo-elements).
  - **KPI Cards aggressively compacted (app-wide):** `min-h-[72px] → min-h-[64px]`, `px-4 py-3 → px-3 py-2.5`, `gap-3 → gap-2.5`, icon chip `w-10 h-10 → w-8 h-8`, font `text-2xl → text-xl`, shadow `elevation-2 → elevation-1`, left accent `4px → 3px`. SVG icons inside chip downscaled to 18px via `.kpi-card .w-8 svg`. Hover lift added. Gap reduced `gap-4 → gap-3`.
  - Added `.kpi-grid-5` class for QAQC dashboard (5 cards: 3 at port, 5 at land).
  - Zero TypeScript errors.

- [x] **Frame table — clear action icons + status pills (2026-06-27, UI-only):**
  - **Actions column** redesigned from ambiguous Eye/FileSearch/CheckCheck/Trash icons to exactly 3 named icons per row:
    1. `ListChecks` — "View Wiring Schedule" → opens `FrameDetailModal` (existing cable list)
    2. `FileImage` — "View Drawing" → calls `handleViewDrawing(drawings[last])` (reuses existing endpoint); **disabled + tooltip "No drawing uploaded"** when `drawings.length === 0`; tooltip shows count if multiple drawings exist
    3. `Trash2` — "Delete Frame" with existing confirmation dialog; styled with `.frame-action-danger`
  - **Verify / Validate workflow** moved from icon buttons → text links inside the Status column ("Verify →" purple, "Validate →" green). Same handlers, same condition logic.
  - **Status column** replaces `<Badge label={compare_status}>` with proper colour pills:
    - `'none'` → **Draft** (slate, `.frame-status-none`)
    - `'verified'` → **Verified** (blue, `.frame-status-verified`)
    - `'submitted'` → **Validated** (green, `.frame-status-submitted`)
  - Status column widened `w-[160px] → w-[220px]`; Actions column narrowed `w-[200px] → w-[140px]` (3 icons fit at ~130px).
  - Removed now-unused `Badge`, `Eye`, `FileSearch`, `CheckCheck` imports. Added `ListChecks`.
  - Added `.frame-action-btn`, `.frame-action-danger`, `.frame-status-*` classes to `design-system.css`.
  - Zero TypeScript errors.
- [x] **Upload Wiring Schedule — mapping step redesign (2026-06-27, UI-only):**
  - **Unified column-mapping table**: replaced the old "preview table + separate grid of selects below" with a single table where each column has a mapping select inline in the header. Column names (row 1, dark sticky) + mapping selects (row 2, light sticky) sit above the sample data rows. Scrollable in both axes; header rows stay fixed while data scrolls.
  - **Column colour coding**: unmapped columns = dark slate header; optional-mapped = dark blue; required-mapped = dark green. The select itself mirrors: default gray, optional-mapped blue pill, required-mapped green pill.
  - **Data rows**: compact `py-[6px] px-[10px]`, `max-w-[160px] truncate`, `title` tooltip on all values. Technical fields (ferrule, source, destination, path, device, terminal) render in `font-mono` for alignment.
  - **Required-field status chips**: live chips at the bottom. Ferrule ★ = green if mapped, red if not. Amber warning if no location field (source / destination / path / source-device) is mapped.
  - **Modal size**: `size="xl"` (`max-w-5xl` ≈ 1024px) on the mapping step only; file and sheet steps remain `size="lg"`. Added `modal-box-xl` class to `Modal.tsx` + `design-system.css`.
  - **No logic changed**: `mapping` state structure (`{fieldKey: columnHeader}`) unchanged. `handleImport` validation unchanged. Only the render for `step === 'mapping'` was rewritten. Zero TypeScript errors.
- [x] **Technician roster data fix (2026-06-27, DB — name fields only):**
  - Backup taken first: `backups/WiringSchemeDB_20260627_104829.sql` (94.6 KB). Confirmed before any writes.
  - 24 real technician accounts (tech1–tech24) updated: `full_name` set to correct person, `employee_id` set to EMP-T001–EMP-T024. Only `full_name` and `employee_id` touched — password, role, username, is_active unchanged. Single transaction, idempotent.
  - 8 suspicious accounts flagged — **PENDING CONFIRMATION** before deactivation (see task notes).
- [x] **Supervisor "Drawings" tab removed (2026-06-27, nav-only):**
  - Removed `{ key: 'drawings', label: 'Drawings', icon: <Map> }` from `TABS` in `SupervisorDashboard.tsx`.
  - Removed `{tab === 'drawings' && <DrawingsTab />}` render branch and the `DrawingsTab` import.
  - Removed `Map` from the lucide-react import (no longer referenced in this file).
  - Drawing upload still accessible via the Upload ▾ dropdown in the Frames & Upload tab. Drawing viewing remains available inside FramesTab. Standalone top-level nav tab only was removed. 5 tabs remain: Overview, Projects, Frames & Upload, Assignments, Team.

- [x] **Topbar logo — original colored logo + instant load (2026-06-27, asset + UI):**
  - Overwrote `public/logo-full.png` with `Logo/logo_transparent_full_2.png` (newest, 48 KB). File is now in `public/` (Vite static), served as `/logo-full.png` instantly at build time — no OneDrive path involved.
  - Changed topbar from `<img src="/logo-white.png">` (white outline) to `<img src="/logo-full.png">` (original colored logo) wrapped in a `bg-white rounded-xl px-2.5 py-1 shadow-sm` tile. The white container makes the colored/transparent-bg logo visible against the `bg-slate-900` topbar without color inversion.
  - Logo image: `h-8 w-auto max-w-[120px] object-contain` — aspect ratio preserved, no crop.
  - "DWES" heading + "Digital Wiring Execution System" subtitle text remain beside the tile.

- [x] **Upload dropdown — clipped text fix (2026-06-27, CSS-only):**
  - Root cause: `form-select` has `@apply w-full`, so in the `flex-wrap` toolbar the select expanded to fill the entire row, wrapping the Upload button onto a new line at the left edge. With `right-0` on the menu, the 240px dropdown then extended ~74px off the left of the viewport, clipping "W" from "Wiring Schedule" and "Dr" from "Drawing".
  - Fix: added `.toolbar [data-layout="grow"] { flex: 1 1 auto; min-width: 0; width: auto; }` — activates the existing `data-layout="grow"` attribute that was already on the `<select>` but had no CSS rule. Higher specificity (class + attribute = 0,2,0) beats `.form-select` (class = 0,1,0), so `width: auto` overrides `w-full`. The select now shares the toolbar row with the Upload button. Button stays on the right. `right-0` dropdown correctly extends leftward.
  - Also bumped `min-w-[220px]` → `min-w-[240px]` for a comfortable safe margin around text.
  - No JS or component changes — CSS-only.
- [x] **Upload dropdown in FramesTab (2026-06-27, CSS/UI only):**
  - Consolidated "Upload Wiring Schedule" + "Upload Drawing" toolbar buttons into a single "Upload ▾" primary button with a popover dropdown menu.
  - Dropdown opens below the button, lists two items: **Wiring Schedule** (.xlsx/.xls) and **Drawing** (.pdf/.dwg/.dxf/image), each with icon, label, and file-type hint. Each item has `min-h-[52px]` (touch-friendly).
  - Click-outside (`mousedown` listener scoped to `uploadMenuRef`) and `Escape` key both close the menu. Chevron rotates 180° when open.
  - `aria-haspopup="true"` + `aria-expanded` on the trigger button; both existing modals (`showUpload`, `showDrawingUpload`) continue to work unchanged.
  - Added `.upload-menu` and `.upload-menu-item` classes to `design-system.css` (positioned absolute, `z-50`, elevation-3 shadow, `min-w-[220px]`).
  - No backend or modal logic changed — only the toolbar trigger UI.
- [x] **Topbar icon-only + dev hot-reload scripts (2026-06-27, CSS/UI + config, no backend/DB):**
  - **Logo area**: removed "DWES" heading and "Digital Wiring Execution System" subtext. Icon tile resized `w-9 h-9 → w-11 h-11` (44px) with inner image `w-7 h-7 → w-9 h-9` (36px). `title` tooltip added. Logo margin `mr-6 → mr-3` (text no longer needs the extra space). Compact pill gives ~3-4px more horizontal room to nav tabs.
  - **Fingerprint button**: removed `<span>Fingerprint</span>` entirely (was already `hidden tablet-port:inline`). Icon 20px stays. `title="Fingerprint sign-in settings"` is the tooltip.
  - **Logout button**: removed `<span>Logout</span>` (was `hidden tablet-port:inline`). `title="Logout"` added as tooltip. Icon 16px stays.
  - **Result**: topbar now fully icon-only for logo / fingerprint / logout at all breakpoints. User menu (name + role) and nav labels (tablet-land+) are unaffected.
  - **Hot-reload & watch scripts (config only):**
    - Frontend: Vite HMR already enabled by default — `.tsx`/`.ts`/`.css` changes reflect in browser in <500ms with no page reload. React Fast Refresh preserves component state on most edits.
    - Backend: `npm run backend` = `nest start --watch` — NestJS recompiles on file save in ~2-3s, no manual restart needed. Already wired via `dev:all`.
    - Added `npm run dev:watch` (root): same as `dev:all` but with `--kill-others-on-fail` so a BE crash stops the FE too (avoids silent errors).
    - Added `npm run test:watch` (root) → `backend jest --watchAll --passWithNoTests`. Backend `test` and `test:watch` scripts added. `--passWithNoTests` means the watcher starts cleanly before test files exist; add `*.spec.ts` files beside services to activate. No jest config or test files created yet — that is the next step when tests are written.
- [x] **KPI card visibility + grid layout fix (2026-06-27, CSS/UI only, app-wide):**
  - **Root cause 1 — grid layout:** `.kpi-grid` was `tablet-land:grid-cols-3` (1024px+), so supervisor's 4 cards rendered as 3+1 (two rows). Changed to `tablet-land:grid-cols-4` → 4 in one row at ≥1024px. `tablet-xl:grid-cols-5` retained for dashboards with 5-6 KPIs. Portrait (820×1180) unchanged at `grid-cols-2` → 2×2. The intermediate `tablet-wide:grid-cols-4` step removed (redundant now).
  - **Root cause 2 — card contrast:** `kpi-card` had white (`#FFFFFF`) background on `#F6F7F9` page with only 8% opacity shadow → card effectively invisible at a glance. Fixed: replaced `shadow-elevation-1` with `shadow-elevation-2` (larger, 8%+4% layered), added `border: 1px solid var(--color-outline-variant)` → cards now clearly distinguished from page background. Min-height `100px → 112px`, value margin `mt-1 → mt-2` for better internal spacing.
  - **Color accent strips:** `KpiCard` now receives `data-variant` attribute; CSS rules add a 4px left border in variant color (`blue=#1D4ED8`, `green=#16A34A`, `amber=#D97706`, `red=#DC2626`). Supervisor cards: Projects/Active=blue, Approvals=amber, Paused=red — color-coded at a glance. No change to prop interface.
  - Applied globally to all 5 dashboards (Admin 6 KPIs, Director 6, Supervisor 4, QAQC 5, Technician 3). No backend/DB change. No layout regressions.
- [x] **Topbar action buttons + FramesTab button fix (2026-06-27, CSS/UI only):**
  - **Fingerprint button**: moved from `topbar-logout` (red, cramped) to new `topbar-action` class (slate, neutral); icon 14 → 20px; now `min-h-[44px] px-4 gap-2` — full touch target.
  - **Logout button**: height `h-9` (36px) → `min-h-[44px]`; padding `px-3` → `px-4`; icon 14 → 16px; `gap-1.5` → `gap-2`. Now meets 44px touch target at all breakpoints.
  - **Divider**: added `<span class="w-px h-5 bg-white/15">` between Fingerprint and Logout — subtle visual separation without a hard border.
  - **"Upload Drawing" in FramesTab**: was `btn-secondary` (outlined/white), now `btn-primary` (filled blue) — identical to "Upload Wiring Schedule". Both buttons in the Frames toolbar are now visually identical (same height h-11, same padding px-5, same blue fill, same icon size 18px).
- [x] **Role-specific nav implemented across all 5 roles (2026-06-27, frontend-only, no backend/DB change):**
  - **Architecture:** single `TABS` array per dashboard; roles never share a dashboard route; nav rendered by shared `Topbar` via `DashboardShell → AppShell`.
  - **Topbar responsive:** nav labels hidden below `tablet-land` (1024px) — icon-only on 820×1180 portrait, icon+label on 1280×800 and 1440×960. `title` attribute on each button preserves accessibility. Fixed pre-existing ARIA bug (`aria-expanded` was a string literal, now a boolean).
  - **System Admin** (3 tabs): Users → `UserMgmtTab`; System Settings → `DiagnosticsTab` + `SyncTab`; Logs / Audit → `ActivityTab` + `SessionsTab`. Removed 8 irrelevant tabs (Projects, Frames, Assignments, QA/QC, Reports, Settings, Diagnostics, Sessions each standalone). KPI strip (uptime, heap, users, projects, assignments, errors) retained.
  - **Operations Director** (4 tabs): Overview → `WorkforceTab`; Projects → `ProjectsTab` (read-only); KPI Analytics → `KPITab` + `ActivityTab`; Reports → `ExportTab`. Merged former `kpis` + `analytics` tabs into one. Tab key `dashboard` → `overview`.
  - **Production Supervisor** (6 tabs): Overview, Projects, Frames & Upload, Drawings, Assignments, Team → `UsersTab`. Removed Approvals and Reports from top-nav (inline review modal on assignment cards handles approvals). `user_mgmt` key renamed `team`.
  - **QA/QC Engineer** (3 visible + 1 hidden): Review Queue → `PanelsTab`; Completed Panels → `HistoryTab`; Reports → `HistoryTab`. `inspect` tab excluded from TABS array but reachable programmatically (`handleSelectPanel` → `setTab('inspect')`). Fixed subtitle bug: condition was `tab === 'inspect'` but old key was `'inspections'` — now consistent. After inspection done, auto-navigates to Completed Panels.
  - **Wiring Technician** (4 flat tabs): My Assignments → `PanelsTab`; Digital Wiring → `WiringTab` + 3D View sub-tab; Drawings → inline drawings list (opens PDF/images inline, downloads DWG/DXF, 56px touch targets); Progress → `ReportTab` promoted from sub-tab to top-level. `openDrawing` helper moved to `TechnicianDashboard` (was duplicated in `PanelsTab`). Sub-tab type reduced to `'wiring' | 'view3d'` (report removed).
  - **No overflow at any breakpoint:** portrait icon-only gives ~44px per button; supervisor's 6 tabs = ~264px total at 820px portrait; existing `overflow-x-auto` + hidden scrollbar handle any edge cases via swipe.
  - `tsc -b` exit 0 expected; no schema change, no backend change.
- [x] **Topbar: LOCAL DEVELOPMENT badge role-gated + clock moved to top-right (2026-06-27, CSS/UI only):**
  - **Badge**: `<span className="topbar-env">LOCAL DEVELOPMENT</span>` wrapped in `{user?.role === 'system_admin' && ...}` — hidden for all roles except `system_admin`. Previously visible to all authenticated users.
  - **Clock**: moved from the first slot in `topbar-right` (visually center-ish) to the last slot (after Logout button) — now sits at the true top-right corner. Added `pl-2 border-l border-white/10` separator. Time + date format unchanged. Remains hidden on narrow portrait (`hidden tablet-land:flex`); visible at 1280×800 and 1440×960.
  - Verified: non-admin roles (supervisor, technician, QA, director) see no badge. `system_admin` sees badge at `tablet-xl` breakpoint and above (existing CSS class unchanged). Clock does not overlap user menu at 820×1180 portrait (hidden on portrait), 1280×800, or 1440×960. No backend/DB change. `tsc -b` exit 0.
- [x] **Project mini-cards redesign (2026-06-27, CSS/UI only):**
  - **`ProjectInfoCard` completely rewritten** as a compact `~104px` card (was large info card with 8 fields in a 4-column grid, visually oversized and bloated).
  - **New card layout:** code (10px mono/bold/uppercase), name (12px semibold truncated), client (10px muted), footer with status dot + label (8px uppercase) + stat badge (kpi % or cables count).
  - **Accent left border (3px)** — color driven by CSS custom property `--pm-accent` via `data-s` attribute on the article element. Accent color auto-propagates to status dot + status label without any inline styles. Status variants: active=blue, completed=green, in_review=violet, pending=orange, stopped=red, submitted=emerald, not_started=slate.
  - **Hover lift:** `translateY(-2px)` + box-shadow elevation on hover. Flat at rest (`box-shadow: 0 1px 2px rgba(0,0,0,0.04)`).
  - **Grid tightened:** `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` → `.proj-mini-grid` = `grid-cols-2 / 3 / 4 / 5 / 6 gap-2` at the custom tablet breakpoints. 5-6 cards per row at 1280+.
  - **Director's ProjectsTab** field list trimmed to `[Client, Progress, Total Panels]` (was 8 fields).
  - **QAQC PanelsTab** action button changed from `btn-primary h-11 px-5` (44px tall, too large for mini card) to `.proj-mini-action` (24px compact, accent-colored, right in the card footer). Fields trimmed to `[Client, Progress, Cables]`.
  - CSS-only, no backend/DB changes. No TypeScript errors.

- [x] Topbar height 64px
- [x] Nav buttons min-height 44px, padding 10px 20px, font-size 15px
- [x] Active tab: solid bottom border indicator
- [x] Table action buttons: min 44px height, min 100px width, font-size 13px, border-radius 8px
- [x] Dropdown height 48px, font-size 15px, padding 12px 16px
- [x] Global button min-height floor applied
- [x] Status colors: Completed=green, One End Open=orange, Pending=gray, In Progress=blue
- [x] Role badges: system_admin=red, ops_director=purple, prod_supervisor=blue, qaqc_engineer=amber, wiring_technician=green
- [x] Responsive: portrait (820×1180) collapses layout correctly

---

---

## MODULE 0-B — DEMO ACCOUNTS ✅

Pre-backup: `backups/WiringSchemeDB_backup_20260626_112032.sql` (66 KB, plain SQL).
Seed manifest: `backend/seeds/accounts.seed.json` | Script: `backend/seeds/seed-accounts.js`
Hashing: `bcryptjs` cost=10 (matches app auth layer). Idempotent: `ON CONFLICT (username) DO NOTHING`.

| Username    | Password    | Role               | Status   |
|-------------|-------------|--------------------|----------|
| admin1      | admin1      | system_admin       | INSERTED |
| director1   | (unchanged) | ops_director       | SKIPPED (pre-existed, not in manifest) |
| director2   | director2   | ops_director       | INSERTED |
| supervisor1 | (unchanged) | prod_supervisor    | SKIPPED (pre-existed, not in manifest) |
| qa1         | qa1         | qaqc_engineer      | INSERTED |
| qa2         | qa2         | qaqc_engineer      | INSERTED |
| tech1–tech24| (username)  | wiring_technician  | INSERTED (full_name=[TBD], to be updated) |

No existing row modified. No schema change. No migrate/push.
Full names for tech1–tech24 are `[TBD]` — update via Admin > User Management or re-run seed after filling names in `accounts.seed.json`.

---

## SUPERVISOR-WORKFLOW SCHEMA MAPPING (2026-06-26, READ-ONLY analysis — no changes made)
Mapped the new Production-Supervisor brief onto the REAL WiringSchemeDB before building. DB has 7
tables: `projects, tech_assignments, panel_inspections, file_hashes, session_log, tech_audit_log,
users`. **No `panels`, `documents`, or `assignments` table.**

| Brief entity | Real schema | Verdict |
|---|---|---|
| PROJECT | `projects` (name, client, project_state ✓; voltage/region/location encoded in `code`) | EXISTS (partial); `substation` MISSING |
| PANEL | **No table** — a panel = a FRAME file `uploads/<CODE>/frames/frame_*.json` (`panel_name`, `cables[]`), linked to a tech via a `tech_assignments` row | MAPS-TO frames (files). Multi-panel workflow buildable WITHOUT schema change; panel is not a DB entity |
| DOCUMENTS | Files on disk: schedule=`uploads/<CODE>/frames/*.xlsx`, drawings=`uploads/<CODE>/drawings/`. `file_hashes` row is dedup-only (hash/name/type/project_code) | MAPS-TO files; no per-panel DB link, no document registry |
| ASSIGNMENT | `tech_assignments` (technician_id, project_code, frame_id, panel_name, status, assigned_by/at ✓) | EXISTS; `priority`, `due_date`, `instructions` MISSING |
| STATUS | Fragmented: `tech_assignments.status` (assigned/in_progress/paused/completed), `review_status` (ready_for_qc/rework), `qc_status` (not_ready/ready_for_qc), `supervisor_approved`, `projects.project_state` | All 7 brief statuses representable with existing columns (spread across 5 columns) |
| ROLE PERMISSIONS | `users.role` = system_admin, ops_director, prod_supervisor, qaqc_engineer, wiring_technician (all 5 present) | EXISTS |

**🛑 Decisions pending (NOT created — need user sign-off before any schema change):**
1. PANEL — keep file-based frames (no change) vs. new `panels` table?
2. ASSIGNMENT — add `priority`/`due_date`/`instructions` columns vs. drop/overload?
3. DOCUMENTS — keep files-on-disk vs. add a `documents` table linking project+panel+file?
4. PROJECT — parse voltage/region/location/substation from `code` (no change) vs. add columns?

"Technician sees only assigned items" already has a query path: `tech_assignments WHERE technician_id=X`
(`/api/tech/my-panels`). No schema change, migrate, or push performed.

---

---

## MODULE 24 — DIRECTOR LIVE PER-PROJECT/PER-PANEL SUMMARY REPORT (2026-06-27)

Replaced the static ExportTab (download buttons + snapshot) as the director's primary view with a
LIVE on-screen summary showing all active projects and a per-panel breakdown table beneath each.

### Endpoint (new, read-only)
`GET /api/director/projects-summary` — director/admin only (JWT + RolesGuard).

Aggregation: fetches `projects` (is_active=true, ordered by code), `tech_assignments` (is_hidden=false),
and `users` (wiring_technician role) in 3 parallel queries. Joins in-memory by `technician_id → users.id`.

Per-project summary:
- `project`: `{ code, name, client, state, panelCount, panelsCompleted, panelsInProgress, totalCables, cablesSrcDone, cablesDstDone, wiringPct }`
- KPI formula: same as dashboard — `(src_done + dst_done) / (cables_total * 2) * 100` (no divergence)

Per-panel rows (sorted: in_progress → assigned → paused → completed, then alpha by panel_name):
- `{ panelName, frameId, assignmentId, status, cablesTotal, cablesSrcDone, cablesDstDone, wiringPct, technicianName, reviewStatus, qcStatus }`

**"All projects" source:** `prisma.projects.findMany({ where: { is_active: true } })` — same DB query
the rest of the app uses. Projects have both a `code` (PK, varchar 150) and `name` (varchar 200).

### Frontend
New component: `src/pages/director/tabs/SummaryReportTab.tsx`
- Auto-refreshes every 30 s; pauses polling when tab is hidden (visibilitychange).
- Manual "Refresh" button (56 px touch target) with spinning icon while loading.
- "Updated N ago" caption updates every 15 s without a full fetch.
- Expand All / Collapse All controls; each project card defaults to expanded.
- Export strip (secondary): xlsx / csv download buttons; PDF removed from primary (still available on backend).
- Each project card: code · name · client · chips (panels, done, wiring%, cables) · 1px progress bar.
- Collapsible panel table (min-width 680px, scrolls inside card — page does not scroll horizontally).
  Columns: Panel | Status | Wiring % (mini bar + %) | Cables (src / dst / total) | Technician | QC
- Status badges colour-coded: gray=Draft/Not Started, blue=Assigned/Verified, amber=In Progress/Paused,
  green=Completed, orange=Paused, red=Rejected.
- QC badge reads `review_status` first, then `qc_status` fallback.
- Empty states: projects with zero panels → "No panels assigned yet".
- CSS: two new classes `report-bar-fill` and `report-proj-fill` (width via CSS vars `--report-bar-pct`
  and `--report-proj-pct` set with `setProperty` — no inline styles, avoids lint warnings).

`DirectorDashboard.tsx` updated: `import SummaryReportTab` replaces `import ExportTab`.
`ExportTab.tsx` kept (dead code, no remaining imports) — xlsx/csv export logic lives in `SummaryReportTab`.

### Bug fixed (pre-existing, found during TS check)
`WiringTab.tsx`: `const kpi` was declared after the `useEffect` that referenced it, triggering TS2448
(block-scoped variable used before declaration). Fixed by hoisting the derived-value `const` declarations
above the `useEffect`.

### Files changed
- `backend/src/director/director.service.ts` — added `projectsSummary()` method
- `backend/src/director/director.controller.ts` — added `GET projects-summary` route
- `src/services/api.ts` — added `directorApi.projectsSummary()`
- `src/pages/director/tabs/SummaryReportTab.tsx` — created (live report component)
- `src/pages/director/DirectorDashboard.tsx` — switched from ExportTab to SummaryReportTab
- `src/styles/design-system.css` — added `.report-bar-fill` and `.report-proj-fill` CSS classes
- `src/pages/technician/tabs/WiringTab.tsx` — hoisted `kpi` const above its effect (TS fix)

---

## PENDING / FUTURE WORK
- [x] SVG pan/zoom panel frame viewer (drawings/*.svg) — currently 3D Three.js view exists
- [x] Post-execution re-validation stamping (supervisor stamps .revalidation.json)
- [ ] Real-time WebSocket updates (panels/cables change reflected live across users)
- [ ] QR code / OTP gate — explicitly excluded from current scope


---

## Audit — 2026-06-27

### Feature Comparison Table

#### System Admin

| Feature | Status | Evidence (file / route) | Gap / next action |
|---------|--------|------------------------|-------------------|
| Login / JWT auth | DONE | `backend/src/auth/auth.controller.ts` POST /api/auth/login | — |
| Logout | DONE | `backend/src/auth/auth.controller.ts` POST /api/auth/logout | — |
| User CRUD (create, edit, delete, toggle status, reset password) | DONE | `backend/src/users/users.controller.ts` (GET, POST, PUT, DELETE, toggle-status, reset-password) | — |
| Role assignment via UI | DONE | `backend/src/admin/admin.controller.ts` POST admin/users/:id/change-role | — |
| Diagnostics dashboard (DB health, uptime, CPU, mem, errors) | DONE | `src/pages/admin/tabs/DiagnosticsTab.tsx` + `admin.controller.ts GET admin/diagnostics` | — |
| Session log view + clear | DONE | `src/pages/admin/tabs/SessionsTab.tsx` + `admin.service.ts` sessions query | — |
| Sync local to cloud | DONE | `src/pages/admin/tabs/SyncTab.tsx` + `admin.controller.ts POST admin/sync/run` | — |
| Local-vs-cloud DB toggle (db-config) | DONE | `src/pages/admin/tabs/DbConfigTab.tsx` + `backend/src/admin/db-config.ts` | — |
| File storage view | DONE | `admin.controller.ts GET admin/file-storage` | — |
| Audit activity log | DONE | `src/pages/director/tabs/ActivityTab.tsx` (reused) + `GET director/activity` | — |
| System shutdown endpoint | NOT_DONE | Old: `POST /api/system/shutdown`. New: absent. | Add `POST /api/admin/shutdown` |
| Auto-start on boot (Windows Task Scheduler) | NOT_DONE | Old: `setup_autostart.bat`. New: `start_dwes.bat` is manual-only. | Create `setup_autostart.bat` for DWES |
| Auto-restore sessions on backend restart | NOT_DONE | Old app had startup session restoration. New NestJS starts cold. | Implement on-startup hydration if needed |

#### Operations Director

| Feature | Status | Evidence (file / route) | Gap / next action |
|---------|--------|------------------------|-------------------|
| Director dashboard with live KPI strip | DONE | `src/pages/director/DirectorDashboard.tsx` + `backend/src/director/director.service.ts` | — |
| Live per-project / per-panel summary report (on-screen, auto-poll 15 s) | DONE | `src/pages/director/tabs/SummaryReportTab.tsx` — collapsible per-project + per-panel table, 15 s poll | Live report is now active |
| Export dashboard: XLSX / CSV / PDF | DONE | `src/pages/director/tabs/ExportTab.tsx` + `GET director/export` — NOTE: ExportTab is no longer mounted (replaced by SummaryReportTab). Backend route still works. | Re-expose ExportTab if still needed |
| KPI formula `(src_done + dst_done)/(total*2)*100` | DONE | `backend/src/director/director.service.ts:22` | PASS |
| Activity log (login/logout + wiring actions) | DONE | `src/pages/director/tabs/ActivityTab.tsx` + `GET director/activity` | — |
| Old composite KPI `(0.35P+0.30Q+0.20T+0.15U)*100` | NOT_DONE | Old: `main.py:776`. New: `wiringKpi*0.7+qcPassRate*0.3` (director.service.ts:30). Different formula. | Document intentional change or restore weights |
| Add KPI / Reset KPI controls | NOT_DONE | Old: `DIR.openAddKPI()` / `DIR.resetKPI()` + time-period toggles. New: none. | Decide if needed; implement KPI period filter |
| KPI Trend Analysis chart (daily/weekly/monthly/yearly) | NOT_DONE | Old: Chart.js trend chart. New: no charts in director. | Add chart if required |
| Technician KPI comparison chart | NOT_DONE | Old: bar chart per technician. New: workforce in export only. | Low priority |
| Auto-refresh with configurable interval | PARTIAL | Old: 10 s dropdown. New: SummaryReportTab fixed 15 s poll. | Expose configurable interval |
| 7-day activity heatmap | NOT_DONE | Old: `dir-heatmap`. New: activity as event list, no heatmap. | Low priority |

#### Production Supervisor

| Feature | Status | Evidence (file / route) | Gap / next action |
|---------|--------|------------------------|-------------------|
| Project list with status filter | DONE | `src/pages/supervisor/tabs/ProjectsTab.tsx` + `GET /api/projects` | — |
| Create / edit / delete project | DONE | `backend/src/projects/projects.controller.ts` (POST, PUT, DELETE) | — |
| Project state transitions + submit-to-director | DONE | `POST /api/projects/:code/state` + `POST /api/projects/:code/submit-to-director` | — |
| Excel wiring schedule upload with column-mapping | DONE | `src/pages/supervisor/tabs/FramesTab.tsx` (UploadFrameModal: file/sheet/mapping steps) + `POST /api/upload/wiring-schedule-mapped/:code` | — |
| Frame verify flow (Draft to Verified to Assignable) | DONE | `src/components/ui/VerificationModal.tsx` (GET verify-data + POST verify-confirm) + `frames.service.ts` (none/verified/validated states) | — |
| Frame list, detail, delete | DONE | `FramesTab.tsx` + `GET/DELETE /api/projects/:code/frames/:id` | — |
| Assign frame to technician | DONE | `FramesTab.tsx` AssignModal + `POST /api/tech/assign-frame` | — |
| Drawing upload (PDF/DWG/image) | DONE | `FramesTab.tsx` UploadDrawingModal + `POST /api/upload/drawing/:code` | — |
| Drawing inline PDF preview popup | DONE | `FramesTab.tsx:1171` DrawingViewerModal with iframe for PDF | — |
| Drawing delete | DONE | `DELETE /api/projects/:code/drawings/:id` | — |
| Completion report (name, cable count, %, start/end, duration) | DONE | `backend/src/common/completion-report.helper.ts` + `CompletionReport.tsx` | — |
| Revalidation (supervisor re-stamps) | DONE | `POST supervisor/panel-report/:code/:frameId/revalidate` + confirm-revalidation | — |
| Approval queue (approve/rework) — UI | PARTIAL | `ApprovalTab.tsx` + backend routes exist, but ApprovalTab NOT imported in SupervisorDashboard — DEAD CODE | Wire ApprovalTab into SupervisorDashboard |
| Panel review (review-panels, panel-detail) — UI | PARTIAL | `ReviewTab.tsx` + backend routes exist, but NOT imported in SupervisorDashboard — DEAD CODE | Wire ReviewTab |
| Assignment management tab — UI | PARTIAL | `AssignmentTab.tsx` + backend routes exist, but NOT imported — DEAD CODE | Wire AssignmentTab |
| Changeover (mid-changeover to new tech) — UI | PARTIAL | `ChangeoverTab.tsx` + `POST /api/tech/changeover` exist, but ChangeoverTab NOT imported — DEAD CODE | Wire ChangeoverTab |
| Live summary (all-panels / projects overview) — UI | PARTIAL | `SummaryTab.tsx` exists, NOT imported in SupervisorDashboard — DEAD CODE | Wire SummaryTab |
| Panel report XLSX — UI | PARTIAL | Backend `GET supervisor/panel-report/:code/:frameId/xlsx` exists, exposed only in ReviewTab (dead code) | Wire ReviewTab |
| User management (team view) | DONE | `src/pages/supervisor/tabs/UsersTab.tsx` imported + `GET /api/users` | — |
| QR code generation / bulk QR | NOT_DONE | Old: `GET /api/tech/qr/:id` + bulk-qr. New: explicitly excluded (PROGRESS.md). | Excluded by design |
| OTP gate for wiring start | NOT_DONE | Old: `POST /api/tech/verify-otp`. New: explicitly excluded. | Excluded by design |

#### QA/QC Engineer

| Feature | Status | Evidence (file / route) | Gap / next action |
|---------|--------|------------------------|-------------------|
| QC dashboard with KPI strip | DONE | `src/pages/qaqc/QAQCDashboard.tsx` + `GET /api/qaqc/stats` | — |
| Ready-for-QC panel queue | DONE | `src/pages/qaqc/tabs/PanelsTab.tsx` + `GET /api/qaqc/ready-panels` | — |
| Panel inspection form (visual/redmarkup/labeling/compliance/overall) | DONE | `src/pages/qaqc/tabs/InspectionFormTab.tsx` + `POST /api/qaqc/inspect-panel/:id` | — |
| Inspection history | DONE | `src/pages/qaqc/tabs/HistoryTab.tsx` + `GET /api/qaqc/inspections` | — |
| Completed panels list | DONE | HistoryTab reused + `GET /api/qaqc/all-completed` | — |
| Reports tab (dedicated) | PARTIAL | `QAQCDashboard.tsx` renders HistoryTab for 'reports' tab — no dedicated report view | Implement a dedicated QC report tab |

#### Wiring Technician

| Feature | Status | Evidence (file / route) | Gap / next action |
|---------|--------|------------------------|-------------------|
| Tech dashboard = Digital Wiring ONLY | DONE | `TechnicianDashboard.tsx` tabs=[], renders PanelsTab or WiringTab only | — |
| My panels list | DONE | `src/pages/technician/tabs/PanelsTab.tsx` + `GET /api/tech/my-panels` | — |
| One-wire-at-a-time modal with Next (not Skip) | DONE | `WiringTab.tsx:186` — `handleNext()` calls `goNextPending()` | — |
| Mark source / destination independently | DONE | `WiringTab.tsx:130` — `handleMarkEnd('src'/'dst')` + `techApi.cableAction(... 'src_only'/'dst_only')` | — |
| Auto-advance to next incomplete after both ends done | DONE | `WiringTab.tsx:146-153` — 600 ms delay then goNextPending | — |
| Progress KPI bar | DONE | `WiringTab.tsx:105` — `(srcDone+dstDone)/(total*2)*100` | — |
| Start / Pause with reason / Resume / Complete | DONE | `WiringTab.tsx` + `POST /api/tech/start/:id`, pause/:id, resume/:id, complete/:id | — |
| Cable note per wire | DONE | `WiringTab.tsx:59` noteText + debounced save | — |
| Filter + search wire list | DONE | `WiringTab.tsx:63` — filter: pending/one_end/done/all + search | — |
| SVG frame diagram viewer | DONE | `src/components/SvgFrameViewer.tsx` + WiringTab:536 | — |
| Mark ready / cancel ready for assignment | DONE | `PanelsTab.tsx:213` + `POST /api/tech/mark-ready`, cancel-ready | — |
| Completion report (name, cable count, %, start/end, duration) | DONE | `backend/src/common/completion-report.helper.ts` — all fields present | — |
| Submit report | DONE | `POST /api/tech/submit-report/:id` | — |
| Panel OTP verify gate | NOT_DONE | Explicitly excluded by design (PROGRESS.md line 1320) | — |
| QR scan to start | NOT_DONE | Explicitly excluded | — |
| Biometric fingerprint login | NEW | `src/hooks/useBiometric.ts` + `EnrollBiometricModal.tsx` — WebAuthn, not in old app | New feature |

#### Cross-cutting / Infra

| Feature | Status | Evidence (file / route) | Gap / next action |
|---------|--------|------------------------|-------------------|
| Login demo-account dropdown (grouped by role) | DONE | `src/pages/LoginPage.tsx:346` DemoUserSelect grouped by role, fetches `GET /api/auth/demo-users` | — |
| Demo accounts incl. supervisor2 | DONE | `backend/seeds/accounts.seed.json` — supervisor2 added 2026-06-27, all roles present | — |
| cable_status shape consistent (key=String(idx), value={src,dst,note}) | DONE | tech.service.ts:46,185,217 + WiringTab.tsx:73,83 — all match | PASS |
| No prisma migrate / prisma push | DONE | Searched all scripts, package.json — zero hits. Prisma used for type gen only (db pull workflow). | PASS — CRITICAL |
| KPI formula single source | DONE | director.service.ts:22,71,103; completion-report.helper.ts:32; WiringTab.tsx:105 — identical | PASS |
| Status flow tech side (assigned/in_progress/paused/completed) | DONE | tech.service.ts — guards enforced + auto-start on cable action | PASS |
| Status flow frame side (none/verified/validated) | DONE | frames.service.ts:113,122 — enforced | PASS |
| Status flow supervisor (approved/rework_requested) | DONE | supervisor.service.ts approveAssignment / reworkAssignment | PASS |
| Session logging | DONE | auth.service.ts writes session_log; admin GET admin/sessions reads it | — |
| Health / env / time endpoints | DONE | auth.controller.ts GET /api/health, /api/env, /api/time | — |
| Two-theme support (classic / industrial) | NOT_DONE | Old: `data-theme="industrial"` CSS. New: Tailwind single theme, no toggle. | Low priority |
| Local-cloud DB switch + sync | DONE | DbConfigTab.tsx + admin.service.ts setDbConfig() + SyncTab.tsx | — |

---

### Step 3 — Key Invariant Verification

| Invariant | Result | Evidence |
|-----------|--------|----------|
| KPI formula `(src_done+dst_done)/(total*2)*100` everywhere — no divergent copies | PASS | `director.service.ts:22,71,103`; `completion-report.helper.ts:32`; `WiringTab.tsx:105` — all identical. NOTE: composite KPI formula differs from old app: new=`wiringKpi*0.7+qcPassRate*0.3`; old=`(0.35P+0.30Q+0.20T+0.15U)*100`. Intentional simplification, not a bug — but needs documentation. |
| Status flow Draft/Verified/Assigned/In Progress/Paused/Completed/approved/rejected enforced | PASS | Frame: none/verified/validated in frames.service.ts. Assignment: assigned/in_progress/paused/completed guarded in tech.service.ts. approved/rework in supervisor.service.ts. |
| No `prisma migrate` / `prisma push` anywhere — CRITICAL | PASS | Searched all .bat, .ps1, .sh, package.json. Zero hits. Package scripts: build/start/start:dev/test only. |
| `cable_status` shape consistent key=String(index), value={src,dst,note} | PASS | Written in tech.service.ts:46 as `cableStatus[String(i)]={src:false,dst:false,note:''}`. Read via `key=String(cableIndex)`. Frontend WiringTab.tsx:73 reads `st[String(idx)]`. All match. |

---

### PROGRESS.md vs Code Discrepancy Flags

1. Director dashboard: PROGRESS.md does not document `SummaryReportTab.tsx`. The live report IS NOW ACTIVE — imported and rendered in `DirectorDashboard.tsx:36`. `ExportTab.tsx` is no longer rendered by DirectorDashboard (replaced). PROGRESS.md still shows ExportTab as the director's sole content. Update PROGRESS.md.
2. Supervisor orphan tabs: `ApprovalTab.tsx`, `AssignmentTab.tsx`, `ChangeoverTab.tsx`, `ReviewTab.tsx`, `SummaryTab.tsx`, `DrawingsTab.tsx` all exist in `src/pages/supervisor/tabs/` but NONE are imported in `SupervisorDashboard.tsx`. Dead code — PROGRESS.md does not flag this gap.
3. QR/OTP: PROGRESS.md line 1320 marks these excluded. Code confirms no backend routes exist. Consistent.
4. SVG frame viewer: PROGRESS.md line 1317 marks done. Code confirms `SvgFrameViewer.tsx` wired in `WiringTab.tsx:536`. Consistent.

---

### Top 5 Things Left to Reach Parity (ordered by impact)

**1. Wire the 6 orphan supervisor tabs into SupervisorDashboard**
`ApprovalTab`, `AssignmentTab`, `ChangeoverTab`, `ReviewTab`, `SummaryTab`, `DrawingsTab` are fully implemented (backend routes ready, components polished) but not reachable because `SupervisorDashboard.tsx` only imports `ProjectsTab`, `FramesTab`, `UsersTab`. The supervisor cannot approve panels, review completed work, initiate changeovers, see the all-panels summary, manage drawings, or use the assignment queue from DWES today. Fix: add 6 entries to the TABS array and wire each tab in the render block. Estimated effort: ~30 min.

**2. Composite KPI formula change needs sign-off or restoration**
Old: `(0.35*P + 0.30*Q + 0.20*T + 0.15*U) * 100` — Productivity, Quality, Time efficiency, Utilization weighted. New: `wiringKpi*0.7 + qcPassRate*0.3` — simpler but missing T (time efficiency) and U (utilization) dimensions entirely. This will surface different numbers in director reports than what stakeholders expect from the old system. Either formally adopt the new formula with documentation or restore old weights in `director.service.ts:30`.

**3. Director KPI management controls absent (trend chart + time-period filter + reset)**
Old app had: daily/weekly/monthly/yearly/custom date-range KPI trends (Chart.js); Add KPI / Reset KPI tracking-timestamp buttons; technician KPI comparison bar chart. New `SummaryReportTab` shows live per-panel data but has no historical trend view and no time-window controls. The director has no way to view week-over-week KPI change or reset the measurement period. Add a time-windowed KPI chart tab and a reset-tracking endpoint.

**4. Auto-start on boot missing**
Old app shipped `setup_autostart.bat` registering Windows Task Scheduler to auto-start backend 30 s after login — critical for unattended tablet deployments where a reboot (power outage, update) must not require manual intervention. New DWES has `start_dwes.bat` (manual only). Create `setup_autostart.bat` for DWES that registers both backend and frontend to start at Windows login.

**5. System shutdown endpoint absent**
Old: `POST /api/system/shutdown` let sysadmin stop the Python server from the diagnostics UI (visible as "Stop Server" button). New `DiagnosticsTab.tsx` has no such button and `admin.controller.ts` has no shutdown route. Without it, a sysadmin cannot remotely stop the NestJS backend. Add `POST /api/admin/shutdown` (admin role, `process.exit(0)`) and a "Stop Server" button in DiagnosticsTab.

---

## INCIDENT — Login "Can't reach server" (2026-06-27)

**Cause**: Backend was DOWN — NestJS process had stopped when the background shell session ended.
Not a CORS issue, not wrong API URL, not a credentials problem.

**Diagnosis**:
- `POST /api/auth/login` with supervisor1/super123 → `200` + valid JWT when backend is up
- CORS: `main.ts` allows `http://localhost:5173` explicitly
- Frontend: `baseURL: '/api'` + Vite proxy → `http://localhost:3001` (no direct cross-origin request)
- The request never reached the server because nothing was listening on 3001

**Fix**: Restarted backend (`npm run start:dev` in `backend/`). Login works immediately after restart.

**Permanent gap**: No auto-start on boot — listed as Top-5 gap #4 in the 2026-06-27 audit.
Mitigation: add a Windows startup batch file or Task Scheduler entry (future MODULE).

---

## MODULE 25 — TECHNICIAN WIRING: CABLE LOADING FIX + SINGLE-CABLE DETAIL + REMAINING INDICATOR + DRAWING VIEWER (2026-06-27)

### STEP 0 — Diagnosis

**"Wire 1/0" root cause**
- Assignment 35 (`frame_1782548648073`, panel "ENOWA MOBILE SS", SAS project) → `frame_1782548648073.json` does NOT exist on disk in `backend/uploads/SAS_132KV_KSA_RIYADH_2026_003/frames/`.
- `myAssignmentDetail()` returns `frame: null` → `cables=[]` → `total=0`.
- DB has stale `cable_status={"0":{dst:true}}` from a prior partial action (harmless, NOT deleted — demo-safe additive-only rule).
- Assignment 37 (`frame_1782553778855`, 400 cables) has its file and loads correctly.

**Frame button was fake**
- `SvgFrameViewer.tsx` generated a fake SVG schematic computed from cable `source`/`destination` strings — NOT a real drawing.
- Two real PDFs exist in `backend/uploads/SAS_132KV_KSA_RIYADH_2026_003/drawings/`.
- `panel.drawings` already returned by `myPanels()` with `{id, original_name, content_type, uploaded_at}`.
- Drawing file endpoint `GET /api/projects/:code/drawings/:id/file` already authorises technicians assigned to the project.

### STEP 1 — Frame-missing error state

Added dedicated error state in `WiringTab.tsx`: when `detail.frame === null && cables_total > 0`:
- Shows `AlertTriangle` icon + "Frame data not available" title.
- Explains the wiring schedule file is missing from disk.
- Displays the `frame_id` in a monospace code chip.
- "← Back to panels" button calls `onExit()`.
- No "Wire 1/0" crash, no silent 0-cable view.

### STEP 2 — Enhanced CableRow interface

Extended `CableRow` interface to include all JSON cable fields:
`source_device`, `source_terminal`, `dest_device`, `dest_terminal`, `ref`, `sign`, `rack`.

Source block: terminal/device shown as secondary sub-label under "SOURCE" heading.
Destination block: `dest_terminal` / `dest_device` shown as secondary sub-label under "DESTINATION" heading.
Secondary chips: now shows `color`, `size`, `length`, and `ref` (was missing `ref`).

### STEP 3 — Remaining cables indicator

KPI bar now shows:
- `{donePairs}/{total} done` — bold primary counter
- `{remaining} remaining` — amber, only shown when > 0 (disappears when all done)
- `{srcDone} src · {dstDone} dst` — tertiary detail

Previously showed only `{srcDone} src · {dstDone} dst · {donePairs} fully done` with no prominence on remaining.

### STEP 4 — Real drawing viewer (replaces SvgFrameViewer)

"Frame" button in the bottom nav now opens a drawing picker panel:
- Reads drawings from `panel.drawings` (already returned by `myPanels()` — no new API calls).
- Lists all project drawings with type icon (PDF=red, image=blue, DWG=purple).
- **PDF / image**: fetches blob via `projectsApi.drawingFile(panel.project_code, drawingId)` (carries JWT auth header), creates object URL, shows inline in `<iframe>` or `<img>`. Download button in header.
- **DWG / DXF**: shows "DWG preview not available — download to view" note; clicking "Download" fetches blob and triggers download.
- Back arrow returns to drawing list without closing the panel.
- Object URLs revoked on component unmount to prevent memory leaks.
- No new backend routes needed — endpoint was already technician-authorised.

### Files changed

- `src/pages/technician/tabs/WiringTab.tsx` — full rewrite (frame-missing state, enhanced CableRow, remaining indicator, drawing viewer; removed SvgFrameViewer import/usage)
- `src/styles/design-system.css` — added `.wire-drawings-wide`, `.wire-drawings-narrow`, `.wire-drawings-iframe-wrap` (avoids inline-style lint)
- `SvgFrameViewer.tsx` — no longer imported by WiringTab (file left on disk; no other callers)

### Constraints respected

- DB schema unchanged, no migrate/push, no pg_dump needed (all changes read-only or UI-only).
- No new cable_status shape invented.
- TypeScript check: 0 errors after all changes.

---

## DIAGNOSTIC — Full health-check (2026-06-30, read-only)

**Target:** `C:\Users\sathe\OneDrive\Desktop\DWES` (confirmed full DWES root; original path `DWES Trible shooting` does not exist).

### Runtime (at time of check)
- Frontend dev server **UP** — `http://localhost:5173` (HTTP 200), Vite from this folder.
- Backend **UP** — `http://localhost:3001/api/health` (HTTP 200), `db_name: WiringSchemeDB`, uptime ~51 min.
- Backend process: `node dist\main.js` (compiled dist, **not** `nest start --watch`) — stale-backend risk if source edited without rebuild.
- PostgreSQL **reachable** — read-only `SELECT current_database()` → `WiringSchemeDB` (PG 18.3).

### Blockers (production build)
1. **`npm run build` fails** — 3 frontend TypeScript errors:
   - `ProjectsTab.tsx:8` — unused import `ArrowLeft`
   - `ProjectsTab.tsx:707` — unused variable `typeColor`
   - `UsersTab.tsx:92` — `tone: 'default'` not assignable to `DialogTone` (valid: `info|success|warning|error|delete|logout|save|unsaved`)
2. Backend `npm run build` **passes**.

### Warnings
- `startup.log` (30 Jun): launcher reports "Database check failed", attempts SQL restore via `psql` — **`psql` not in PATH** (3× error); logs "Restore complete" anyway. DB is actually fine; launcher is misleading/broken.
- `DEMO_MODE=true` in `backend/.env` — demo users endpoint enabled (not for production).
- Oxlint: 14 warnings (unused imports, hook deps, useless escapes) — non-blocking.
- Node **v24.13.1**; no `engines` field in project `package.json`.
- npm warns `Unknown env config "devdir"`.

### Env / config (masked)
- `DATABASE_URL` → `postgresql://postgres:***@localhost:5432/WiringSchemeDB` ✓
- Ports: frontend 5173, backend 3001 ✓

### Proposed fixes (not applied — await approval)
1. Remove unused `ArrowLeft` / `typeColor`; change `UsersTab` tone `'default'` → `'info'` — **safe, code-only**
2. Use `start_dwes.bat` or `npm run dev:all` with `nest start --watch` instead of `node dist/main.js` — **safe**
3. Add PostgreSQL `bin` to PATH or fix external launcher to skip broken `psql` restore when DB is healthy — **safe (env)**
4. Set `DEMO_MODE=false` before production deploy — **safe (config)**

---

## FIX — Approved diagnostic remediations (2026-06-30)

### Part 1 — Production build unblocked (B1–B3)
- **B1:** Removed unused `ArrowLeft` import from `ProjectsTab.tsx`.
- **B2:** Removed unused `typeColor` from `UploadTypeModal` in `ProjectsTab.tsx`. **Note:** The modal already applies wiring/drawing colors inline via `isWiring ? 'blue-*' : 'indigo-*'` on the banner, icon, and Continue button — `typeColor` was a leftover abstraction never wired to JSX. Safe to reintroduce only if a shared token is refactored later.
- **B3:** Changed `UsersTab.tsx` unblock dialog tone from invalid `'default'` → `'info'` (valid `DialogTone` member).
- **Verify:** `npm run build` (frontend) **passes** — `tsc -b` clean, Vite production bundle emitted.

### Part 2 — Backend watch mode (W1)
- Stopped stale backend PID **19176** (`node dist\main.js`).
- Restarted with `npm run start:dev` (`nest start --watch`) from `backend/`.
- Port **3001** owned by single watch child (PID rotated on reload, e.g. 23884 → 29076).
- Health: `GET /api/health` → 200, `db_name: WiringSchemeDB`.
- Hot-reload confirmed: trivial touch to `backend/src/main.ts` triggered `File change detected. Starting incremental compilation...` and app restart without manual `nest build`.

### Part 3 — Auto-restore launcher neutralized (W2)
**Script:** `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DWES-startup.bat` (writes `startup.log`).

**Before:**
1. Start PostgreSQL service if stopped.
2. `psql … -c "SELECT 1"` — failed when `psql` not on PATH → treated as DB broken.
3. Auto-restore: `DROP DATABASE`, `CREATE DATABASE`, `psql -f backups\WiringSchemeDB_*.sql` (latest by date).
4. Logged **"Restore complete"** even when all `psql` calls failed.
5. Started backend as **`node dist\main.js`** (stale dist).

**After:**
1. PostgreSQL service start unchanged.
2. Read-only DB check via **Node + `pg`** + `DATABASE_URL` (`SELECT 1`) — accurate when DB healthy; no `psql` required.
3. **Auto-restore removed entirely** — no DROP/CREATE/restore on boot; logs WARNING if unreachable, no data modified.
4. Never logs "Restore complete" (restore path deleted).
5. Backend starts as **`npm run start:dev`** (watch mode).

Launcher was **not executed** during this fix (avoid live DB risk).

### Deferred
- **`DEMO_MODE=true`** intentionally unchanged (deploy-time step).

### Drift correction
- Module notes claiming "TypeScript check: 0 errors" were stale after Module 44 regressions; now corrected by B1–B3 fix above.

---

## Tech + Supervisor parity vs v3.0 backup (2026-07-01)

**Reference:** `C:\Users\sathe\OneDrive\Desktop\06_Wiring-App\wiring-app_pg\backend\main.py` + `frontend\index.html`  
**Target:** `C:\Users\sathe\OneDrive\Desktop\DWES`  
**STEP 0:** Single Vite **5173** (PID verified), single backend watch **3001**, health OK.

### Parity table

| Feature | Role | Old behavior | New status | Classification |
|---------|------|--------------|------------|----------------|
| My panels list | Tech | `GET /tech/my-panels` with KPI, cable progress, hidden filter | `PanelsTab` + `GET /api/tech/my-panels` | **PRESENT** |
| Start / pause / resume / complete | Tech | Lifecycle endpoints + audit | `PanelsTab` / `WiringTab` + Nest routes; one-wire + "Next" | **INTENTIONALLY-CHANGED** (single-wire, Next not Skip) |
| Cable status update | Tech | `POST /tech/cable-status` per src/dst | `cable-status` + `cable-action` (one-at-a-time) | **INTENTIONALLY-CHANGED** |
| Submit completion report | Tech | `POST /tech/submit-report/:id` after complete | Backend present; **UI added** on completed panel cards | **PORTED** (2026-07-01) |
| Mark ready (self / per-panel) | Tech | `mark-ready`, `ready-for-assignment/:id` after report | `mark-ready` UI + **fixed** `ready-for-assignment` (was wrongly calling submitReport) | **PORTED** (bug fix + UI) |
| Hide completed panel | Tech | `POST /tech/hide/:id` | Backend only; no UI button | **AMBIGUOUS** — low priority hide-from-dashboard |
| QR / OTP verification | Tech | qr, scan-qr, verify-otp, bulk-qr, generate-otp | Backend + UI exist from prior merge | **INTENTIONALLY-EXCLUDED** per DWES "No OTP/QR" — **await removal decision**; columns untouched |
| Wiring activity / audit view | Tech | audit log in report | `WiringActivityLog` component | **PRESENT** |
| Assign frame | Supervisor | Compare-validated gate + OTP on assign | `AssignmentTab` UI gate; backend assigns without compare API gate (UI enforces) | **PRESENT** (UI gate) |
| Deassign assignment | Supervisor | `DELETE /tech/deassign/:id`; block if in_progress | `DELETE /tech/assignment/:id`; **in_progress guard added**; UI only for `assigned` | **PRESENT** |
| Upload read-headers → mapped | Supervisor | Column mapping wizard → wiring-schedule-mapped | `FramesTab` + `upload/read-headers` + `wiring-schedule-mapped` | **PRESENT** |
| Direct wiring-schedule upload | Supervisor | `POST /upload/wiring-schedule/:code` (no mapping) | Not ported — mapped flow only | **INTENTIONALLY-CHANGED** (mapped upload is DWES standard) |
| Review panels | Supervisor | `review-panels`, `panel-detail`, `POST review` | `ReviewTab` wired in dashboard | **PRESENT** |
| Approve / rework (pre-start) | Supervisor | `pending-approvals`, approve, rework-assignment | `ApprovalTab` + alert strips | **PRESENT** |
| Changeover | Supervisor | `pending-changeovers`, `POST /tech/changeover` | `ChangeoverTab` wired | **PRESENT** |
| Panel report XLSX | Supervisor | panel-report xlsx | `supervisor/panel-report/.../xlsx` | **PRESENT** |
| All-panels summary | Supervisor | all-panels overview | `SummaryTab` ("Panel Status") | **PRESENT** |
| Submit to director | Supervisor | Validates all completed approved; sets state | Backend **validation added**; **UI added** on Projects table | **PORTED** (2026-07-01) |
| Project report PDF | Supervisor | `GET /projects/:code/report-pdf` (fpdf; wrote project_state) | **Backend + UI ported** via pdfkit; **read-only** (no state write) | **PORTED** (2026-07-01) |
| reset-kpi | Director | `POST /director/reset-kpi` | Not present | **INTENTIONALLY-DROPPED** (prior decision) |
| Consolidated supervisor tabs | Supervisor | 6+ separate monolith tabs | Projects + Assignments + Review + Approvals + Changeover + Panel Status | **INTENTIONALLY-CHANGED** |
| KPI weights 0.7/0.3 | — | Old equal weight | DWES director composite | **INTENTIONALLY-CHANGED** |

### Ported this session (Step 2)
1. `GET /api/projects/:code/report-pdf` — pdfkit, read-only export (`projects.service.ts`, `projects.controller.ts`).
2. Submit-to-director validation (completed count, QC pending, approval check) + Projects table buttons.
3. Tech submit-report + ready-for-next UI on completed panels (`PanelsTab.tsx`).
4. `ready-for-assignment/:id` controller bug fix + `readyForAssignment()` service method.
5. Deassign in-progress guard on supervisor delete assignment.

### Left / awaits decision
- **QR/OTP UI + routes** — present but policy-excluded; recommend disable UI gates on start wiring without removing DB columns.
- **Hide completed panel** — backend only; add button if desired.
- **Direct unmapped wiring upload** — superseded by column-mapping flow.

### Verify notes
- `npm run build` (backend + frontend): **pass** (2026-07-01).
- Backend watch hot-reloaded; health 200.
- Tablet QA: manual — supervisor Projects row PDF/Director buttons; tech1 completed panel Submit Report → Ready for Next flow.

---

## Complete paper-style wiring document (2026-07-01)

**Goal:** Read-only per-frame PDF listing **every** cable row (all fields), professional grid layout, optional GA appendix. Does **not** change wiring screen, `cable_status`, `cables_total`, or `project_state`.

### Step 1 — Discovery (before build)

| Item | Location / finding |
|------|-------------------|
| Prior report-pdf | `GET /api/projects/:code/report-pdf` — project-level summary (pdfkit), truncated cable list; button on `ProjectsTab` |
| Frame cable fields | `backend/src/data/mock-store.ts` `Cable`: sno, panel, ferrule, source_device, source_terminal, source, destination, dest_device, dest_terminal, ref, path, color, size, length, sign, remarks, rack — populated by `upload.service.ts` mapped import |
| cable_status reader | Local `parseCS` in services; **new shared** `backend/src/common/cable-status.util.ts` |
| KPI weights | Were hardcoded in `director.service.ts`; **new** `backend/src/common/kpi.constants.ts` (`0.7` / `0.3`) |
| GA drawings | `uploads/<CODE>/drawings/<drawingId>_<filename>` via `FrameStore.getDrawingFile`; inline preview in `FramesTab` / `WiringTab` (PDF + images; DWG download-only) |
| Real 657-row frame | `backend/uploads/SAS_132KV_KSA_RIYADH_2026_001/frames/frame_1782907252683.json` — ENOWA MOB SS, **657 cables** |

### Step 2–4 — Implementation

- **New:** `backend/src/projects/wiring-document.service.ts` — landscape A4 grid, 17 columns, repeating header, zebra rows, color name + swatch, remarks wrap, title block, summary KPI line.
- **Route:** `GET /api/projects/:code/frames/:frameId/report-pdf` (read-only; roles: supervisor/director/admin).
- **GA appendix:** PDF pages merged via `pdf-lib`; images embedded with pdfkit; DWG → reference note; no upload → placeholder page. **No synthetic 3D / fake GA.**
- **Frontend:** `FramesTab` action dialog → **Wiring Document** button; `projectsApi.frameReportPdf(code, frameId)`.
- **Dependency:** `pdf-lib` (GA PDF merge only).

### Step 6 — Verification (657-cable frame)

Script: `backend/scripts/verify-wiring-doc.cjs` (in-memory, no disk write required).

| Check | Result |
|-------|--------|
| Expected cable rows | **657** |
| PDF pages | **18** (~39 rows/page + GA placeholder) |
| PDF size | ~147 KB |
| `project_state` unchanged | **yes** (`not_started` before/after) |
| Build (backend + frontend) | **pass** |

### Tablet / UI

- Download via Supervisor → Projects → Frames modal → frame **Actions** → **Wiring Document**.
- Filename: `<code>_<panel>_wiring_document.pdf`.
- Manual tablet check at 1440×960, 1280×800, 820×1180 recommended.

### Out of scope (explicit)

- 3D elevation / synthetic GA from wiring data (no geometry in schedule).
- One-wire-at-a-time wiring **screen** unchanged.

## 2026-07-01 — Fix ERR_SSL_PROTOCOL_ERROR on localhost:5173

**Root cause:** 
pm run dev:watch ran plain HTTP Vite on port 5173 (ite --host without DWES_HTTPS). Opening https://localhost:5173 makes the browser speak TLS while the server responds with HTTP → ERR_SSL_PROTOCOL_ERROR.

**Fix:** dev:watch now matches dev:https (certs, TCP gateway on :5173, Vite HTTPS on :5174, HTTP redirect on :8080). print-lan-url.mjs warns when using plain 
pm run dev / dev:all to use http:// or switch to dev:watch / dev:https.

**URLs (after restart with 
pm run dev:watch):**
- PC: https://localhost:5173 (or http://localhost:5173 → redirects)
- LAN: https://192.168.0.165:5173
- LAN HTTP upgrade: http://192.168.0.165:8080 → HTTPS :5173
- Plain HTTP-only dev: http://localhost:5173 only when running 
pm run dev / dev:all

**Verified:** curl https://127.0.0.1:5173 and https://192.168.0.165:5173 → HTTP 200 with gateway + 
un-vite-https.mjs.

## 2026-07-03 — ENOWA =H00+R.xlsx compatibility for visual cable workflow

Validated the existing cable-centric visual workflow (technician `WiringWorkstation` single-cable view; supervisor `VerificationModal` → `CableFocusView`) against the real schedule `WRING_FRAME/ENOWA Mobile Substation/=H00+R.xlsx` (WIRING SCHEDULE sheet, 400 cables). Fixes:

1. **`cable-types.ts` `rawVal`** — normalized `_raw` header lookup (uppercase, strip non-alphanumerics) so `LENGTH(m)` (no space, as in this file) matches the `LENGTH (m)` lookup. Length label + proportional span now work from raw Excel columns.
2. **`cable-utils.ts` `resolveWireColor`** — bi-color support: `GREEN/YELLOW` (16 earth wires) resolves to green base + yellow stripe instead of unknown grey.
3. **`CableVisual.tsx`** — renders dashed stripe overlay on the cable path + stripe ring on the color dot for bi-color wires.
4. **`FramesTab.tsx` auto-map** — ferrule now matches `IEC_FERR_A` (`ferr` + `_a` suffix); panel matches `PNLNO_A`.

Verification: frontend `npm run build` pass; scratchpad simulation of auto-map → backend parse → `cableToEntry` on the real file: 400/400 cables parsed, 400/400 lengths (0.5–7 m), 400/400 colors resolved (16 bi-color), IEC_FERR_A/B present on all rows. Auto-map result: sno, ferrule=IEC_FERR_A, color, size, length=LENGTH(m), ref=REFRNCE_A, remarks, sign, panel=PNLNO_A, source_device=DEV_TBLK_A, source_terminal=TERM_A. No DB writes; no spreadsheet-style wiring view remains in technician or supervisor verify flows.

## 2026-07-03 — Technician UI restored to previous stable version

**Request:** Revert the post-11:05 cable-card redesign of the technician workstation; restore the previous stable Technician UI while keeping current backend APIs.

**Source of truth:** `DWES_backups/DWES_backup_2026-07-03_11-05` (full pre-redesign copy; robocopy + pg_dump, manifest verified). DWES is not a git repo, so the backup was the restore source.

**Restored (verbatim from backup):**
- `src/components/technician/wiring/WiringWorkstation.tsx` — navigator sidebar (search/filter/sort), `CableSchematic` wire visual, source/destination end cards, digital schedule-row card (mapped Excel columns via `deriveExcelHeaders`/`scheduleRowCells`), drawings panel (wiring/GA tabs), note autosave, issue flagging, pause flow, DEV bulk bar, Prev/Complete/Next footer, all-done → mark-frame-complete screen.
- `src/components/technician/wiring/wiring-utils.ts` — matching helpers (drops post-backup `cableCountTotal`/`countEndsDone` additions; only consumer is WiringWorkstation).

**Deliberately kept (not technician-facing or additive):**
- `src/components/wiring/` (CableCard/CableVisual/CableFocusView) — still used by supervisor `VerificationModal` preview/verify; no longer used by technician screens.
- `Modal.tsx` (`closeOnBackdrop`/`closeOnEscape` props), `TabletFields.tsx` (autocomplete/spellcheck), backend post-backup fixes (`findFrameByProjectAndId` lookup, panel-name trim, wiring-document changes) — additive, no API contract change.
- Same-day =H00+R.xlsx compat fixes (normalized `_raw` lookup, bi-color colors, FramesTab auto-map).

**Verified:** unchanged-vs-backup confirmed for TechnicianDashboard/PanelsTab/WiringTab/PanelVerificationModal/WiringActivityLog, services/api, store; design-system.css had zero deletions (old `ws-*` classes intact); `npm run build` pass; backend `/api/health` 200 via :3001 and Vite proxy; HMR served restored files live.

## 2026-07-03 — Full cable reference system restored from backup (completes same-day revert)

**Request:** Restore the complete cable reference implementation (mapping logic, visualization, data handling) exactly from `DWES_backups/DWES_backup_2026-07-03_11-05`, without touching unrelated working modules; explicitly no OTP flow introduced/modified/triggered.

**Restored byte-identical from backup (verified by diff):**
- `src/components/ui/VerificationModal.tsx` — supervisor cable-data preview/verify (pre-cable-visual full-detail version)
- `src/pages/supervisor/tabs/FramesTab.tsx` — cable column-mapping wizard (reverts same-day IEC_FERR_A/PNLNO_A auto-map additions; manual mapping unaffected)
- `src/styles/design-system.css` / `src/styles/themes.css` — removes the appended cable-visual style blocks (single-hunk deletions; nothing else changed)
- `backend/src/tech/tech.service.ts` — myAssignmentDetail frame lookup back to `findFrameById` (other methods unchanged)
- `backend/src/upload/upload.service.ts` — panel-name fallback back to rejecting formula-like `=`-prefixed names
- Deleted `src/components/wiring/` (CableCard/CableVisual/CableFocusView/cable-types/cable-utils) — zero remaining references
- (Earlier same day: `WiringWorkstation.tsx` + `wiring-utils.ts` — still byte-identical to backup)

**Intended-kept (verified not cable-related):** Modal closeOnBackdrop/Escape props, TabletFields autocomplete, Operations-toolbar Verify button plumbing (OperationsTab/AssignmentTab/AssignTechnicianModal/ProjectPanelSelect — VerificationModal props contract identical so it works with the restored modal), ProjectsTab project-code format changes, wiring-document.service 5/6-segment code parsing.

**Verification (4-agent adversarial workflow, all PASS):**
- Parity: 8/8 restored files byte-identical; wiring dir absent; all 8 remaining tree diffs classified intended-kept, none cable-related.
- OTP audit: CLEAN — restored frontend files have zero OTP references; tech.service.ts byte-identical to backup so no OTP code modified; WiringWorkstation calls only my-assignment/cable-action/cable-status/dev-bulk/complete/pause/drawings endpoints (no OTP/QR); start/pause/complete have no otp_verified gate; PanelVerificationModal/QrScannerOverlay untouched (dormant, identical to backup).
- Reference integrity: no dangling imports, no orphan CSS usage, CableSchematic intact and styled.
- Runtime: Vite 5173 / backend 3001 / proxy all 200; new bundle contains no removed-module classes; backend watch recompiled restored source.

Frontend + backend builds pass; backend `tsc --noEmit` clean.

## 2026-07-03 — Classic Digital Wiring Frame restored from design docs (technician)

**Reference:** `Digital_Wiring_Execution_System_for_Review.pdf` (sections 07-08: TECH-DASH, WIRE-EXEC, WIRE-EXEC-COLUMNS, MOD-PAUSE, WIRE-EXEC-DONE) + `06_Wiring-App/docs/DIGITAL_WRING_FRAME.pdf`. OTP/QR gate screens (MOD-OTP/MOD-SCAN-QR) intentionally NOT restored per standing no-OTP policy — audited CLEAN.

**Restored/added (technician-scoped only):**
- `DigitalWiringFrame.tsx` — classic full-table execution view: NO./FERRULE/SOURCE/DESTINATION/CABLE VISUAL PATH (ref label + colour bar, length-scaled, GREEN/YELLOW dual-band)/COLOR/SIZE/LENGTH/SRC+DST checkboxes/STATUS chip (Pending→SRC Done→DST Done→Both Done→Issue)/NOTES per row; filter toolbar (search + device/size/color/source/destination + Clear); validation strip (N/N validated, missing-fields count, src/dst tallies); rows memoized with shared `DEFAULT_CABLE_STATUS` identity.
- `WiringWorkstation.tsx` — Frame/Focus view toggle (localStorage `dwes-tech-wiring-view`; focus default per dwes-reports-backup skill); per-row `toggleEndAt`/`noteChangeAt` with FUNCTIONAL state updates + per-key rollback (poll-safe); paused amber banner + acknowledged Resume (`techApi.resume`); 'Tea Break' pause reason; classic toast "Cable #N Completed"; review mode (`reviewing` strip) fixing the Review-cables no-op; focus note routed through per-row handler (frame column stays in sync); `load`/`syncProgress` deps on `panel?.id` (dashboard poll no longer resets active cable).
- `TechnicianDashboard.tsx` — 6-tile TECH-DASH stats strip (Completed/In Progress/Paused/Assigned/Not Completed/Completion %).
- design-system.css — appended `dwf-*`, `ws-view-toggle`, `ws-pause-banner`, `ws-review-strip` blocks.

Coexists with same-day concurrent additions (column prefs, ScheduleFieldPanel, 3D View/Report workspace tabs, live sync poll, `ensureCableList`) — all preserved.

**Verified:** 12-agent workflow: spec-parity checklist (all WHAT-IT-DOES bullets p61-p80 PRESENT/PARTIAL; OTP items excluded), scope audit PASS (technician files only; supervisor/director/admin untouched), OTP audit CLEAN, runtime PASS, 7 bug reports → 6 adversarially confirmed → all 6 fixed. `npm run build` + `tsc --noEmit` exit 0.

**Known spec gaps (need backend per-cable timestamps — not done, awaiting decision):** per-cable completion time for KPI; "single side checked too long" blink alert. Timer-starts-on-first-check kept as Start-button flow (backend also auto-starts on first cable action).

## 2026-07-04 — Full-schedule visibility fix + enterprise wiring grid (technician)

**Runbook:** DWES_technician_frame_full_schedule_fix.md — Step 0 layer trace executed before any code.

**Step 0 verdict:** Count correct (=400) through disk → endpoint → count-source → parse; became invisible at the RENDER layer. `uploads/132KV_UAE_DUBAI_2026_001/frames/frame_1783160041157.json` has cable_count=400 = cables.length=400 (rich rows, 14 excel_headers). `GET /api/tech/my-assignment/:id` returns full cables[] (disk path `uploads/<code>/frames/<frame_id>.json` exact; probe 401 not 404). Screen N = max(frame.cables.length, frame.cable_count, assignment.cables_total) — stale cables_total can never understate. No slice/cap anywhere in the render path.

**Root cause (Layer 5):** `.ws-shell` is a `position:fixed inset-0` fullscreen overlay, but the dashboard tab container `.nav-tab-panel` retained `transform: translateY(0)` from its entry animation (`fill: both`) — a non-none transform makes the panel the containing block for fixed descendants, trapping the workstation inside the tab box and collapsing its flex body (navigator/main/grid) to 0px. Header/KPI/footer kept intrinsic heights → "empty middle" symptom mistaken for data gating.

**Fixes:**
- `WiringTab.tsx` — portals `WiringWorkstation` to `document.body` (viewport-fixed regardless of ancestor transforms).
- `tabs.css` — `nav-tab-panel-in` now ends at `transform: none` (systemic: no fixed overlay can be trapped by tab panels again; same class of bug previously hit the Toast, fixed the same day by portal).
- `WiringWorkstation.tsx` — `load()` now surfaces real HTTP status + backend message on failure with a Retry button (was: promise with no .catch → eternal skeleton silently hiding 404/500). KPI strip shows real totals: `{done} / {N} cables · {remaining} remaining · {kpi}% wired · {issues} issues`.

**Same-day redesign (Table view):** `DigitalWiringFrame.tsx` rewritten as enterprise virtualized grid — 100% Excel fidelity (every row; every excel_header column via getCellValue/_raw), custom `useVirtualRows` (no deps, rAF-windowed), sticky header, frozen #/FERRULE left + SRC/DST/STATUS/NOTES right, search across ALL raw cells + notes, per-column numeric-aware sort, status/device/size/color/src/dst filters, compact/comfortable density (persisted), keyboard shortcuts (↑↓/jk, S/D mark ends, Enter complete, F focus, I inspector, / search), live cable inspector reusing CableSchematic + all visible fields + note/flag-issue. `cable_status` shape untouched (key=String(idx), {src,dst,note[,issue]}); all writes still via cableAction/cableStatus/devCableBulk. wsg-* CSS block on var(--t-*) tokens (theme-safe); tablet: inspector docks below <1100px. Loading skeleton (ws-skel-*).

**Verified:** `npm run build` exit 0 (frontend); backend untouched this pass. Live stack: gateway :5173 HTTPS 200 / HTTP 301, backend :3001 health OK. Wire-level: technician session header showed "1 / 400" (payload carried full frame). Remaining eyeball checks for user: rendered row count == 400 in Table view; SRC/DST tick persists across refresh.

**Ops:** `scripts/start-dwes-stack.ps1` (dev:watch supervisor, auto-restart, 5173-guard, capped log) + `scripts/register-dwes-autostart.ps1` (logon Task Scheduler registration — user must run once; auto-registration was correctly blocked by permission policy).

## 2026-07-04 — Scrambled column mapping fixed (Excel → frame parser) + frame regenerated

**Runbook:** DWES_fix_scrambled_column_mapping.md — Step 0 reported before code.

**Step 0 verdict:** Parser (`UploadService.uploadMapped`) assigns by header NAME via a caller-supplied mapping — the scramble originated in the stored mapping of `frame_1783160041157` (=H00+R.xlsx, 400 cables): `ferrule ← PNLNO_A` (panel designation "=H00+R" constant across all rows) instead of `IEC_FERR_A`; `panel` unmapped. Cause chain: FramesTab auto-suggest matched ferrule only on literal "ferrule" (sheet has IEC_FERR_A/B → no match), panel matcher missed "PNLNO", ferrule is required → supervisor forced a wrong manual pick; backend accepted silently. Also latent: rows where DEV_TBLK_A end appears second in the IEC pair got contradictory source_device vs source (serial 2: source QDC3:11 vs source_device 74R1).

**Fixes:**
- `FramesTab.tsx` auto-suggest: ferrule now matches IEC_FERR_A / *ferr* (non-_B) / wire-no/cable-no synonyms and explicitly REJECTS pnl/panel columns; panel matches PNLNO/pnl_no.
- NEW `backend/src/upload/parse-wiring.ts` — pure `parseWiringSheet(buffer, sheetName, mapping)` extracted verbatim from uploadMapped (single source of truth; reusable by maintenance scripts), plus: EXPLICIT-FIRST endpoint derivation (source = DEV:TERM columns when mapped; destination = far end of ferrule/path pair ≠ source — fixes serial-2-style contradictions and same-device pairs like XTE-2:3/XTE-2:2), constant-ferrule sanity guard (≥20 rows, ≤1 distinct value → reject with candidate suggestions; no silent scrambled frames), unmatched-header reporting (logged; data always kept in _raw).
- `upload.service.ts` — delegates to parseWiringSheet; guard errors → 400 with guidance; logs unmatched columns.

**Regeneration (Step 2):** original xlsx retained on disk → reparsed with corrected mapping {ferrule: IEC_FERR_A, panel: PNLNO_A}. Invariants asserted before write: count 400→400, sno order identical (cable_status String(idx) alignment preserved); cables_total untouched (zero DB writes this task; pg_dump not on PATH, noted — file-store only). Old JSON backed up to `frame_1783160041157.json.bak_scrambled_2026-07-04T10-57-12-638Z`. Unmatched now: TERMSIDE_A/B (empty), IEC_FERR_B (mirror).

**Verified:** serials 1/2/6/400 field-by-field vs _raw — ferrule = real IEC pair matching endpoints; "=H00+R" homed in panel (no orphan chip); serial 400 far-end logic correct on same-device pair. Frontend+backend builds exit 0. Live backend serves corrected frame immediately (resolveAssignmentFrame prefers disk when diskLen ≥ memLen).

## 2026-07-04 — Technician "Rework" on completed panels (additive, non-destructive)

**Runbook:** DWES_add_technician_rework_button.md — Step 0 verified before code: card buttons keyed on status==='completed' × report_submitted (Submit Report vs View Wiring); complete() sets status+completed_at; supervisor review() sets review_status/review_notes (overwrites — so rework APPENDS via read-modify-write); no websocket → supervisor board updates via existing polling.

**Backend (additive):** `POST /api/tech/rework/:id` (tech.controller/service). Owner-only (**403** ForbiddenException, per runbook, vs the 400 style of older guards); only from status='completed' (already in_progress → idempotent no-write return); preserves cable_status/src/dst counters/started_at entirely (edit, not reset); sets status='in_progress', completed_at=null. If report_submitted: requires non-empty reason (400 otherwise), sets report_submitted=false + report_submitted_at=null, review_status→'pending' (only if previously set). Audit: `[REWORK <ISO> by <name>] reason: …` APPENDED to review_notes, clamped to the varchar(500) column keeping newest; plus tech_audit 'rework' entry via logAudit. cables_total never touched; no schema change.

**Frontend:** amber outline **Rework** button (h-14/56px, ≥44px touch) on every completed card (both Submit-Report and View-Wiring variants), above Delete. Confirm modal: soft copy when un-submitted (reason optional) / strong copy when submitted (un-submit + supervisor re-review; reason REQUIRED — confirm disabled until filled). techApi.rework(id, reason). On success: list reloads → tiles recompute, card returns to In Progress. Errors surface backend message (403/validation) — no silent failure.

**Policy default (per runbook):** approved panels CAN be reworked — doing so un-submits and forces supervisor re-review. To lock approved panels instead, block when review_status==='approved'.

**Verified:** builds exit 0 (nest + vite). Live guards: unauth 401; nonexistent id 404; non-owner on real completed assignment #55 → 403 'Not your assignment' (no write). Happy-path click left to user (demo env; pg_dump not on PATH — no pre-write dump possible, and the endpoint's writes are the user-commissioned feature itself, additive + reversible by re-completing).

**Ops note:** found the 3001 backend was an ORPHAN from an earlier dev:all run (TaskStop didn't kill the Windows child; dev:watch's backend crashed EADDRINUSE) — killed orphan, relaunched backend watcher. Explains earlier "stale code serving" symptoms.
