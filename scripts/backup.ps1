#Requires -Version 5.1
<#
.SYNOPSIS
  Creates a timestamped backup of the DWES project (files + optional PostgreSQL dump).

.DESCRIPTION
  Reads scripts/backup.config.json. Override paths via env:
    DWES_BACKUP_ROOT, DWES_PROJECT_ROOT, DWES_BACKUP_CONFIG, DWES_BACKUP_TRIGGER

  Env schedule overrides (used by register-backup-task.ps1 only):
    DWES_BACKUP_SCHEDULE=daily|twice-daily
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$PreOperation,
    [switch]$VerifyOnly,
    # Explicit overrides (preferred over hardcoded OneDrive paths).
    [string]$ProjectRoot = '',
    [string]$BackupRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDefaultRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
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

function Assert-SafeBackupDestination {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "Backup destination is empty. Set -BackupRoot or DWES_BACKUP_ROOT."
    }
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($full)
    if ($full.TrimEnd('\','/') -eq $root.TrimEnd('\','/')) {
        throw "Refusing backup destination at drive root: $full"
    }
    $unsafe = @('C:\', 'C:\Windows', 'C:\Program Files', 'C:\Program Files (x86)', 'C:\Users')
    foreach ($u in $unsafe) {
        if ($full.TrimEnd('\','/').Equals($u.TrimEnd('\','/'), [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing unsafe backup destination: $full"
        }
    }
    return $full
}

function Assert-BackupDestOutsideProject {
    param(
        [string]$ProjectRoot,
        [string]$BackupRoot
    )
    $proj = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\','/')
    $dest = [System.IO.Path]::GetFullPath($BackupRoot).TrimEnd('\','/')
    if ($dest.Equals($proj, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing backup destination equal to project root: $dest"
    }
    if ($dest.StartsWith($proj + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        $dest.StartsWith($proj + [System.IO.Path]::AltDirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing backup destination inside project tree (causes recursive copy): $dest"
    }
}

# Resolution order: -ProjectRoot param > DWES_PROJECT_ROOT > config (relative to scripts/) > repo parent of scripts/
$projectRootRaw = if ($ProjectRoot) { $ProjectRoot }
    elseif ($env:DWES_PROJECT_ROOT) { $env:DWES_PROJECT_ROOT }
    elseif ($config.projectRoot) { $config.projectRoot }
    else { $repoDefaultRoot }

if (-not [System.IO.Path]::IsPathRooted($projectRootRaw)) {
    $projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir $projectRootRaw))
} else {
    $projectRoot = [System.IO.Path]::GetFullPath($projectRootRaw)
}

$backupRootRaw = if ($BackupRoot) { $BackupRoot }
    elseif ($env:DWES_BACKUP_ROOT) { $env:DWES_BACKUP_ROOT }
    elseif ($config.backupRoot) { $config.backupRoot }
    else { Join-Path $projectRoot 'Backup' }

if (-not [System.IO.Path]::IsPathRooted($backupRootRaw)) {
    # Relative backupRoot resolves against projectRoot (not scripts/), unless it starts with .. from scripts via config historically
    if ($backupRootRaw.StartsWith('..') -or $backupRootRaw.StartsWith('.\')) {
        $backupRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir $backupRootRaw))
    } else {
        $backupRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $backupRootRaw))
    }
} else {
    $backupRoot = [System.IO.Path]::GetFullPath($backupRootRaw)
}

$backupRoot = Assert-SafeBackupDestination -Path $backupRoot
Assert-BackupDestOutsideProject -ProjectRoot $projectRoot -BackupRoot $backupRoot

$prefix = if ($null -ne $config.PSObject.Properties['backupFolderPrefix'] -and $config.backupFolderPrefix) {
    [string]$config.backupFolderPrefix
} else {
    $null
}

if (-not (Test-Path -LiteralPath $projectRoot)) {
    Write-Error "Project root not found: $projectRoot"
}

Write-Host "DWES backup projectRoot=$projectRoot"
Write-Host "DWES backup backupRoot=$backupRoot"

if ($VerifyOnly) {
    $verifyScript = Join-Path $scriptDir 'verify-backup.ps1'
    if (-not (Test-Path -LiteralPath $verifyScript)) {
        Write-Error "verify-backup.ps1 not found: $verifyScript"
    }
    & $verifyScript -ConfigPath $configPath
    exit $LASTEXITCODE
}

$startTime = Get-Date
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$backupName = if ($prefix) { "${prefix}_$timestamp" } else { $timestamp }
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
$reportErrors = [System.Collections.Generic.List[string]]::new()

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

function Get-DriveFreeGb {
    param([string]$Path)
    $resolved = $Path
    if (-not (Test-Path -LiteralPath $resolved)) {
        $resolved = Split-Path -Parent $resolved
        if (-not $resolved) { $resolved = $Path }
    }
    try {
        $vol = Get-Volume -FilePath $resolved -ErrorAction Stop
        return [math]::Round($vol.SizeRemaining / 1GB, 2)
    } catch {
        $root = [System.IO.Path]::GetPathRoot($resolved)
        $driveName = $root.TrimEnd('\').TrimEnd(':')
        $psDrive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
        if ($psDrive) {
            return [math]::Round($psDrive.Free / 1GB, 2)
        }
        return 0
    }
}

function Test-PathExcluded {
    param(
        [string]$FullPath,
        [string]$Root,
        [string[]]$ExcludeDirs
    )
    $relative = $FullPath.Substring($Root.Length).TrimStart('\', '/')
    foreach ($ex in $ExcludeDirs) {
        $norm = $ex -replace '/', '\'
        if ($relative -eq $norm -or $relative.StartsWith("$norm\")) {
            return $true
        }
    }
    return $false
}

function Get-EstimatedBackupSizeBytes {
    param(
        [string]$Root,
        [string[]]$ExcludeDirs
    )
    $total = [int64]0
    $queue = [System.Collections.Generic.Queue[string]]::new()
    $queue.Enqueue($Root)

    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $children = Get-ChildItem -LiteralPath $current -Force -ErrorAction SilentlyContinue
        foreach ($child in $children) {
            if (Test-PathExcluded -FullPath $child.FullName -Root $Root -ExcludeDirs $ExcludeDirs) {
                continue
            }
            if ($child.PSIsContainer) {
                $queue.Enqueue($child.FullName)
            } else {
                $total += $child.Length
            }
        }
    }
    return $total
}

function Test-DiskSpaceForBackup {
    param(
        [string]$BackupRootPath,
        [string]$ProjectRootPath,
        [string[]]$ExcludeDirs,
        [object]$DiskConfig
    )

    $minFreeGb = 5.0
    $reserveMultiplier = 1.15
    if ($DiskConfig) {
        if ($null -ne $DiskConfig.minFreeGb) { $minFreeGb = [double]$DiskConfig.minFreeGb }
        if ($null -ne $DiskConfig.reserveMultiplier) { $reserveMultiplier = [double]$DiskConfig.reserveMultiplier }
    }

    $freeGb = Get-DriveFreeGb -Path $BackupRootPath
    Write-BackupLog "Disk free space before backup: ${freeGb} GB"

    $estimateBytes = Get-EstimatedBackupSizeBytes -Root $ProjectRootPath -ExcludeDirs $ExcludeDirs
    $estimateGb = $estimateBytes / 1GB
    $requiredGb = [math]::Max($minFreeGb, $estimateGb * $reserveMultiplier)
    $requiredGb = [math]::Round($requiredGb, 2)

    Write-BackupLog "Estimated backup size: $([math]::Round($estimateGb, 2)) GB (required free: ${requiredGb} GB incl. reserve)"

    if ($freeGb -lt $requiredGb) {
        throw "Insufficient disk space: ${freeGb} GB free on backup drive, need at least ${requiredGb} GB (minFreeGb=$minFreeGb, estimate=$([math]::Round($estimateGb, 2)) GB)"
    }

    return @{
        freeGbBefore = $freeGb
        estimatedGb = [math]::Round($estimateGb, 2)
        requiredGb = $requiredGb
        minFreeGb = $minFreeGb
        reserveMultiplier = $reserveMultiplier
    }
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

function Invoke-BackupVerification {
    param(
        [string]$FilesDestination,
        [object]$VerificationConfig
    )

    $requiredPaths = @()
    $optionalPaths = @()
    if ($VerificationConfig) {
        if ($VerificationConfig.requiredPaths) {
            $requiredPaths = @($VerificationConfig.requiredPaths | ForEach-Object { [string]$_ })
        }
        if ($VerificationConfig.optionalPaths) {
            $optionalPaths = @($VerificationConfig.optionalPaths | ForEach-Object { [string]$_ })
        }
    }

    $errors = [System.Collections.Generic.List[string]]::new()
    $checks = [System.Collections.Generic.List[object]]::new()

    foreach ($rel in $requiredPaths) {
        $full = Join-Path $FilesDestination $rel
        $exists = Test-Path -LiteralPath $full
        $checks.Add([ordered]@{ path = $rel; required = $true; exists = $exists }) | Out-Null
        if (-not $exists) {
            $errors.Add("Missing required path: $rel") | Out-Null
        }
    }

    foreach ($rel in $optionalPaths) {
        $full = Join-Path $FilesDestination $rel
        $exists = Test-Path -LiteralPath $full
        $itemCount = $null
        if ($exists -and (Test-Path -LiteralPath $full -PathType Container)) {
            $itemCount = (Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue).Count
        }
        $checks.Add([ordered]@{
            path = $rel
            required = $false
            exists = $exists
            fileCount = $itemCount
        }) | Out-Null
    }

    $allFiles = Get-ChildItem -LiteralPath $FilesDestination -Recurse -File -ErrorAction SilentlyContinue
    $fileCount = $allFiles.Count
    $totalBytes = if ($fileCount -gt 0) { ($allFiles | Measure-Object -Property Length -Sum).Sum } else { 0 }

    $passed = ($errors.Count -eq 0)
    if (-not $passed) {
        foreach ($err in $errors) {
            Write-BackupLog "Verification: $err" 'ERROR'
        }
    } else {
        Write-BackupLog "Verification passed ($fileCount files, $([math]::Round($totalBytes / 1MB, 2)) MB in files/)"
    }

    return @{
        passed = $passed
        errors = @($errors)
        checks = @($checks)
        fileCount = $fileCount
        totalSizeBytes = $totalBytes
        totalSizeMb = [math]::Round($totalBytes / 1MB, 2)
    }
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
        Where-Object {
            $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$' -or
            ($FolderPrefix -and $_.Name -like "${FolderPrefix}_*")
        } |
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
                $reason = if ($reason) { "$reason; age > $maxAgeDays days" } else { "age > $maxAgeDays days" }
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
$diskSpace = $null
$verification = $null
$trigger = if ($env:DWES_BACKUP_TRIGGER) { $env:DWES_BACKUP_TRIGGER } elseif ($PreOperation) { 'pre-operation' } else { 'manual' }

Write-BackupLog "Starting backup (dryRun=$DryRun, trigger=$trigger)"
Write-BackupLog "Project: $projectRoot"
Write-BackupLog "Destination: $backupDest"

try {
    $excludeDirs = @()
    if ($config.excludeDirectories) {
        $excludeDirs = @($config.excludeDirectories | ForEach-Object { [string]$_ })
    }
    if ($excludeDirs -notcontains 'Backup') {
        $excludeDirs += 'Backup'
    }
    Write-BackupLog ("Excluding directories: " + ($(if ($excludeDirs.Count) { $excludeDirs -join ', ' } else { '(none)' })))

    $diskSpace = Test-DiskSpaceForBackup -BackupRootPath $backupRoot -ProjectRootPath $projectRoot -ExcludeDirs $excludeDirs -DiskConfig $config.diskSpace

    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        New-Item -ItemType Directory -Force -Path $backupDest | Out-Null
        New-Item -ItemType Directory -Force -Path $filesDest | Out-Null
        New-Item -ItemType Directory -Force -Path $dbDest | Out-Null
    }

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
        $reportErrors.Add('database_export_failed') | Out-Null
    }

    if (-not $DryRun) {
        $verification = Invoke-BackupVerification -FilesDestination $filesDest -VerificationConfig $config.verification
        if (-not $verification.passed) {
            $overallSuccess = $false
            foreach ($verr in $verification.errors) {
                $reportErrors.Add($verr) | Out-Null
            }
        }
    } else {
        $verification = @{
            passed = $true
            skipped = $true
            errors = @()
            checks = @()
            fileCount = $null
            totalSizeMb = $null
        }
        Write-BackupLog 'Skipped post-backup verification (dry run).'
    }

    $retentionResult = Invoke-RetentionPolicy -Root $backupRoot -FolderPrefix $prefix -Retention $config.retention
    if ($retentionResult.Removed -gt 0) {
        Write-BackupLog "Retention removed $($retentionResult.Removed) old backup folder(s)."
    }

    $freeGbAfter = Get-DriveFreeGb -Path $backupRoot
    if ($diskSpace) {
        $diskSpace['freeGbAfter'] = $freeGbAfter
    }

    $durationSec = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    $report = [ordered]@{
        backupName = $backupName
        createdAt = (Get-Date).ToString('o')
        durationSeconds = $durationSec
        dryRun = [bool]$DryRun
        trigger = $trigger
        projectRoot = $projectRoot
        backupDestination = $backupDest
        diskSpace = $diskSpace
        files = @{
            excludedDirectories = $excludeDirs
            fileCount = if ($verification) { $verification.fileCount } else { $null }
            totalSizeMb = if ($verification) { $verification.totalSizeMb } else { $null }
            robocopyExitCode = $robocopyCode
        }
        verification = @{
            passed = if ($verification) { [bool]$verification.passed } else { $false }
            skipped = if ($verification -and $verification.ContainsKey('skipped')) { [bool]$verification.skipped } else { $false }
            errors = if ($verification) { @($verification.errors) } else { @() }
            checks = if ($verification) { @($verification.checks) } else { @() }
        }
        database = @{
            enabled = [bool]$config.database.enabled
            success = if ($null -ne $dbResult -and $null -ne $dbResult.Success) { [bool]$dbResult.Success } else { $false }
            skipped = if ($null -ne $dbResult -and $null -ne $dbResult.Skipped) { [bool]$dbResult.Skipped } else { $true }
            dumpFile = if ($null -ne $dbResult -and $dbResult.ContainsKey('DumpFile')) { $dbResult.DumpFile } else { $null }
            pgDump = if ($null -ne $dbResult -and $dbResult.ContainsKey('PgDump')) { $dbResult.PgDump } else { $null }
            reason = if ($null -ne $dbResult -and $dbResult.ContainsKey('Reason')) { $dbResult.Reason } else { $null }
            sizeMb = if ($null -ne $dbResult -and $dbResult.ContainsKey('SizeMb')) { $dbResult.SizeMb } else { $null }
        }
        retention = @{
            removed = $retentionResult.Removed
            maxCount = if ($config.retention) { $config.retention.maxCount } else { $null }
            maxAgeDays = if ($config.retention) { $config.retention.maxAgeDays } else { $null }
        }
        errors = @($reportErrors)
        success = $overallSuccess
    }

    if (-not $DryRun) {
        $reportPath = Join-Path $backupDest 'backup-report.json'
        $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
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
    $reportErrors.Add($_.Exception.Message) | Out-Null

    $failReport = [ordered]@{
        backupName = $backupName
        createdAt = (Get-Date).ToString('o')
        durationSeconds = $durationSec
        dryRun = [bool]$DryRun
        trigger = $trigger
        projectRoot = $projectRoot
        backupDestination = $backupDest
        diskSpace = $diskSpace
        errors = @($reportErrors)
        success = $false
    }

    foreach ($line in $runLog) {
        if (-not $DryRun) {
            Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
        }
    }
    if (-not $DryRun -and (Test-Path -LiteralPath $backupDest)) {
        $failReportPath = Join-Path $backupDest 'backup-report.json'
        $failReport | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $failReportPath -Encoding UTF8
        Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ERROR] Backup FAILED after ${durationSec}s: $($_.Exception.Message)" -Encoding UTF8
    }
    exit 1
}
