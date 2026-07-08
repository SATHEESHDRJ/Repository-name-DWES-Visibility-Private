#Requires -Version 5.1
<#
.SYNOPSIS
  Creates a timestamped backup of the DWES project (files + optional PostgreSQL dump).

.DESCRIPTION
  Reads scripts/backup.config.json. Override paths via env:
    DWES_BACKUP_ROOT, DWES_PROJECT_ROOT, DWES_BACKUP_CONFIG

  Env schedule overrides (used by register-backup-task.ps1 only):
    DWES_BACKUP_SCHEDULE=daily|twice-daily
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = if ($env:DWES_BACKUP_CONFIG) { $env:DWES_BACKUP_CONFIG } else { Join-Path $scriptDir 'backup.config.json' }

if (-not (Test-Path -LiteralPath $configPath)) {
    Write-Error "Config not found: $configPath"
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Resolve-ConfigPath {
    param(
        [string]$Base,
        [string]$Relative
    )
    if ([string]::IsNullOrWhiteSpace($Relative)) { return $Base }
    if ([System.IO.Path]::IsPathRooted($Relative)) { return $Relative }
    return (Join-Path $Base $Relative)
}

$projectRoot = if ($env:DWES_PROJECT_ROOT) { $env:DWES_PROJECT_ROOT } else { $config.projectRoot }
$backupRoot = if ($env:DWES_BACKUP_ROOT) { $env:DWES_BACKUP_ROOT } else { $config.backupRoot }
$prefix = if ($config.backupFolderPrefix) { $config.backupFolderPrefix } else { 'DWES_backup' }

if (-not (Test-Path -LiteralPath $projectRoot)) {
    Write-Error "Project root not found: $projectRoot"
}

$startTime = Get-Date
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$backupName = "${prefix}_$timestamp"
$backupDest = Join-Path $backupRoot $backupName
$filesDest = Join-Path $backupDest 'files'
$dbDest = Join-Path $backupDest 'database'

$logDir = if ($config.logDirectory) {
    $config.logDirectory
} else {
    Join-Path $backupRoot 'logs'
}

if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

$logFile = Join-Path $logDir 'backup.log'
$runLog = [System.Collections.Generic.List[string]]::new()

function Write-BackupLog {
    param(
        [string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level = 'INFO'
    )
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    $runLog.Add($line) | Out-Null
    if ($Level -eq 'ERROR') { Write-Host $line -ForegroundColor Red }
    elseif ($Level -eq 'WARN') { Write-Host $line -ForegroundColor Yellow }
    else { Write-Host $line }
}

function Read-DotEnvFile {
    param([string]$Path)
    $vars = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $vars }

    foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $rawLine.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith('#')) { continue }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $vars[$key] = $value
    }
    return $vars
}

function Parse-PostgresConnection {
    param([hashtable]$EnvVars)

    $result = @{
        Host = $EnvVars['PGHOST']
        Port = $EnvVars['PGPORT']
        User = $EnvVars['PGUSER']
        Password = $EnvVars['PGPASSWORD']
        Database = $EnvVars['PGDATABASE']
    }

    $url = $EnvVars['DATABASE_URL']
    if ($url) {
        $pattern = '^postgres(?:ql)?://(?:(?<user>[^:@/]+)(?::(?<pass>[^@]*))?@)?(?<host>[^:/?#]+)(?::(?<port>\d+))?/(?<db>[^?#]+)'
        if ($url -match $pattern) {
            if ($Matches['user']) { $result.User = [uri]::UnescapeDataString($Matches['user']) }
            if ($Matches.ContainsKey('pass') -and $null -ne $Matches['pass']) {
                $result.Password = [uri]::UnescapeDataString($Matches['pass'])
            }
            $result.Host = $Matches['host']
            if ($Matches['port']) { $result.Port = $Matches['port'] }
            $result.Database = [uri]::UnescapeDataString($Matches['db'])
        }
    }

    if (-not $result.Host) { $result.Host = 'localhost' }
    if (-not $result.Port) { $result.Port = '5432' }
    if (-not $result.User) { $result.User = 'postgres' }
    if (-not $result.Database) { $result.Database = 'WiringSchemeDB' }

    return $result
}

function Find-PgDumpExecutable {
    param([string]$ConfiguredPath)

    $candidates = @()
    if ($env:PG_DUMP_PATH) { $candidates += $env:PG_DUMP_PATH }
    if ($ConfiguredPath) { $candidates += $ConfiguredPath }

    $pgRoot = 'C:\Program Files\PostgreSQL'
    if (Test-Path -LiteralPath $pgRoot) {
        Get-ChildItem -LiteralPath $pgRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'bin\pg_dump.exe' } |
            ForEach-Object { $candidates += $_ }
    }

    $onPath = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    return $null
}

