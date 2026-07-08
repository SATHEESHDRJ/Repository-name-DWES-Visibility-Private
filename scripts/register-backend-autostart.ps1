# ============================================================
#  Registers the "DWES Backend" scheduled task so the production
#  API (node dist/main) starts automatically at Windows logon,
#  windowless and self-restarting. Idempotent — safe to re-run.
#
#  Run once (normal PowerShell, no admin needed for a per-user
#  logon task):  powershell -ExecutionPolicy Bypass -File scripts\register-backend-autostart.ps1
# ============================================================
$ErrorActionPreference = 'Stop'

$TaskName = 'DWES Backend'
$AppDir   = (Split-Path $PSScriptRoot -Parent)
$Vbs      = Join-Path $AppDir 'scripts\start-backend-hidden.vbs'
$UserId   = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path $Vbs)) { throw "Launcher not found: $Vbs" }

# Remove any previous version first (idempotent re-register)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed existing task '$TaskName'."
}

# wscript.exe launches the hidden VBS, which starts the backend loop.
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}"' -f $Vbs)

# Fire at this user's logon (interactive session — the app is used after login).
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId

# Resilient settings: start when available (e.g. if boot was busy), keep running
# with no time limit, allow on battery.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description 'Starts the DWES NestJS backend (production, port 3001) automatically at logon — windowless, self-restarting. Managed by scripts\run-backend.bat.' | Out-Null

Write-Host "Registered scheduled task '$TaskName' (runs at logon for $UserId)."
