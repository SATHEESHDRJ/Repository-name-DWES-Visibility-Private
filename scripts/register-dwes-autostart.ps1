# register-dwes-autostart.ps1 — registers a Windows Task Scheduler task that
# launches the DWES dev-stack supervisor at logon and keeps it running.
# Run once:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-dwes-autostart.ps1
# Remove:    Unregister-ScheduledTask -TaskName 'DWES Dev Stack' -Confirm:$false

$taskName = 'DWES Dev Stack'
$supervisor = Join-Path $PSScriptRoot 'start-dwes-stack.ps1'

if (-not (Test-Path $supervisor)) {
  Write-Error "Supervisor script not found: $supervisor"
  exit 1
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# No execution time limit (default kills tasks after 72h) + battery friendly.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Keeps the DWES dev stack (gateway :5173, Vite, backend :3001) running. Managed by scripts/register-dwes-autostart.ps1.' -Force | Out-Null

Write-Host "Registered '$taskName' (runs at logon, auto-restarts)." -ForegroundColor Green
Write-Host "Start now:   Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Check log:   Get-Content dwes-stack.log -Tail 20"
Write-Host "Remove:      Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
