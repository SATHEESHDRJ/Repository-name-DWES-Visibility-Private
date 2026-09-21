# Phase 0 — Surface inventory

Source: codebase audit + [shell/dashboard exploration](4ed2f9d2-91e7-46df-a7b9-2d0a045569e5) + [Cut/Strip/API exploration](5ccbb176-0182-41f9-8343-ca7587b4b04f).

## Routes (App.tsx)

| Path | Role | Shell |
|------|------|-------|
| `/` | Login | none |
| `/supervisor` | prod_supervisor | DashboardShell → AppShell |
| `/technician` | wiring_technician | DashboardShell → AppShell |
| `/director` | ops_director | DashboardShell → AppShell |
| `/admin` → `/admin/settings` | system_admin | DashboardShell + Outlet |
| `/qaqc` | qaqc_engineer | out of this recovery scope |
| `/ui-showcase` | protected | showcase only |

## Mount chain

Role page → `DashboardShell` → `AppShell` (Topbar + Sidebar + `#main-content.dash-main`). Document scroll on shell; nested scroll still possible in modals / `.dwf-workspace` / dense tables.

## Supervisor

| Kind | Item | Notes |
|------|------|-------|
| Tabs (React state, not URL) | projects / status / live-tb | `SupervisorDashboard.tsx` |
| Cards / strips | Projects selectors + dual action toolbars; Status KPIs + `sws-portfolio-strip`; LIVE TB panel | Consolidate toolbars (no repeated CTAs) |
| Modals | Panel Workflow (`PanelWorkflowWorkspaceModal` via Workflow button); Assign/Reassign/Mid Change (`PanelAssignmentModal` + `confirmAsync`); wiring/GA upload/view; crimping data view (per assignment) | Confirms above workflow |
| Selection | `useProjectSelectionStore` (session) + `panelSelection.ts` | Not `searchParams` |

## Technician

| Kind | Item | Notes |
|------|------|-------|
| Mission bar | Identity + KPIs + Continue/Resume only | Duplicate quick-access row **removed** (2026-09-19) |
| Sidebar tabs | Panels / Tablet View / Full View | Sole view switcher |
| Side filters | Tag / Skipped / Equipment / Internal looping / Crimping report | Unique |
| Workspace header | DIGITAL WIRING / STRIPPING / CRIMPING / REPORT + LIVE TB | Sole module switcher |
| Modal | LIVE TB view | |

## Director

| Kind | Item | Notes |
|------|------|-------|
| Tabs | live_status / submitted_panels / monitoring | Local state |
| Portfolio | `DirectorPortfolioStrip` ← `/api/director/stats` | Read-only |
| Grid | Live project/panel cards | Separate `useLatestRequest` tracks |
| Actions | View/download KPI PDF paths only | No assign/edit/delete |

## System Admin

| Kind | Item | Notes |
|------|------|-------|
| Health | `AdminHealthStrip` ← diagnostics + users | Live chip |
| Sections | Users, diagnostics, deployment, DB, sync, danger | Existing authorised only |
| Mutations | Must use confirm + audit | |

## URL / navigation gap

No `useSearchParams` in `src/`. Tab/project/panel are React/Zustand/sessionStorage. Back/forward for those selections is a recovery requirement (not yet implemented).
