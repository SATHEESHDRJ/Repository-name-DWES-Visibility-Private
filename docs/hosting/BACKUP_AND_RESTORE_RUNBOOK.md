# DWES Backup & Restore Runbook (Cloud, Provider-Neutral)

**Date: 2026-07-13.** Targets: RPO ≤ 24 h, retention 30 days, RTO ≤ 4 h (assumptions from `HOSTING_REQUIREMENTS.md` — confirm at gate). **This runbook fixes the known gap: `dwes_auth.sqlite` was excluded from BOTH legacy backup systems** (`scripts/BACKUP.md:69`, `infra/oci/scripts/backup-oci.sh`) — here it is a first-class item.

## 1. What must be backed up (the full DR set)

| Item | Contents | Loss impact |
|---|---|---|
| PostgreSQL `WiringSchemeDB` | users, projects, assignments, inspections, audit, hashes | core data gone |
| `uploads/` volume | ALL engineering files (frames, drawings, reports) — system of record | drawings gone; DB alone cannot rebuild them |
| `dwes_auth.sqlite` (+`-wal`) | passkeys + refresh tokens | every fingerprint login dies; all sessions logged out |
| Env/secrets inventory | variable NAMES + where each value lives (dashboards) — never the values themselves in the backup | slow, painful rebuild |
| The Git repo | code + infra | mitigated by GitHub + local copies |

## 2. Backup layers (Option C)

**Layer 1 — Neon built-in** (DB only): point-in-time restore/branching on the platform. Zero effort, but same-provider — never the only layer.

**Layer 2 — nightly off-provider job** (the DWES-owned truth): a small Railway cron service (or scheduled script on the office PC during transition) that runs an adaptation of `infra/oci/scripts/backup-oci.sh`:
```bash
ts=$(date +%Y%m%d-%H%M)
pg_dump "$DATABASE_URL" -Fc -f "wiring-$ts.dump"                  # Neon over TLS
tar -czf "uploads-$ts.tar.gz" -C /app uploads                     # volume
sqlite3 /app/data/dwes_auth.sqlite ".backup 'auth-$ts.sqlite'"    # WAL-safe copy — THE FIX
# manifest with SHA-256 of each artifact, then:
rclone copy . r2:dwes-backups/$ts/ --checksum
```
Retention: R2 lifecycle rule deletes objects older than 30 days. Alert if the nightly object is missing (UptimeRobot heartbeat URL or Cloudflare Workers cron ping — free).

**Layer 3 — local PC copies (transition period):** the existing Windows Task-Scheduler backup (`scripts/backup.ps1`, daily 02:00, 21 snapshots) keeps running until cloud go-live is signed off. Additionally pull a weekly copy of the R2 backup folder to the office PC (`rclone copy r2:dwes-backups ...`) so a total cloud-account loss still leaves data in hand.

## 3. Restore procedures

**DB (worst case, ≤30 days back):**
```bash
rclone copy r2:dwes-backups/<ts>/wiring-<ts>.dump .
pg_restore --no-owner --no-privileges --clean --if-exists -d "$DATABASE_URL" wiring-<ts>.dump
```
Then the count-verification query from `DATABASE_MIGRATION_GUIDE.md`. For fine-grained recovery (accidental deletion minutes ago): Neon PITR/branch first.

**Uploads volume:** stop API (prevents concurrent writes) → untar into the volume → restart → spot-check one drawing per project via the app (authenticated download).

**Auth SQLite:** stop API → replace `/app/data/dwes_auth.sqlite` with the `.backup` copy (delete stale `-wal`/`-shm`) → restart → verify one passkey login. Accepted loss: refresh tokens issued after the snapshot (users re-login once).

**Full-provider loss (Railway gone):** new Railway project (or any Docker host) → redeploy image from GitHub → recreate env vars from the inventory → restore volume + sqlite from R2 → repoint the Worker route. Rehearsed path ≈ 1–2 h, inside RTO.

## 4. Drills (non-negotiable)
- **Before go-live:** one full restore of all three artifacts into a scratch environment — required by `FINAL_DEPLOYMENT_CHECKLIST.md`.
- **Quarterly:** restore latest nightly DB dump into a Neon branch + open one uploads tarball; record date/result in this file's log below.
- **After any provider/architecture change:** full drill again.

| Drill date | Scope | Result | Notes |
|---|---|---|---|
| — | — | — | first entry due before go-live |
