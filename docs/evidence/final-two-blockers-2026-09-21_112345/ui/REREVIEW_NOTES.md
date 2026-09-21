# UI rereview notes — 2026-09-21

## Fixes applied
- Topbar: hide Live/Polling text label on ?1023px; widen clock card — fixes Live/ONLINE overlapping HH:MM (owner reject).
- Login: html/body overflow locked when login-page-root present (nested scroll mitigation).
- Gallery capture credentials corrected (tech3, ops_director1/ops_director123).
- Missing **status-chips-1440.png**: captured via `scripts/capture-supervisor-status-chips.mjs` ? `after-gallery-rereview/supervisor/status-chips-1440.png` (Supervisor `?tab=status`, 18 status chips).

## Still required for Final PASS
- Satheesh overall Approve on this gallery
- Acceptance drawing for LIVE TB AUTO/HIGH
- Authorized remote CI
- Separate production deploy authority

Overall remains NO-GO.
