# DWES desktop launch (Dev / Prod)

Windows desktop experience uses **browser shortcuts + hidden Node processes** (no Electron).

## Modes

| Mode | Frontend | Backend | HMR | When |
|------|----------|---------|-----|------|
| **Dev** (default) | `npm run dev` → Vite `:5175` | `npm run start:dev` (Nest watch) | Yes | Daily coding |
| **Prod** | `npm run preview:lan` (built `dist/`) | `node dist/main.js` | No | LAN / demo / stable |

Health gate: `http://127.0.0.1:3001/api/health` must return `{ status: "ok" }` before the browser opens.

## Cold boot sequence (after Windows restart)

`scripts/launch-dwes.mjs` runs these phases in order (logged to `logs/launcher.log` + `logs/startup-report.json`):

1. **PostgreSQL** — TCP `:5432` then `SELECT 1` on WiringSchemeDB (up to 120s)
2. **Recover partial stack** — if Vite is up without Nest, stop orphan frontend and retry
3. **Backend** — free stale `:3001`, spawn Nest, retry every 20s (max 8 attempts)
4. **Backend health gate** — wait until `/api/health` OK (up to 120s) **before** starting Vite
5. **Frontend** — start Vite / preview, wait for full stack (up to 240s)
6. **Browser** — open only when both FE + BE are healthy

If the backend is unavailable, the login page explains that DWES must be
started manually and disables Sign In until `/api/health` succeeds (polls every
5 seconds). It does not claim that automatic startup is running.

Troubleshoot: `npm run startup:logs` or `Get-Content logs\launcher.log -Tail 40`

## How to start

| Action | Command / file |
|--------|----------------|
| Desktop (Dev) | Double-click **DWES.lnk** or `Start DWES (Hidden).vbs` |
| Desktop (Prod) | `Start DWES Prod (Hidden).vbs` or recreate with `npm run shortcut:create:prod` |
| CLI Dev | `npm run launch:dev` |
| CLI Prod | `npm run launch:prod` (build first) |
| Recreate shortcut | `npm run shortcut:create` |
| Stop | `Stop DWES.vbs` or `powershell -File scripts/stop-dwes.ps1` |

Prod build prerequisites:

```bat
npm run build
npm --prefix backend run build
```

## HMR (Development)

1. Launcher starts (or reuses) Vite on `http://localhost:5175`.
2. Browser opens a **normal** Chrome/Edge window with `--disable-http-cache` (not a PWA `--app` window).
3. URL includes `?dwes_dev=<timestamp>` so the first HTML document is not a stale shell.
4. Edit files under `src/` → Vite HMR updates the open tab; **do not** close/reopen the shortcut.
5. Backend Nest `--watch` restarts on `backend/src` changes; the UI reconnects on the next API call.

If the tab was opened as an installed PWA / “Open as app”, HMR websockets can fail — use the desktop shortcut (normal browser window) or open `http://localhost:5175` in a regular tab.

## Duplicate prevention

- If FE is already Vite HMR (Dev) or preview (Prod) **and** `/api/health` is ok → only opens the browser.
- Wrong-mode FE on `:5175` (e.g. preview while launching Dev) → frees **only** the FE port via `check-dev-ports.mjs`, then starts the correct server.
- Lock metadata: `logs/dwes.lock` (mode + ports). Process logs: `logs/launcher.log`, `logs/backend.log`, `logs/frontend.log`.

## Automatic startup

Automatic startup is disabled. DWES does not start the frontend, backend,
database, browser, or a watchdog when Windows boots or a user signs in.

Retired autostart registration and backend-runner entry points are retained as
no-ops so legacy shortcuts or tasks cannot recreate background startup.

Start it manually with **Start DWES.cmd** or **Start DWES (Hidden).vbs** in the
project root. Use **Stop DWES.vbs** to stop the manually started stack.

## Manual test checklist

1. `npm run shortcut:create` → Desktop **DWES.lnk** points at `Start DWES (Hidden).vbs`.
2. Double-click shortcut — no CMD/PowerShell window; browser opens `localhost:5175`.
3. Edit a visible string in a React page under `src/` — tab updates without relaunch.
4. Second double-click — no second Vite/Nest; browser opens again.
5. `Stop DWES.vbs` → ports 5175/3001 free.
6. Prod: build both packages → `Start DWES Prod (Hidden).vbs` → no HMR client in page source; `/api/health` ok.

## Limitations

- Repo under **OneDrive** can delay file watchers; if HMR stalls, save again or restart Vite (`Stop DWES` then relaunch).
- Installed PWA / Edge “app” windows may cache aggressively — prefer the Dev shortcut’s normal browser window.
- Prod does **not** auto-build; missing `dist/` fails silently to `logs/launcher.log`.
- `npm run dev` / `dev:all` in a visible terminal remain unchanged for developers who prefer consoles.
