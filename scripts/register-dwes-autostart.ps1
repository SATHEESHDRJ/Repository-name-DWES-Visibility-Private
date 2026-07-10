# register-dwes-autostart.ps1 — logon Task Scheduler entry for DWES.
# Registers a fully automatic boot: 60s after user logon → silent launcher →
# PostgreSQL wait → Nest backend → Vite frontend → browser.
#
#   npm run autostart:register          # Dev (Vite HMR :5175)
#   npm run autostart:register:prod     # Production preview stack
# Remove: Unregister-ScheduledTask -TaskName 'DWES App' -Confirm:$false
param(
  [ValidateSet('Dev', 'Prod')]
  [string]$Mode = 'Dev'
)

$ErrorActionPreference = 'Stop'

$taskName = 'DWES App'
$vbs = Join-Path $PSScriptRoot 'start-dwes-silent.vbs'
$modeArg = if ($Mode -eq 'Prod') { 'prod' } else { 'dev' }
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path $vbs)) {
  Write-Error "Silent launcher not found: $vbs"
  exit 1
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed existing task '$taskName'."
}

# Also remove legacy supervisor task name if present (old start-dwes-stack.ps1).
$legacy = Get-ScheduledTask -TaskName 'DWES Dev Stack' -ErrorAction SilentlyContinue
if ($legacy) {
  Unregister-ScheduledTask -TaskName 'DWES Dev Stack' -Confirm:$false
  Write-Host "Removed legacy task 'DWES Dev Stack'."
}

$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument ('"{0}" {1}' -f $vbs, $modeArg)

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
# Cold boot: let PostgreSQL + OneDrive finish before Nest/Vite start (avoids backend-only failure).
$trigger.Delay = 'PT60S'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances Queue

$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

$desc = if ($Mode -eq 'Prod') {
  'DWES production stack at logon (60s delay): PostgreSQL wait, Nest backend, Vite preview, browser. Logs: logs/launcher.log'
} else {
  'DWES dev stack at logon (60s delay): PostgreSQL wait, Nest backend, Vite HMR :5175, browser. Logs: logs/launcher.log'
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Description $desc -Force | Out-Null

Write-Host "Registered '$taskName' (Mode=$Mode, 60s after logon for $UserId)." -ForegroundColor Green
Write-Host "Troubleshoot: npm run startup:logs"
Write-Host "Start now:    Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Remove:      Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
