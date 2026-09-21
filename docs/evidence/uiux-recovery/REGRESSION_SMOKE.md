# Regression smoke — UI/UX recovery

Date: 2026-09-20 (post Status KPI de-dupe deploy)  
Raw: `regression-smoke-live.json`  
Re-run: `node scripts/uiux-recovery-smoke.mjs`

## API (Bearer after login)

| User | Route | Status |
|------|-------|--------|
| supervisor1 | `/api/projects` | 200 |
| tech2 | `/api/tech/my-panels` | 200 |
| ops_director1 | `/api/director/stats` | 200 |
| sysadmin | `/api/admin/diagnostics` | 200 |

## UI static (nginx `:5275`)

| Path | Status |
|------|--------|
| `/` | 200 |
| `/supervisor` | 200 |
| `/technician` | 200 |
| `/director` | 200 |
| `/admin/settings` | 200 |

## Evidence counts

- BEFORE PNGs: 20 under `phase0/before/`
- AFTER PNGs: 20 under `after/` + supplemental `after-supervisor-status-selected-desktop.png` (Status Selected Panel)

## TECHNICAL PASS

Smoke is **TECHNICAL PASS**. Overall UI/UX remains **PENDING OWNER VISUAL ACCEPTANCE**.
