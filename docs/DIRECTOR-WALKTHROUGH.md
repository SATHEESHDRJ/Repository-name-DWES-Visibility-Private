# DWES - Operations Director Walkthrough (A-Z)

Tablet-first presentation script for explaining DWES to the Operations Director.
Hosting / cloud is tomorrow - this walkthrough is local production workflow only.

## 1. What DWES is

Digital Wiring Execution System replaces paper wiring schedules with a controlled digital flow:

1. Supervisor creates projects and panels, uploads Excel wiring schedules and approved drawings.
2. Technicians execute one cable at a time on assigned panels, guided by the **2D Operational Twin**.
3. Progress, skips, and completions are audited.
4. Supervisor generates panel completion reports and can submit them for director review.
5. Operations Director watches **live status** (read-only) and opens **View Report** when needed.

## 2. Roles (local DEMO_MODE)

| Role | Demo login | Job |
|------|------------|-----|
| Production Supervisor | supervisor1 | Projects, panels, uploads, assign, approve, reports |
| Wiring Technician | tech1 / tech24 | Digital Wiring Schedule + Operational Twin |
| Operations Director | ops_director1 | Live status + View Report only |

Passwords: private `backend/seeds/demo-accounts.local.json` (never commit / never share outside demo).

## 3. Walkthrough script

### A. Login (tablet)

1. Open DWES on the tablet.
2. Sign in as **supervisor1**.
3. Point out top bar + glass sidebar after login.
4. Optional: palette control - switch **Arctic / Harbor / Graphite** (stored in `localStorage` key `dwes-app-theme`). Login page also has a theme button.

### B. Project and panels

1. Open Projects.
2. Overnight demo: **ENOWA_DEMO_202607161747** - ENOWA Mobile Substation - Overnight Demo.
3. Panels: `=H00+R` (live twin, 400 cables) and `=T601+R1` (schedule uploaded).
4. SRC/DST are real tags e.g. `74R1:4 -> 86B2:B6` from DEV_TBLK_A/TERM_A + IEC_FERR_A pair.

### C. Assign technician

Assign + approve (overnight used **tech24** on `=H00+R`).

### D. Technician wiring + Operational Twin

1. Login as tech24.
2. Open Digital Wiring Schedule - keep **2D Operational Twin** visible the whole time.
3. Show SRC->DST legend, reverse hint, route arrow, multi-cable trail after Complete/Skip.
4. Demo Start, Complete Cable, Skip (with reason), Pause/Resume.
5. Honest 2D Operational Twin only - no fake Engineering 3D.

### E. Reports

Supervisor View Report; Submit to Director when panels are fully completed.

### F. Director live status

Login ops_director1 -> simplified Live Status (project/panel/tech/cables + View Report). Read-only.

## 4. Sample paths (Desktop, not in git)

- Excel: `C:\Users\sathe\OneDrive\Desktop\wring_frame\ENOWA Mobile Substation\`
- PDF: `C:\Users\sathe\OneDrive\Desktop\Drawing\`
- Track: `DWES/.overnight-enowa-demo.json`

## 5. Theme switcher

- **Login:** theme button (palette) top-right of form panel.
- **After login:** top-bar palette icon -> Arctic / Harbor / Graphite.
- Preference persists via `localStorage` key `dwes-app-theme`.

Tablet sizes: 1024x768, 820x1180, 768x1024.

## 6. Closing line

DWES gives one live picture of every panel: who is wiring it, which cable they are on, and what is completed - without paper schedules. Hosting can be decided tomorrow; the workflow already runs locally.