function Invoke-RobocopyBackup {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeDirs
    )

    $args = @(
        $Source,
        $Destination,
        '/E',
        '/COPY:DAT',
        '/R:2',
        '/W:3',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NC',
        '/NS',
        '/NP'
    )

    foreach ($dir in ($ExcludeDirs | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        $args += '/XD'
        $args += $dir
    }

    Write-BackupLog "robocopy $($args -join ' ')"
    if ($DryRun) { return @{ ExitCode = 0; Skipped = $true } }

    & robocopy @args | Out-Null
    $code = $LASTEXITCODE
    return @{ ExitCode = $code; Skipped = $false }
}

function Export-DatabaseDump {
    param(
        [string]$OutputDir,
        [object]$DbConfig,
        [hashtable]$EnvVars
    )

    if (-not $DbConfig.enabled) {
        Write-BackupLog 'Database export disabled in config.' 'WARN'
        return @{ Success = $false; Skipped = $true; Reason = 'disabled' }
    }

    $pgDump = Find-PgDumpExecutable -ConfiguredPath ([string]$DbConfig.pgDumpPath)
    if (-not $pgDump) {
        $msg = 'pg_dump not found. Install PostgreSQL client tools or set database.pgDumpPath / PG_DUMP_PATH.'
        Write-BackupLog $msg 'WARN'
        return @{ Success = $false; Skipped = $true; Reason = 'pg_dump_missing' }
    }

    $conn = Parse-PostgresConnection -EnvVars $EnvVars
    $format = if ($DbConfig.format) { $DbConfig.format.ToLowerInvariant() } else { 'custom' }

    if ($format -eq 'plain' -or $format -eq 'sql') {
        $dumpFile = Join-Path $OutputDir 'WiringSchemeDB.sql'
        $dumpArgs = @('-h', $conn.Host, '-p', $conn.Port, '-U', $conn.User, '-F', 'p', '-f', $dumpFile, $conn.Database)
    } else {
        $dumpFile = Join-Path $OutputDir 'WiringSchemeDB.dump'
        $dumpArgs = @('-h', $conn.Host, '-p', $conn.Port, '-U', $conn.User, '-F', 'c', '-f', $dumpFile, $conn.Database)
    }

    $safeLog = "pg_dump -h $($conn.Host) -p $($conn.Port) -U $($conn.User) -F $(if ($format -match 'plain|sql') { 'p' } else { 'c' }) -f $dumpFile $($conn.Database)"
    Write-BackupLog $safeLog

    if ($DryRun) {
        return @{ Success = $true; Skipped = $true; DumpFile = $dumpFile; PgDump = $pgDump }
    }

    $procEnv = @{}
    foreach ($key in [System.Environment]::GetEnvironmentVariables('Process').Keys) {
        $procEnv[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
    }
    if ($conn.Password) {
        $procEnv['PGPASSWORD'] = $conn.Password
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $pgDump
    $psi.Arguments = ($dumpArgs | ForEach-Object {
        if ($_ -match '\s') { "`"$_`"" } else { $_ }
    }) -join ' '
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    foreach ($entry in $procEnv.GetEnumerator()) {
        $psi.EnvironmentVariables[$entry.Key] = [string]$entry.Value
    }

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    if ($proc.ExitCode -ne 0) {
        $detail = if ($stderr.Trim()) { $stderr.Trim() } else { $stdout.Trim() }
        if ($detail.Length -gt 400) { $detail = $detail.Substring(0, 400) + '...' }
        Write-BackupLog "pg_dump failed (exit $($proc.ExitCode)): $detail" 'ERROR'
        return @{ Success = $false; Skipped = $false; Reason = 'pg_dump_failed'; Error = $detail; PgDump = $pgDump }
    }

    if (-not (Test-Path -LiteralPath $dumpFile)) {
        Write-BackupLog "pg_dump reported success but dump file missing: $dumpFile" 'ERROR'
        return @{ Success = $false; Skipped = $false; Reason = 'dump_missing'; PgDump = $pgDump }
    }

    $sizeMb = [math]::Round(((Get-Item -LiteralPath $dumpFile).Length / 1MB), 2)
    Write-BackupLog "Database dump created ($sizeMb MB): $dumpFile"
    return @{ Success = $true; Skipped = $false; DumpFile = $dumpFile; PgDump = $pgDump; SizeMb = $sizeMb }
}

function Invoke-RetentionPolicy {
    param(
        [string]$Root,
        [string]$FolderPrefix,
        [object]$Retention
    )

    if (-not $Retention) { return @{ Removed = 0 } }
    $maxCount = $Retention.maxCount
    $maxAgeDays = $Retention.maxAgeDays
    if (-not $maxCount -and -not $maxAgeDays) { return @{ Removed = 0 } }

    $folders = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "${FolderPrefix}_*" } |
        Sort-Object LastWriteTime -Descending

    $removed = 0
    $index = 0
    foreach ($folder in $folders) {
        $index++
        $remove = $false
        $reason = ''

        if ($maxCount -and $index -gt [int]$maxCount) {
            $remove = $true
            $reason = "count > $maxCount"
        }
        if ($maxAgeDays) {
            $age = (Get-Date) - $folder.LastWriteTime
            if ($age.TotalDays -gt [double]$maxAgeDays) {
                $remove = $true
                $reason = "age > $maxAgeDays days"
            }
        }

        if ($remove) {
            Write-BackupLog "Retention removing $($folder.FullName) ($reason)"
            if (-not $DryRun) {
                Remove-Item -LiteralPath $folder.FullName -Recurse -Force
            }
            $removed++
        }
    }

    return @{ Removed = $removed }
}

$overallSuccess = $true
$dbResult = $null
$robocopyCode = $null

Write-BackupLog "Starting backup (dryRun=$DryRun)"
Write-BackupLog "Project: $projectRoot"
Write-BackupLog "Destination: $backupDest"

try {
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        New-Item -ItemType Directory -Force -Path $backupDest | Out-Null
        New-Item -ItemType Directory -Force -Path $filesDest | Out-Null
        New-Item -ItemType Directory -Force -Path $dbDest | Out-Null
    }

    $excludeDirs = @()
    if ($config.excludeDirectories) {
        $excludeDirs = @($config.excludeDirectories | ForEach-Object { [string]$_ })
    }
    Write-BackupLog ("Excluding directories: " + ($(if ($excludeDirs.Count) { $excludeDirs -join ', ' } else { '(none)' })))

    $robocopy = Invoke-RobocopyBackup -Source $projectRoot -Destination $filesDest -ExcludeDirs $excludeDirs
    $robocopyCode = $robocopy.ExitCode
    if (-not $robocopy.Skipped -and ($robocopyCode -gt 7)) {
        throw "robocopy failed with exit code $robocopyCode"
    }
    if ($robocopy.Skipped) {
        Write-BackupLog 'Skipped file copy (dry run).'
    } else {
        Write-BackupLog "File copy finished (robocopy exit $robocopyCode)."
    }

    $envFile = Resolve-ConfigPath -Base $projectRoot -Relative ([string]$config.database.envFile)
    $envVars = Read-DotEnvFile -Path $envFile
    Write-BackupLog "Loaded env file: $envFile ($(if ($envVars.ContainsKey('DATABASE_URL')) { 'DATABASE_URL present' } else { 'DATABASE_URL absent' }))"

    $dbResult = Export-DatabaseDump -OutputDir $dbDest -DbConfig $config.database -EnvVars $envVars
    if ($dbResult.Success -eq $false -and -not $dbResult.Skipped) {
        $failOnDb = $false
        if ($null -ne $config.database.failOnDbError) {
            $failOnDb = [bool]$config.database.failOnDbError
        }
        if ($failOnDb) {
            $reason = if ($dbResult.ContainsKey('Reason')) { $dbResult.Reason } else { 'unknown' }
            throw "Database export failed: $reason"
        }
        Write-BackupLog 'Database export failed; file backup kept (failOnDbError=false).' 'WARN'
        $overallSuccess = $false
    }

    $retentionResult = Invoke-RetentionPolicy -Root $backupRoot -FolderPrefix $prefix -Retention $config.retention
    if ($retentionResult.Removed -gt 0) {
        Write-BackupLog "Retention removed $($retentionResult.Removed) old backup folder(s)."
    }

    $durationSec = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    $manifest = [ordered]@{
        backupName = $backupName
        createdAt = (Get-Date).ToString('o')
        durationSeconds = $durationSec
        dryRun = [bool]$DryRun
        projectRoot = $projectRoot
        backupDestination = $backupDest
        excludedDirectories = $excludeDirs
        robocopyExitCode = $robocopyCode
        database = @{
            enabled = [bool]$config.database.enabled
            success = if ($null -ne $dbResult -and $null -ne $dbResult.Success) { [bool]$dbResult.Success } else { $false }
            skipped = if ($null -ne $dbResult -and $null -ne $dbResult.Skipped) { [bool]$dbResult.Skipped } else { $true }
            dumpFile = if ($null -ne $dbResult -and $dbResult.ContainsKey('DumpFile')) { $dbResult.DumpFile } else { $null }
            pgDump = if ($null -ne $dbResult -and $dbResult.ContainsKey('PgDump')) { $dbResult.PgDump } else { $null }
            reason = if ($null -ne $dbResult -and $dbResult.ContainsKey('Reason')) { $dbResult.Reason } else { $null }
        }
        success = $overallSuccess
    }

    if (-not $DryRun) {
        $manifestPath = Join-Path $backupDest 'manifest.json'
        $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    }

    foreach ($line in $runLog) {
        if (-not $DryRun) {
            Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
        }
    }

    if ($overallSuccess) {
        Write-BackupLog "Backup completed in ${durationSec}s -> $backupDest"
        exit 0
    }

    Write-BackupLog "Backup completed with warnings in ${durationSec}s -> $backupDest" 'WARN'
    exit 2
}
catch {
    $durationSec = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    Write-BackupLog "Backup FAILED after ${durationSec}s: $($_.Exception.Message)" 'ERROR'
    foreach ($line in $runLog) {
        if (-not $DryRun) {
            Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
        }
    }
    if (-not $DryRun) {
        Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ERROR] Backup FAILED after ${durationSec}s: $($_.Exception.Message)" -Encoding UTF8
    }
    exit 1
}
