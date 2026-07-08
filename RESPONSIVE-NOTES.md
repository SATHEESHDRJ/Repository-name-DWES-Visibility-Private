# DWES — Responsive Pass & Tablet Preview

_Date: 2026-07-05. Verified with `tsc -b` (0 errors), `oxlint` (0 errors), and `vite build` (success). All changes are scoped so the desktop layout at ≥1024px is unchanged._

## Part 1 — Responsive changes

### What I found first (important context)
The app already has more responsive infrastructure than the "not adapting" symptom suggested:

- **Navigation already adapts.** `AppShell` shows a persistent sidebar at ≥1024px and a hamburger button + slide-in drawer below 1024px (`Topbar.tsx` menu button is `tablet-land:hidden`; `Sidebar.tsx` uses `dash-sidebar--mobile-open`). So on tablet portrait the nav is meant to collapse to a hamburger — if it wasn't showing for you, it's worth confirming against the live preview.
- **Modals already shrink.** All `.modal-box-*` use `w-full max-w-*`, so they cap at the viewport width on small screens.
- **The 3D wiring workstation inspector** already collapses under the grid below 1100px.

So rather than rewrite working systems (which risked breaking desktop), I targeted the genuine gaps: grids that used the wrong breakpoint and stayed cramped or oversized at tablet-portrait/mobile, plus the dense upload table.

### Changes per screen

| Screen | File | Change |
|--------|------|--------|
| **Admin → User Management** | `pages/admin/tabs/UserMgmtTab.tsx` | Edit-user and Add-user modal forms were forced to 2 columns at every width. Now `grid-cols-1 tablet-port:grid-cols-2` — single column below 768px so fields aren't squeezed. |
| **Admin → Deployment Mode** | `pages/admin/tabs/DeploymentModeTab.tsx` | Pricing-tier cards jumped straight from 1 column to 2 only at 1024px. Now 2-up from 768px (`tablet-port:grid-cols-2`), still 4-up on wide desktop. |
| **Admin → Hard Reset** | `pages/admin/tabs/HardResetTab.tsx` | "What will be removed" tiles used the stray `sm:` (640px) breakpoint. Switched to the project's `tablet-land:grid-cols-3` so tablet portrait shows a clean 2-up. |
| **Admin → Diagnostics** | `pages/admin/tabs/DiagnosticsTab.tsx` | Stat grid went 2 → 4 columns at 768px (cramped). Now 2 / 3 / 4 across mobile / tablet-portrait / desktop. |
| **QA/QC → Inspection Form** | `pages/qaqc/tabs/InspectionFormTab.tsx` | Overall-result options went 1 → 3 columns at 768px (very tight). Now 1 / 2 / 3 across mobile / tablet-portrait / desktop. |
| **Technician / shared → Report Preview** | `components/ui/ReportPreviewModal.tsx` | KPI cards were 3-up at 768px (cramped inside a modal). Now 1 / 2 / 3 across mobile / tablet-portrait / desktop. |
| **Shared → Upload mapping table** | `styles/design-system.css` | Added a `≤767px` rule that shrinks the dense column-mapping table's font and select widths, reducing horizontal scrolling on tablet/phone. |

### Why these are desktop-safe
Every edit either (a) adds a `tablet-port:` (768–1023px) rule only, or (b) moves a `md:`/`sm:` breakpoint to the project's `tablet-land:` (1024px) so the column count at ≥1024px is identical to before, or (c) lives inside a `@media (max-width: 767px)` block. Nothing changes the ≥1024px rendering.

### Honest scope note
This is a verified **first pass on the concrete overflow/cramping defects** found by a full audit of the admin, director, supervisor, qa/qc, and technician pages. I could **not visually confirm the authenticated dashboards** in this environment because the backend won't run here (no PostgreSQL + Prisma engine download is network-blocked). The remaining per-screen polish is best done iteratively against the live preview on your tablet — see Part 2. Tables in the app already sit inside horizontal-scroll wrappers, so they scroll rather than break; converting the widest ones (e.g. User Management at `min-w-[900px]`) to stacked cards on mobile is a good next step once we can see them live.

---

## Part 2 — Live preview on your tablet

### What I can and can't do from here (honest answer)
I **cannot** give you a URL to open on your tablet. Three hard blockers in this environment:
1. The backend (NestJS + PostgreSQL) can't run here — there's no database and Prisma's engine download is network-blocked.
2. No tunnel tools (ngrok/cloudflared) are available, and outbound access to those services is blocked (verified: HTTP 403).
3. This sandbox isn't reachable from your tablet's network anyway.

So the live app has to run **on your Windows PC**, and your tablet connects to it over your home Wi-Fi. The project already ships all the tooling for exactly this.

### Steps to run it (on your PC)
1. Make sure **PostgreSQL is running** and `WiringSchemeDB` exists (it already does on your machine).
2. In the DWES folder, run the LAN HTTPS stack:
   ```
   npm run dev:https
   ```
   This generates certs, starts the backend, the Vite HTTPS gateway on port **5173**, and prints your **LAN URL** (something like `https://192.168.0.165:5173`). You can also print it any time with `npm run lan:url`.
3. When Windows Firewall prompts, **allow Node.js** on the Private network (ports 5173, 3001, 8080).
4. Put your **tablet on the same Wi-Fi** as the PC (your `.env` references `Ponnu-5GHz @ 192.168.0.165`).
5. On the tablet browser, open the printed **`https://<PC-IP>:5173`**. It's a self-signed cert, so accept the browser warning — or run `npm run certs:trust` on the PC first to avoid it.
6. Log in and use the app. It's the dev server with hot-reload, so any code edits appear on refresh — which is how we can iterate on the responsive layout together.

**Passkey note:** your `.env` sets `RP_ID` / `RP_ORIGIN` to `192.168.0.165`. If your PC's LAN IP changes, update those two values (and restart the backend) or fingerprint sign-in on the tablet will fail. Password login is unaffected.

**Simpler HTTP option (UI viewing only):** `npm run dev:all` serves the frontend on port **5175** bound to all interfaces, so the tablet can open `http://<PC-IP>:5175`. Fine for eyeballing layout, but WebAuthn/passkeys need the HTTPS path above.
