#Requires -Version 5.1
<#
.SYNOPSIS
  Registers or removes the Windows Scheduled Task for DWES backups.

.PARAMETER Unregister
  Remove the scheduled task instead of creating it.

.PARAMETER RunWhenLoggedOff
  Run whether the user is logged on or not. Requires -Password (admin may be required).

.PARAMETER User
  Account for the scheduled task. Defaults to current user.

.PARAMETER Password
  Password for -RunWhenLoggedOff. Never store in config files.

.EXAMPLE
  .\register-backup-task.ps1

.EXAMPLE
  .\register-backup-task.ps1 -RunWhenLoggedOff -User "MYPC\sathe" -Password (Read-Host -AsSecureString)
#>
[CmdletBinding()]
param(
    [switch]$Unregister,
    [switch]$RunWhenLoggedOff,
    [string]$User,
    [securestring]$Password
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = if ($env:DWES_BACKUP_CONFIG) { $env:DWES_BACKUP_CONFIG } else { Join-Path $scriptDir 'backup.config.json' }
$backupScript = Join-Path $scriptDir 'backup.ps1'

if (-not (Test-Path -LiteralPath $configPath)) {
    Write-Error "Config not found: $configPath"
}
if (-not (Test-Path -LiteralPath $backupScript)) {
    Write-Error "Backup script not found: $backupScript"
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$taskName = if ($config.scheduledTaskName) { [string]$config.scheduledTaskName } else { 'DWES Project Backup' }

$scheduleMode = if ($env:DWES_BACKUP_SCHEDULE) { $env:DWES_BACKUP_SCHEDULE.ToLowerInvariant() } else { [string]$config.schedule.mode }
if ($scheduleMode -notin @('daily', 'twice-daily')) {
    Write-Error "Invalid schedule mode '$scheduleMode'. Use 'daily' or 'twice-daily'."
}

function ConvertTo-ScheduledTaskTime {
    param([string]$TimeText)
    if ($TimeText -match '^\d{1,2}:\d{2}$') {
        return (Get-Date -Format 'yyyy-MM-dd') + " $($TimeText):00"
    }
    return $TimeText
}

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task: $taskName"
    exit 0
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Replaced existing task: $taskName"
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`"" `
    -WorkingDirectory $scriptDir

$triggers = @()
if ($scheduleMode -eq 'twice-daily') {
    $times = @($config.schedule.twiceDailyTimes | ForEach-Object { [string]$_ })
    if ($times.Count -lt 2) {
        Write-Error 'twice-daily mode requires at least two entries in schedule.twiceDailyTimes'
    }
    foreach ($timeText in $times) {
        $at = ConvertTo-ScheduledTaskTime -TimeText $timeText
        $triggers += New-ScheduledTaskTrigger -Daily -At $at
        Write-Host "Trigger: daily at $timeText"
    }
} else {
    $dailyTime = [string]$config.schedule.dailyTime
    if (-not $dailyTime) { $dailyTime = '02:00' }
    $at = ConvertTo-ScheduledTaskTime -TimeText $dailyTime
    $triggers += New-ScheduledTaskTrigger -Daily -At $at
    Write-Host "Trigger: daily at $dailyTime"
}

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

$description = "Automated DWES project backup ($scheduleMode) to Backup/ folder. Config: $configPath"

if ($RunWhenLoggedOff) {
    if (-not $User) {
        $User = "$env:USERDOMAIN\$env:USERNAME"
    }
    if (-not $Password) {
        Write-Error '-RunWhenLoggedOff requires -Password. Example: -Password (Read-Host -AsSecureString -Prompt "Task password")'
    }

    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    )
    try {
        Register-ScheduledTask `
            -TaskName $taskName `
            -Action $action `
            -Trigger $triggers `
            -Settings $settings `
            -Description $description `
            -User $User `
            -Password $plainPassword `
            -RunLevel Highest | Out-Null
    } finally {
        $plainPassword = $null
    }

    Write-Host "Registered task '$taskName' for user $User (runs when logged off)."
    Write-Host 'Note: storing credentials for scheduled tasks may require Administrator privileges.'
} else {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $triggers `
        -Settings $settings `
        -Description $description | Out-Null

    Write-Host "Registered task '$taskName' for current user (runs at logon session)."
    Write-Host 'For run-when-logged-off, re-run with -RunWhenLoggedOff -User DOMAIN\user -Password (Read-Host -AsSecureString).'
}

Write-Host ''
Write-Host "Manual test: npm run backup"
Write-Host "Verify latest: npm run backup:verify"
Write-Host "Config file: $configPath"
Write-Host "Backup root: $($config.backupRoot)"
Write-Host "Schedule mode: $scheduleMode (set schedule.mode or env DWES_BACKUP_SCHEDULE, then re-register)"
