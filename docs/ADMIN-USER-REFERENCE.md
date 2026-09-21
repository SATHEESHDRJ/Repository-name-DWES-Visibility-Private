# DWES — Administrator User Reference

**Audience:** System Administrator only.
**Classification:** Internal. Do not circulate to technicians or clients.

> **No passwords appear in this document, in the login page, in the source code, or in Git.**
> Passwords are created and reset only through the System Administrator workflow inside DWES
> (Admin → User Management → Reset Password). If a password is unknown, reset it — never look it up.

---

## 1. Approved user list

Maintain this table as the authoritative record of who may access DWES. Update it whenever an
account is created, deactivated, or changes role.

| Username | Full name | Role | Status | Account purpose |
|---|---|---|---|---|
| `sysadmin` | System Administrator | System Admin | Active | Platform administration, user management, database configuration, hard reset |
| `ops_director1` | Operations Director | Operations Director | Active | Executive dashboards, analytics, workforce, project summary reports |
| `director1` | Operations Director | Operations Director | Active | Secondary director account (legacy) — deactivate if unused |
| `supervisor1` | Production Supervisor | Production Supervisor | Active | Projects, panels, drawings, wiring schedules, assignments, changeover, review |
| `qa1` | QA Engineer One | QA / QC Engineer | Active | Panel inspections, QC verification, inspection history |
| `qa2` | QA Engineer Two | QA / QC Engineer | Active | Panel inspections, QC verification, inspection history |
| `tech…` | Wiring technicians | Wiring Technician | Active | Execute wiring on assigned panels only; no access to other panels |

**Before go-live:** review every row. Deactivate any account that is not required in production
(legacy duplicates, unused technician slots, test accounts).

---

## 2. Roles and what each role may do

| Role | May do | May not do |
|---|---|---|
| **System Admin** | Manage users and roles, DB config, diagnostics, deployment mode, hard reset, permanent project delete | Execute wiring; approve QC |
| **Operations Director** | View all projects, KPIs, workforce, activity, summary reports; receive submitted projects | Create/modify projects, panels, assignments |
| **Production Supervisor** | Create projects and panels, upload drawings and wiring schedules, generate/approve 3D models, assign technicians, mid-changeover, review and approve completed panels, permanently delete a project | Perform QC inspections; manage system users beyond technicians |
| **QA / QC Engineer** | Inspect completed panels, record pass/fail and issues, view inspection history | Modify wiring data or assignments |
| **Wiring Technician** | See and wire **only assigned panels**; view that panel's drawing and approved 3D model; submit completion | See unassigned panels, unapproved models, or any other project |

---

## 3. Account lifecycle

1. **Create** — Admin → User Management → New User. Set username, full name, employee ID, role.
   The administrator sets the initial password directly with the user present, or issues a reset.
2. **First sign-in** — the user signs in with username + password, then enrols fingerprint /
   passkey on their own device if the device supports it.
3. **Reset password** — Admin → User Management → Reset Password. Never email or message a password.
4. **Deactivate** — Admin → User Management → Deactivate. DWES keeps the user's history
   (assignments, wiring progress, session log, audit trail) and blocks sign-in.
   Users with linked records are deactivated rather than deleted, by design.

---

## 4. Security rules

- Never store a plaintext password in this document, in a spreadsheet, in a chat message, or in the repository.
- Every password is stored only as a bcrypt hash in the database.
- One account per person. Shared logins break the audit trail and the changeover history.
- Deactivate an account the same day a person leaves the project.
- Passwords are never displayed by the application or returned by any API endpoint.
