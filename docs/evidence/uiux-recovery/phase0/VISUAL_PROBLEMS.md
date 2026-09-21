# Visual problems (Phase 0 — living list)

Captured during UI/UX recovery. Owner note (2026-09-19): **do not repeat the same buttons on the dashboard.**

## Confirmed / in progress

| Problem | Where | Status |
|---------|--------|--------|
| Duplicate view/module buttons | Technician mission bar repeated Panels / Table View / Full View / LIVE TB / Stripping / Crimping already in sidebar + wiring header | **Fixed** — mission bar removed when wiring is open; progress KPIs live only in workstation matrix; Tablet View only in sidebar |
| Mission KPI strip + Continue above wiring | Technician: Completed/Total/Remaining/Progress + Continue duplicated the wiring progress matrix + Tablet View | **Fixed** — strip removed while Digital Wiring Schedule is embedded |
| Crimping Report twice | Technician sidebar + workspace module bar both opened Crimping Report | **Fixed** — sidebar entry removed; module bar is the only control |
| Two action toolbars | Supervisor Projects: project actions row + Project Information actions row | **Fixed** — single command bar; Project Information shows doc badges + overview only |
| Command bar order scrambled | Supervisor Projects: Add Panel / views / uploads / New Project mixed left→right | **Fixed** — workflow order: New Project → Users → Add Panel → Edit → Wiring Upload → GA Upload → Digital Wiring View → Drawing View → Workflow |
| Assignment KPI triple-repeat | Technician Current Assignment: chip strip + FieldGrid KPIs + progress % | **Fixed** — one progress matrix + bar; meta FieldGrid has no duplicate Completed/Total/Remaining/Progress |
| Director ring + bar same % | Live Status project/panel cards showed KpiRing and linear bar for identical progress | **Fixed** — linear progress only |
| Admin "Users and roles" echo | Health strip group label matched Settings module title | **Fixed** — health group label is Headcount |
| Crimping matrix "Progress %" looked like overall wiring % | Technician strip/crimp mode showed Progress % while Wire Number was 14/653 | **Fixed** — label is `Prep %` (preparation among required wires only) |
| Repeated project/panel identity | Supervisor Active selectors + large SHUNOOF/=D00 titles in Project Information | **Fixed** — overview header is work-state only; identity stays in Active project/panel |
| Status Selected Panel identity echo | Status tab repeated full project name + panel under Active selectors | **Fixed** — Selected Panel overview is status pill + progress only |
| Status Selected Panel KPI repeat | Progress %/bar + Completed/Total/Remaining matrix duplicated wiring totals | **Fixed** — progress block only; technician lives in Technician Activity |
| Misleading Logged Out badge | Supervisor panel work state showed only "Logged Out" while assignment still in progress | **Fixed** — label is `Working · Offline` / `Assigned · Offline` (session offline kept visible without erasing progress) |
| Excessive empty / card stacking | Role dashboards | **Improved** — Admin health no longer duplicates Diagnostics env/uptime/heap; removed nested dash-module under Diagnostics; Director single Read Only badge |
| Weak hierarchy / template look | Generic DashboardShell hero + KPI grids | **Improved** — denser admin sections + portfolio strip radius; hero already compact industrial |
| Nested scroll risk | Panel Workflow / `.dwf-workspace` / dense tables / modals | **Verified** — `.dwf-workspace` clips (`overflow: hidden`); table wrap is the scroll owner; tablet mode locks `body` overflow |
| URL / back-forward | Project/panel/tab URL-addressable | **TECHNICAL PASS** — see `../URL_NAV_EVIDENCE.md` |
| Cut/Strip/Crimp portfolio | Per-assignment APIs only; no aggregate | **PARTIAL** — see `CUT_STRIP_CRIMP_PORTFOLIO.md`; no fake card |
| Evidence PNGs | BEFORE + AFTER galleries | **TECHNICAL PASS** — 20 BEFORE + 20 AFTER PNGs (re-captured 2026-09-20; desktop scan: no new duplicate-chrome defects) |
| confirmAsync polish | Shared dialog density | **TECHNICAL PASS** — industrial `.action-status-*` / form field density; still one confirm system |
| Frontend umbrella `test` | Root package has granular `test:*` / `e2e:*` only | **Documented intentional** — no single `npm test`; use `npm run uiux-recovery:smoke`, `test:state`, backend tests, and `REGRESSION_SMOKE.md` |

## Rules for redesign

1. Each action appears in **one** place only (sidebar **or** page toolbar **or** workspace header — not both).
2. Mission / KPI strips show status and one primary action, not a second nav.
3. Confirmation dialogs stay shared (`confirmAsync`); do not invent parallel confirm UIs.
4. No Cut/Strip/Crimp portfolio UI without a real aggregate API.
5. Overall UI/UX stays **PENDING OWNER VISUAL ACCEPTANCE** until Satheesh approves the AFTER gallery.
