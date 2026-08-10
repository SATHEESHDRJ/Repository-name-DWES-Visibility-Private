# DWES automated backups

Timestamped backups of the DWES project (source, config, assets, uploads, reports, drawings) plus an optional PostgreSQL dump. Backups are stored **inside** the project at `Backup/YYYY-MM-DD_HH-mm` (e.g. `Backup\2026-07-09_02-00`).

## Quick start

```powershell
# Manual backup
npm run backup

# Dry run (disk check + logging, no files written)
npm run backup:dry-run

# Verify latest backup (structure + report)
npm run backup:verify

# Pre-operation backup (before hard reset / deploy)
npm run backup:pre-op

# Register daily scheduled task (runs when you are logged on)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
```

Default backup root: `C:\Users\sathe\OneDrive\Desktop\DWES\Backup`

Each run creates a new folder, e.g. `2026-07-09_02-00`, and never overwrites older backups. The `Backup` folder itself is excluded from robocopy (no recursive backup).

## Backup folder layout

```
Backup/
  2026-07-09_02-00/
    files/              # robocopy mirror of project (minus exclusions)
    database/
      WiringSchemeDB.dump
    backup-report.json  # size, counts, disk space, verification status
  logs/
    backup.log          # append-only run log
```

## Configuration

Edit `scripts/backup.config.json`.

| Setting | Purpose |
|--------|---------|
| `backupRoot` | Where timestamped backup folders are stored (default: `{projectRoot}\Backup`) |
| `backupFolderPrefix` | `null` = folder name is `YYYY-MM-DD_HH-mm` only; set e.g. `DWES_backup` for legacy naming |
| `schedule.mode` | `daily` or `twice-daily` (used by task registration only) |
| `schedule.dailyTime` | Time for daily mode, e.g. `"02:00"` |
| `schedule.twiceDailyTimes` | Two times for half-day intervals, e.g. `["02:00","14:00"]` |
| `excludeDirectories` | Passed to `robocopy /XD` (relative to project root) |
| `retention.maxCount` | Keep only the newest N backups (default **21**) |
| `retention.maxAgeDays` | Delete backups older than N days (default **30**; both rules apply) |
| `diskSpace.minFreeGb` | Abort if drive free space is below this (default **5**) |
| `diskSpace.reserveMultiplier` | Also require free ≥ estimated size × multiplier (default **1.15**) |
| `verification.requiredPaths` | Post-backup structure checks (must exist under `files/`) |
| `verification.optionalPaths` | Logged if present; not required for success |
| `database.enabled` | Set `false` to skip PostgreSQL export |
| `database.envFile` | Path to `.env` with `DATABASE_URL` (default `backend\.env`) |
| `database.pgDumpPath` | Path to `pg_dump.exe` if not on PATH |
| `database.failOnDbError` | `true` = fail entire backup if DB dump fails |

### Default exclusions

- `node_modules`, `backend\node_modules`
- `.git`, `Backup` (prevents recursive backup)
- `dist`, `backend\dist`, `.vite`, `coverage`, `logs`
- `backend\data` (writable WebAuthn SQLite store — back up separately if needed)

Source, config, `public/`, `backend/uploads/` (frames, drawings, reports), and scripts are included.

### Environment overrides

| Variable | Effect |
|----------|--------|
| `DWES_BACKUP_ROOT` | Override `backupRoot` |
| `DWES_PROJECT_ROOT` | Override project path |
| `DWES_BACKUP_CONFIG` | Alternate config file path |
| `DWES_BACKUP_SCHEDULE` | `daily` or `twice-daily` when registering the task |
| `DWES_BACKUP_TRIGGER` | Report label: `manual`, `scheduled`, `pre-operation` |
| `PG_DUMP_PATH` | Override `pg_dump` location |

### Switch daily vs twice-daily

1. Set `"mode": "daily"` or `"mode": "twice-daily"` in `scripts/backup.config.json` (or set `DWES_BACKUP_SCHEDULE`).
2. Re-register the task:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
```

## Pre-operation backups

Automatic full backup before destructive operations:

| Trigger | Mechanism |
|---------|-----------|
| Dev hard reset | `backend/src/dev/dev.service.ts` runs `scripts/run-pre-operation-backup.mjs` before wipe |
| `npm run deploy:lan` / `deploy:lan:https` | Runs `backup:pre-op` before build |

Hard reset still creates its own `uploads/backups/HARD_RESET_DB_*` pg_dump + upload archive; the pre-op backup is an additional full project snapshot under `Backup/`.

## Database export

DWES uses **PostgreSQL** (`backend/prisma/schema.prisma`). The backup script reads `DATABASE_URL` from `backend/.env` (never committed) and runs `pg_dump`.

- Default dump: `database/WiringSchemeDB.dump` (PostgreSQL custom format)
- Set `"format": "plain"` for `WiringSchemeDB.sql` instead
- Requires PostgreSQL client tools (`pg_dump`). Default path: `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`
- If `pg_dump` is missing or Postgres is down, the file backup still completes unless `database.failOnDbError` is `true`

## Post-backup verification

After each live backup, `backup.ps1` checks required paths under `files/` and writes results to `backup-report.json`.

Verify the latest backup manually:

```powershell
npm run backup:verify

