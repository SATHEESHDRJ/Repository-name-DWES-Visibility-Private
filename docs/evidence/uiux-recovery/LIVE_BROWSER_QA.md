# Live browser QA — residual duplicate-chrome scan

Date: 2026-09-20  
Stack: UI `:5275` · API `:3101`  
Method: puppeteer-core role login → count button/`role=button` labels; watch owner-sensitive CTAs

## Chrome-scope (supervisor)

| Tab | Projects command bar present? |
|-----|-------------------------------|
| Projects | Yes (single bar, workflow order) |
| Status | No |
| LIVE TB | No (Refresh / Retry Analysis / Export only) |

## Watch-label counts (must be ≤1 for nav CTAs)

| Role | New Project | Users | Add Panel | Wiring Upload | Digital Wiring View | Drawing View | Workflow | Continue | Crimping Report | Manage Users |
|------|-------------|-------|-----------|---------------|---------------------|--------------|----------|----------|-----------------|--------------|
| supervisor1 Projects | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 |
| tech2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ops_director1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sysadmin | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

## Other notes

- All four roles: `#root` non-blank, correct `h1`.
- Technician `Edit` ×11 is per-field correction links on the wire card (not dashboard CTA chrome).
- Supervisor/Director/Admin: no duplicate button labels in the interactive set.

## Post-QA fix (2026-09-20)

- **Status → Selected Panel:** removed duplicate Completed/Total/Remaining matrix under progress (see `after-supervisor-status-selected-desktop.png`).

## Result

**No residual owner-sensitive duplicate CTAs or Status KPI row repeat.** Overall remains **PENDING OWNER VISUAL ACCEPTANCE**.
