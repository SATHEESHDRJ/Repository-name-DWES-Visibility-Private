# DWES automated backups

Timestamped backups of the DWES project (source, config, assets, uploads) plus an optional PostgreSQL dump. Backups are stored **outside** the repo so they survive project deletion.

## Quick start

```powershell
# Manual backup
npm run backup

# Dry run (no files written)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup.ps1 -DryRun

# Register daily scheduled task (runs when you are logged on)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
```

Default backup root: `C:\Users\sathe\OneDrive\Desktop\DWES_backups`

Each run creates a new folder, e.g. `DWES_backup_2026-07-03_02-00`, and never overwrites older backups.

## Configuration

Edit `scripts/backup.config.json`.

| Setting | Purpose |
|--------|---------|
| `backupRoot` | Where timestamped backup folders are stored |
| `schedule.mode` | `daily` or `twice-daily` (used by task registration only) |
| `schedule.dailyTime` | Time for daily mode, e.g. `"02:00"` |
| `schedule.twiceDailyTimes` | Two times for half-day intervals, e.g. `["02:00","14:00"]` |
| `excludeDirectories` | Passed to `robocopy /XD` (relative to project root) |
| `retention.maxCount` | Keep only the newest N backups (`null` = keep all) |
| `retention.maxAgeDays` | Delete backups older than N days (`null` = keep all) |
| `database.enabled` | Set `false` to skip PostgreSQL export |
| `database.envFile` | Path to `.env` with `DATABASE_URL` (default `backend\.env`) |
| `database.pgDumpPath` | Path to `pg_dump.exe` if not on PATH |
| `database.failOnDbError` | `true` = fail entire backup if DB dump fails |

### Environment overrides

| Variable | Effect |
|----------|--------|
| `DWES_BACKUP_ROOT` | Override `backupRoot` |
| `DWES_PROJECT_ROOT` | Override project path |
| `DWES_BACKUP_CONFIG` | Alternate config file path |
| `DWES_BACKUP_SCHEDULE` | `daily` or `twice-daily` when registering the task |
| `PG_DUMP_PATH` | Override `pg_dump` location |

### Switch daily vs twice-daily

1. Set `"mode": "daily"` or `"mode": "twice-daily"` in `scripts/backup.config.json` (or set `DWES_BACKUP_SCHEDULE`).
2. Re-register the task:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
```

### Exclusions (size control)

Default exclusions keep backups practical:

- `node_modules`
- `.git`
- `backend\node_modules`

To back up **everything**, set `"excludeDirectories": []`.

Optional large paths you may add if disk space is tight:

- `dist`, `backend\dist` — build output (regenerate with `npm run build`)
- Large temp caches under `uploads` (project uploads are included by default)

## Database export

DWES uses **PostgreSQL** (`backend/prisma/schema.prisma`). The backup script reads `DATABASE_URL` from `backend/.env` (never committed) and runs `pg_dump`.

- Default dump: `database/WiringSchemeDB.dump` (PostgreSQL custom format, same as in-app admin backups)
- Set `"format": "plain"` for `WiringSchemeDB.sql` instead
- Requires PostgreSQL client tools (`pg_dump`). Default path matches the app: `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`
- If `pg_dump` is missing or Postgres is down, the file backup still completes unless `database.failOnDbError` is `true`

Individual `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` in `.env` override parsed `DATABASE_URL` values when present.

## Logging

Append-only log: `{backupRoot}\logs\backup.log`

Each backup folder also contains `manifest.json` (paths, duration, robocopy/db status).

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

Verify in Task Scheduler (`taskschd.msc`) under task name **DWES Project Backup**.

## Restore

### Files

Copy the desired `files\` subtree from a backup folder back to your project location, or use robocopy:

```powershell
robocopy "C:\Users\sathe\OneDrive\Desktop\DWES_backups\DWES_backup_YYYY-MM-DD_HH-mm\files" `
  "C:\Users\sathe\OneDrive\Desktop\DWES" /E
```

Then run `npm install` in the project root and `npm install` in `backend\` ( `node_modules` are excluded from backups).

### Database (custom `.dump`)

```powershell
$env:PGPASSWORD = 'your_password'
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
  -h localhost -p 5432 -U postgres -d WiringSchemeDB `
  --clean --if-exists `
  "C:\...\database\WiringSchemeDB.dump"
```

### Database (plain `.sql`)

```powershell
$env:PGPASSWORD = 'your_password'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
  -h localhost -p 5432 -U postgres -d WiringSchemeDB `
  -f "C:\...\database\WiringSchemeDB.sql"
```

Restore onto a test database first when possible. Stop the DWES backend while restoring production data.
