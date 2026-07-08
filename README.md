# Digital Wiring Execution System (DWES)

Tablet-optimised wiring execution platform for industrial panel shops. Replaces paper-based wiring documentation with a verified digital workflow across five roles.

---

## How to start

### One-click launcher (recommended)

Double-click `Start DWES.cmd` in the DWES root folder.  
This opens two terminal windows — one for the backend, one for the frontend.

### Manual start

**Terminal 1 — Backend (NestJS)**
```
cd C:\Users\sathe\OneDrive\Desktop\DWES\backend
node dist\main.js
```

**Terminal 2 — Frontend (Vite)**
```
cd C:\Users\sathe\OneDrive\Desktop\DWES
npm run dev
```

Then open your browser: **http://localhost:5175**

---

## Port numbers

| Service  | Port | URL                         |
|----------|------|-----------------------------|
| Frontend | 5175 | http://localhost:5175       |
| Backend  | 3001 | http://localhost:3001       |
| Health   | 3001 | http://localhost:3001/api/health |

---

## Login credentials

| Role                | Username        | Password        |
|---------------------|-----------------|-----------------|
| System Administrator| sysadmin        | admin123        |
| Operations Director | ops_director1   | ops_director123 |
| Sales Director      | sales_director2 | sales_director2 |
| Production Supervisor| supervisor1    | super123        |
| QA/QC Engineer      | qa1             | qa1             |
| Wiring Technician   | tech1           | tech1           |

Additional accounts (from live DB — password = username unless noted above):
- `qa2` / `qa2` (QA/QC Engineer)
- `tech01`–`tech05`, `tech1`–`tech24` (Wiring Technicians)

Retired demo login: `director1` (deactivated when `DEMO_MODE=true`).

---

## Database

- **Host:** localhost:5432
- **Database:** WiringSchemeDB
- **User:** postgres
- **Password:** postgres
- **ORM:** Prisma (schema at `backend/prisma/schema.prisma`)

> Never run `prisma migrate` or `prisma db push` — the existing schema is live.  
> To introspect: `npx prisma db pull` from the `backend/` folder.

---

## Folder structure

```
DWES/
├── src/                    Frontend React source
│   ├── pages/              Role dashboards
│   │   ├── admin/          System Admin dashboard + tabs
│   │   ├── director/       Operations Director dashboard + tabs
│   │   ├── supervisor/     Production Supervisor dashboard + tabs
│   │   ├── qaqc/           QA/QC Engineer dashboard + tabs
│   │   └── technician/     Wiring Technician dashboard + tabs
│   ├── components/         Shared UI components
│   ├── services/api.ts     All backend API calls
│   ├── store/              Zustand auth store
│   └── types/              TypeScript interfaces
├── backend/
│   ├── src/                NestJS source modules
│   │   ├── auth/           JWT login/logout
│   │   ├── users/          User CRUD
│   │   ├── projects/       Project management
│   │   ├── frames/         Frame file store (disk-based)
│   │   ├── tech/           Technician wiring workflow
│   │   ├── supervisor/     Supervisor review/approval
│   │   ├── qaqc/           QA/QC inspection
│   │   ├── director/       Director KPI/export
│   │   └── admin/          Admin diagnostics/sync/sessions
│   ├── uploads/            Project frames and drawings on disk
│   │   └── <PROJECT_CODE>/
│   │       ├── cables.json
│   │       ├── frames/     *.json (metadata) + *.xlsx (original)
│   │       └── drawings/   *.svg / *.pdf
│   ├── prisma/
│   │   └── schema.prisma   Database schema (read-only)
│   └── dist/               Compiled backend (run via node dist/main.js)
├── Start DWES.cmd          One-click launcher
└── README.md               This file
```

---

## How to add a new project

1. Log in as **supervisor1** (Production Supervisor).
2. Go to the **Projects** tab.
3. Click **New Project**.
4. Fill in: Client, Type, Voltage, Location, Year, Sequence. The project code is auto-generated.
5. Upload a wiring schedule Excel file via the **Frames & Upload** tab.
6. Map the column headers to wire fields (ferrule, source, destination, color, size...).
7. Assign a technician via the **Assignments** tab.

Project code format: `CLIENT_TYPE_VOLTAGE_LOCATION_YEAR_SEQ`  
Example: `ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001`

---

## How to import backup data

The two legacy real-world projects are already imported:
- `DEWA_132KV_PROTECTION_CONTROL_PANEL_132KV_UAE_DUBAI_2026_001` (175 cables)
- `ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001` (935 + 400 cables)

Their frame files live at `backend/uploads/<PROJECT_CODE>/frames/`.

To import additional projects from `wiring-app_pg/uploads/`:
1. Create `backend/uploads/<PROJECT_CODE>/frames/` folder.
2. Copy frame `*.json` and `*.xlsx` files there.
3. Ensure each JSON has `project_code`, `panel_name`, `cables`, `uploaded_at`, `cable_count`, `mapping`, and `id` fields.
4. Restart the backend — `FrameStore.loadAll()` picks them up on startup.

---

## Role capabilities summary

| Role | Key actions |
|------|-------------|
| **System Admin** | User CRUD, role assignment, DB diagnostics, sync controls, session log |
| **Director** | Read-only KPI dashboard, Excel export, project progress charts |
| **Supervisor** | Create projects, upload schedules, assign technicians, approve/rework reports |
| **QA/QC** | Inspect completed panels, set pass/fail/conditional, record ferrule and visual checks |
| **Technician** | Cable-by-cable wiring workflow, pause/resume timer, submit completion report |

---

## Development / demo mode

Set in `backend/.env` (see `backend/.env.example`):

| Variable | Purpose |
|----------|---------|
| `DEMO_MODE=true` | Enables demo users, reset-all projects, technician dev toolbar, and **Hard Reset DB** |
| `ALLOW_DEV_HARD_RESET=true` | Optional — allows `POST /api/dev/hard-reset` without `DEMO_MODE` (local testing only) |

**Hard Reset DB** (Admin → Settings): wipes all projects, wiring data, uploads, session log, WebAuthn passkeys, and duplicate hash cache; re-seeds 5 canonical demo projects; preserves user accounts. Visible only when the Vite dev server is running **and** one of the flags above is set. Requires `sysadmin` login and confirmation phrase `HARD RESET DB`. **Never enable in production.**

---

## Development rebuild

To rebuild the backend after source changes:
```
cd backend
npm run build
node dist\main.js
```

To rebuild the frontend:
```
npm run build
```
