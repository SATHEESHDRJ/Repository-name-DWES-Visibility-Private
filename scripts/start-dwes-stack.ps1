# start-dwes-stack.ps1 — DWES dev-stack supervisor.
# Runs `npm run dev:watch` (gateway :5173 + Vite + backend :3001) and restarts
# it automatically if it ever exits, so the app is always reachable.
# Registered at logon by register-dwes-autostart.ps1; run manually with:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dwes-stack.ps1

param(
  [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

$log = Join-Path $Root 'dwes-stack.log'

function Write-StackLog([string]$msg) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $log -Value "[$ts] $msg"
  # Cap the log at ~1 MB so it never grows unbounded.
  try {
    if ((Get-Item $log -ErrorAction Stop).Length -gt 1MB) {
      $tail = Get-Content $log -Tail 200
      Set-Content -Path $log -Value $tail
    }
  } catch {}
}

# If another supervisor already has the stack up, don't double-start.
$probe = Test-NetConnection -ComputerName localhost -Port 5173 -WarningAction SilentlyContinue
if ($probe.TcpTestSucceeded) {
  Write-StackLog 'Port 5173 already serving - another instance is running. Exiting.'
  exit 0
}

Write-StackLog "Supervisor started (root: $Root)"

while ($true) {
  Write-StackLog 'Starting npm run dev:watch'
  $p = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/d', '/c', 'npm run dev:watch' `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  $p.WaitForExit()
  Write-StackLog "Stack exited (code $($p.ExitCode)) - restarting in 5s"
  Start-Sleep -Seconds 5
}
