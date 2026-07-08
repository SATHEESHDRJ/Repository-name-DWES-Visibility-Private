# DWES — Debug Pass Report

_Generated: 2026-07-05. Environment: clean install of the source (excluding `node_modules`) into a Linux sandbox on Node v22.22.3, npm 10.9.8._

## Summary of what ran

| Step | Result |
|------|--------|
| Frontend `npm install` | ✅ Clean — 219 packages, no errors |
| Backend `npm install` | ✅ OK — native modules built; only deprecation warnings |
| Frontend `tsc -b` | ✅ 0 errors |
| Frontend `vite build` | ✅ Builds; 1 large-bundle warning |
| Backend `nest build` | ⛔ **Blocked** — 289 errors, all caused by ungenerated Prisma client (see C1) |
| Frontend lint (`oxlint`) | ⚠️ 0 errors, 22 warnings |
| Backend tests (`jest`) | ⛔ **Cannot run** — `jest: not found` (see H2) |
| Backend runtime | ⛔ **Not attempted** — needs PostgreSQL + Prisma engine (see C1, blockers) |

The app is fundamentally healthy: the frontend type-checks and builds cleanly, and the backend code appears sound (all build errors trace to one environmental cause). The problems below are mostly configuration, tooling, and hygiene issues rather than logic bugs.

---

## Blockers (environment, not code defects)

These prevented full verification in the sandbox. They are **not** necessarily broken on your Windows machine.

- **Prisma engine download blocked.** `prisma generate` fails with `403 Forbidden` fetching `binaries.prisma.sh`. The sandbox network is allowlisted, so the query/schema engine binaries can't be downloaded. Without a generated client, the backend cannot type-check or run here. On your machine (with internet) this works normally.
- **No PostgreSQL in sandbox.** The backend seeds users and connects to `WiringSchemeDB` at boot (`backend/src/main.ts`), so I could not do a live runtime smoke test.

---

## Critical

### C1 — Backend build shows 289 TypeScript errors (all from ungenerated Prisma client)
**Files:** all of `backend/src/**` that touch `this.prisma.*`
**What:** `nest build` reports 289 × `TS2339: Property 'users'/'projects'/… does not exist on type 'PrismaService'` plus downstream `Property … does not exist on type 'unknown'`.
**Cause:** `@prisma/client` was never generated in this environment. I confirmed `PrismaService extends PrismaClient` (`backend/src/prisma/prisma.service.ts`) and that every referenced model (`users`, `projects`, `tech_assignments`, `session_log`, `panel_inspections`, etc.) matches `backend/prisma/schema.prisma`. So these are **false positives from the missing client**, not real code errors.
**Fix:** run `npx prisma generate` from `backend/` before building. Consider adding it to the build script:
```json
"build": "prisma generate && nest build"
```
so a fresh clone/CI never hits this.

---

## High