# Or a specific folder:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-backup.ps1 `
  -BackupPath "C:\Users\sathe\OneDrive\Desktop\DWES\Backup\2026-07-09_02-00"
```

## Logging

Append-only log: `{backupRoot}\logs\backup.log`

Each backup folder contains `backup-report.json` (date, size, file count, disk free before/after, verification status, errors). Legacy `manifest.json` from older runs is still accepted by `verify-backup.ps1`.

## Windows Task Scheduler

Register (interactive user, no password):

```powershell
cd C:\Users\sathe\OneDrive\Desktop\DWES
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
```

Run when logged off (requires stored credentials; often needs **Run as administrator**):

```powershell
$pwd = Read-Host -AsSecureString -Prompt "Windows password for scheduled task"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 `
  -RunWhenLoggedOff -User "$env:USERDOMAIN\$env:USERNAME" -Password $pwd
```

Remove the task:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -Unregister
```

Verify in Task Scheduler (`taskschd.msc`) under task name **DWES Project Backup** (daily at 02:00 by default).

## Restore

### Files

Copy the desired `files\` subtree from a backup folder back to your project location, or use robocopy:

```powershell
robocopy "C:\Users\sathe\OneDrive\Desktop\DWES\Backup\2026-07-09_02-00\files" `
  "C:\Users\sathe\OneDrive\Desktop\DWES" /E
```

Then run `npm install` in the project root and `npm install` in `backend\` (`node_modules` are excluded from backups). Regenerate frontend build with `npm run build`.

### Database (custom `.dump`)

```powershell
$env:PGPASSWORD = 'your_password'
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
  -h localhost -p 5432 -U postgres -d WiringSchemeDB `
  --clean --if-exists `
  "C:\Users\sathe\OneDrive\Desktop\DWES\Backup\2026-07-09_02-00\database\WiringSchemeDB.dump"
```

### Database (plain `.sql`)

```powershell
$env:PGPASSWORD = 'your_password'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
  -h localhost -p 5432 -U postgres -d WiringSchemeDB `
  -f "C:\Users\sathe\OneDrive\Desktop\DWES\Backup\2026-07-09_02-00\database\WiringSchemeDB.sql"
```

Restore onto a test database first when possible. Stop the DWES backend while restoring production data.

### Verify after restore

```powershell
npm run backup:verify
npm run build
npm run dev:all
```

## Sample `backup-report.json`

```json
{
  "backupName": "2026-07-09_02-00",
  "createdAt": "2026-07-09T02:00:42.1234567+04:00",
  "durationSeconds": 38.4,
  "dryRun": false,
  "trigger": "manual",
  "projectRoot": "C:\\Users\\sathe\\OneDrive\\Desktop\\DWES",
  "backupDestination": "C:\\Users\\sathe\\OneDrive\\Desktop\\DWES\\Backup\\2026-07-09_02-00",
  "diskSpace": {
    "freeGbBefore": 128.5,
    "estimatedGb": 2.1,
    "requiredGb": 5,
    "minFreeGb": 5,
    "reserveMultiplier": 1.15,
    "freeGbAfter": 126.3
  },
  "files": {
    "excludedDirectories": ["node_modules", ".git", "Backup", "dist"],
    "fileCount": 1842,
    "totalSizeMb": 2148.6,
    "robocopyExitCode": 1
  },
  "verification": {
    "passed": true,
    "skipped": false,
    "errors": [],
    "checks": [
      { "path": "package.json", "required": true, "exists": true },
      { "path": "backend\\src", "required": true, "exists": true },
      { "path": "src", "required": true, "exists": true },
      { "path": "backend\\uploads", "required": false, "exists": true, "fileCount": 312 }
    ]
  },
  "database": {
    "enabled": true,
    "success": true,
    "skipped": false,
    "dumpFile": "C:\\...\\database\\WiringSchemeDB.dump",
    "sizeMb": 4.2
  },
  "retention": { "removed": 0, "maxCount": 21, "maxAgeDays": 30 },
  "errors": [],
  "success": true
}
```
