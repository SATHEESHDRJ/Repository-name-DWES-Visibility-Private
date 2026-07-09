---
name: dwes-reports-backup
description: DWES report branding, technician wiring workflow, and automated backup operations. Use when editing PDF/Excel reports, Report Preview UI, WiringWorkstation, backup scripts, Task Scheduler registration, or when the user mentions report logo, completion report, npm run backup, or DWES_backups.
paths:
  - backend/src/common/report-branding.ts
  - backend/src/**/*report*
  - backend/src/projects/projects.service.ts
  - backend/src/projects/wiring-document.service.ts
  - backend/src/supervisor/supervisor.service.ts
  - backend/src/director/director.service.ts
  - src/components/ui/ReportPreviewModal.tsx
  - src/components/ui/CompletionReport.tsx
  - src/components/technician/wiring/**
  - scripts/backup.ps1
  - scripts/backup.config.json
  - scripts/register-backup-task.ps1
---

# DWES Reports, Wiring & Backup

## Report branding

**Central module:** `backend/src/common/report-branding.ts`

| Export | File | Helper |
|--------|------|--------|
| Project PDF | `projects.service.ts` | `drawPdfReportHeader` |
| Project XLSX | `projects.service.ts` | `prependExcelReportHeader` (ExcelJS) |
| Frame wiring PDF | `wiring-document.service.ts` | logo via `resolveReportLogoPath` |
| Panel XLSX | `supervisor.service.ts` | `prependExcelReportHeader` |
| Wiring schedule XLSX | `supervisor.service.ts` | logo in row 1 banner |
| Director PDF | `director.service.ts` | logo in header bar |
| Preview UI | `ReportPreviewModal.tsx`, `CompletionReport.tsx` | `CompanyLogo` |

Logo files: `public/logo-full.png`, `backend/assets/report-logo.png`

## Technician wiring

Primary: `src/components/technician/wiring/WiringWorkstation.tsx`

- Focus (default) + optional Table via `DigitalWiringFrame`
- Schedule fields: `ScheduleFieldPanel`, column prefs in `column-prefs.ts`
- Backend frame load: `tech.service.ts` → `resolveAssignmentFrame` (prefer disk when richer)

Before changing cable display, read frame JSON under `backend/uploads/<PROJECT_CODE>/frames/`.

## Automated backup

| Script | Purpose |
|--------|---------|
| `scripts/backup.ps1` | robocopy + optional pg_dump + retention |
| `scripts/backup.config.json` | paths, schedule mode, exclusions |
| `scripts/register-backup-task.ps1` | Windows Task Scheduler |
| `scripts/BACKUP.md` | full docs |

```powershell
npm run backup
powershell -ExecutionPolicy Bypass -File scripts/register-backup-task.ps1
```

Default root: `C:\Users\sathe\OneDrive\Desktop\DWES_backups`

### OCI production backup

| Script | Purpose |
|--------|---------|
| `infra/oci/scripts/backup-oci.sh` | pg_dump + uploads tarball → `/mnt/dwes-data/backups` + Object Storage |
| `infra/oci/scripts/rollback.sh` | Revert to previous OCIR image tags |
| `infra/oci/scripts/deploy.sh` | Pull + rolling restart on single VM |

Daily cron on VM (cloud-init). Staging stack: port **8443** via `infra/docker/docker-compose.staging.yml`.

**DB guard:** backup reads WiringSchemeDB via `pg_dump` only — no schema migrations.

## Verification

After report or wiring UI changes: `npm run build` (exit 0). After backup script changes: run `npm run backup:dry-run` then one live backup.