### H1 — `start_dwes.bat` sends users to the wrong port (5173 vs actual 5175)
**File:** `start_dwes.bat` (lines 16–18), reinforced by `README.md` (line 28)
**What:** The launcher runs `npm run dev`, but that script is `vite --host --port 5175` (`package.json` line 7). The batch window is titled "port 5173" and prints `Frontend → http://localhost:5173`. README also says "open http://localhost:5173". Opening 5173 after this launcher shows nothing — the dev server is on **5175**.
**Note:** The other launcher, `Start DWES.cmd` → `scripts/launch.mjs`, runs the HTTPS stack (`dev:https`) where 5173 *is* correct (it's the HTTPS gateway). So the two launchers legitimately use different ports, which compounds the confusion.
**Fix (trivial):** in `start_dwes.bat`, change the label and echo to `5175`; in `README.md` change the manual-start URL to `http://localhost:5175` (or standardize the plain-HTTP dev port back to 5173 by dropping `--port 5175`).

### H2 — Backend test script references `jest`, but jest isn't installed
**File:** `backend/package.json` (lines 10–11); also root `package.json` line 22 delegates here
**What:** `npm test` → `jest --passWithNoTests` → `sh: 1: jest: not found`. Neither `jest`, `ts-jest`, nor `@types/jest` are in `devDependencies`. So `npm test` and `npm run test:watch` both fail immediately (they can't even report "no tests").
**Fix:** either add the test tooling —
```
cd backend && npm i -D jest ts-jest @types/jest
```
plus a `jest` config — or, if tests aren't wanted yet, change the scripts to a no-op (e.g. `"test": "echo \"no tests\" && exit 0"`).

### H3 — Secrets and DB dumps committed in the repo
**Files:** `backend/.env` (contains `DATABASE_URL` with `postgres:postgres`, `JWT_SECRET`), `pg_dump_*.sql` (×2 in root), `backups/*.sql`, and plaintext logins in `README.md`
**What:** Real credentials, a JWT signing secret, and full database dumps sit in the working tree. If this folder is ever pushed to a shared/remote git or zipped for handoff, all of it leaks.
**Fix:** ensure `.env`, `*.sql`, and `backups/` are in `.gitignore` (`.env.example` should be the only committed env file); rotate `JWT_SECRET` and the DB password if this has ever been shared; move default-credential docs out of the public README.

---

## Medium

### M1 — `DEMO_MODE=true` in `backend/.env`
**File:** `backend/.env`
**What:** `.env.example` explicitly warns "Must be false in production." With it on, the `/api/auth/demo-users` endpoint and the technician DEV toolbar / reset-all helpers are exposed.
**Fix:** fine for local dev; set to `false` before any LAN/production deployment.

### M2 — `bootstrap()` has no error handling
**File:** `backend/src/main.ts` (line 125, `bootstrap();`)
**What:** The async bootstrap (which connects to Postgres and seeds before Nest starts) is called without `.catch(...)`. If the DB is unreachable, you get an unhandled promise rejection and a noisy stack instead of a clear "cannot connect to database" message.
**Fix:**
```ts
bootstrap().catch((err) => {
  console.error('[DWES] Fatal startup error:', err);
  process.exit(1);
});
```

### M3 — Frontend ships a 1.75 MB JS bundle + 5.3 MB font
**File:** build output (`dist/assets/index-*.js` ≈ 1.75 MB; `material-symbols-rounded-*.woff2` ≈ 5.3 MB)
**What:** Vite warns chunks exceed 500 kB. The full Material Symbols variable font is bundled. On tablets over LAN this is a slow first load.
**Fix:** route-based `React.lazy()` code-splitting for the five role dashboards; subset the icon font to only the glyphs used, or load it from a CDN.

---

## Minor (lint warnings — 22 total, 0 errors)

### L1 — Unused imports/variables (5)
- `backend/src/frames/frames.controller.ts:1` — `StreamableFile` imported, unused
- `backend/src/upload/upload.controller.ts:2` — `Get` imported, unused
- `backend/src/supervisor/supervisor.service.ts:6` — `XLSX` imported, unused
- `backend/src/frames/frames.service.ts:10` — `normalize` declared, unused
- `backend/src/common/completion-report.helper.ts:77` — `safeTech` declared, unused
**Fix:** delete the unused identifiers (trivial, safe).

### L2 — Unnecessary regex escapes (5, `no-useless-escape`)
- `backend/src/projects/wiring-document.service.ts:223`
- `backend/src/admin/db-config.ts:38`
- `backend/src/frames/frames.service.ts:391` and `:460`
- `src/pages/admin/tabs/DbConfigTab.tsx:203`
**Fix:** remove the redundant `\` (e.g. `\/`, `\-`, `\.` where not needed). Cosmetic.

### L3 — React `exhaustive-deps` (6)
Mostly in `src/components/technician/wiring/WiringWorkstation.tsx` (`mapping`/`cables` objects recreated each render feeding `useMemo`/`useCallback`; a `useCallback` missing `panel`) and one missing `resetCreateForm` dep.
**Fix:** wrap the derived objects in `useMemo`, or move them out of the dependency array intentionally. Low risk but worth a look — stale-closure bugs can hide here.

### L4 — React fast-refresh `only-export-components` (6)
Files export both components and non-component values, which breaks Vite HMR fast refresh. Dev-experience only; no runtime effect.

---

## Suggested order of action

1. `cd backend && npx prisma generate`, then confirm `nest build` is clean (resolves C1). Add `prisma generate` to the build script.
2. Fix the port label in `start_dwes.bat` + README (H1) — 30 seconds, prevents "it won't load."
3. Decide on tests: install jest or neutralize the scripts (H2).
4. `.gitignore` + rotate secrets (H3); set `DEMO_MODE=false` before any shared deploy (M1).
5. Add the `bootstrap().catch` guard (M2).
6. Sweep the unused imports and useless escapes (L1, L2) — trivial and safe.
7. Consider code-splitting / font subsetting later (M3).

_No fixes were applied — this is report-only per request. Items L1, L2, H1, M2 are trivial/safe and I can apply them on your say-so._
