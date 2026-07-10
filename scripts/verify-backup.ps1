#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies integrity and folder structure of a DWES backup (or the latest one).

.PARAMETER BackupPath
  Full path to a backup folder (e.g. Backup\2026-07-09_02-00). Defaults to newest under backupRoot.

.PARAMETER ConfigPath
  Alternate backup.config.json path.
#>
[CmdletBinding()]
param(
    [string]$BackupPath,
    [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configFile = if ($ConfigPath) { $ConfigPath } elseif ($env:DWES_BACKUP_CONFIG) { $env:DWES_BACKUP_CONFIG } else { Join-Path $scriptDir 'backup.config.json' }

if (-not (Test-Path -LiteralPath $configFile)) {
    Write-Error "Config not found: $configFile"
}

$config = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
$backupRoot = if ($env:DWES_BACKUP_ROOT) { $env:DWES_BACKUP_ROOT } else { $config.backupRoot }

function Get-LatestBackupFolder {
    param([string]$Root)
    if (-not (Test-Path -LiteralPath $Root)) {
        return $null
    }
    return Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$' -or $_.Name -like 'DWES_backup_*' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $BackupPath) {
    $latest = Get-LatestBackupFolder -Root $backupRoot
    if (-not $latest) {
        Write-Error "No backup folders found under: $backupRoot"
    }
    $BackupPath = $latest.FullName
}

if (-not (Test-Path -LiteralPath $BackupPath)) {
    Write-Error "Backup path not found: $BackupPath"
}

$filesDest = Join-Path $BackupPath 'files'
if (-not (Test-Path -LiteralPath $filesDest)) {
    Write-Error "Backup files subtree missing: $filesDest"
}

$requiredPaths = @()
if ($config.verification.requiredPaths) {
    $requiredPaths = @($config.verification.requiredPaths | ForEach-Object { [string]$_ })
}
$optionalPaths = @()
if ($config.verification.optionalPaths) {
    $optionalPaths = @($config.verification.optionalPaths | ForEach-Object { [string]$_ })
}

$errors = [System.Collections.Generic.List[string]]::new()
$checks = [System.Collections.Generic.List[object]]::new()

foreach ($rel in $requiredPaths) {
    $full = Join-Path $filesDest $rel
    $exists = Test-Path -LiteralPath $full
    $checks.Add([ordered]@{ path = $rel; required = $true; exists = $exists }) | Out-Null
    if (-not $exists) {
        $errors.Add("Missing required path: $rel") | Out-Null
    }
}

foreach ($rel in $optionalPaths) {
    $full = Join-Path $filesDest $rel
    $exists = Test-Path -LiteralPath $full
    $checks.Add([ordered]@{ path = $rel; required = $false; exists = $exists }) | Out-Null
}

$reportPath = Join-Path $BackupPath 'backup-report.json'
$hasReport = Test-Path -LiteralPath $reportPath
if (-not $hasReport) {
    $legacyManifest = Join-Path $BackupPath 'manifest.json'
    if (Test-Path -LiteralPath $legacyManifest) {
        $reportPath = $legacyManifest
        $hasReport = $true
    } else {
        $errors.Add('Missing backup-report.json') | Out-Null
    }
}

$dbDir = Join-Path $BackupPath 'database'
$dbDumpCustom = Join-Path $dbDir 'WiringSchemeDB.dump'
$dbDumpSql = Join-Path $dbDir 'WiringSchemeDB.sql'
$hasDbDump = (Test-Path -LiteralPath $dbDumpCustom) -or (Test-Path -LiteralPath $dbDumpSql)

$allFiles = Get-ChildItem -LiteralPath $BackupPath -Recurse -File -ErrorAction SilentlyContinue
$fileCount = $allFiles.Count
$totalBytes = if ($fileCount -gt 0) { ($allFiles | Measure-Object -Property Length -Sum).Sum } else { 0 }

$passed = ($errors.Count -eq 0)
$result = [ordered]@{
    backupPath = $BackupPath
    verifiedAt = (Get-Date).ToString('o')
    passed = $passed
    errors = @($errors)
    checks = @($checks)
    hasBackupReport = $hasReport
    hasDatabaseDump = $hasDbDump
    fileCount = $fileCount
    totalSizeMb = [math]::Round($totalBytes / 1MB, 2)
}

Write-Host "Backup: $BackupPath"
Write-Host "Files: $fileCount ($($result.totalSizeMb) MB)"
Write-Host "Required path checks: $(@($checks | Where-Object { $_.required }).Count)"
Write-Host "backup-report.json: $(if ($hasReport) { 'present' } else { 'MISSING' })"
Write-Host "Database dump: $(if ($hasDbDump) { 'present' } else { 'absent' })"

if ($passed) {
    Write-Host 'Verification PASSED' -ForegroundColor Green
    $result | ConvertTo-Json -Depth 6
    exit 0
}

Write-Host 'Verification FAILED' -ForegroundColor Red
foreach ($err in $errors) {
    Write-Host "  - $err" -ForegroundColor Red
}
$result | ConvertTo-Json -Depth 6
exit 1
