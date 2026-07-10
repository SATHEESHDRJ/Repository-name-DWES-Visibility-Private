# start-dwes.ps1 — Dev (HMR) or Prod silent launcher.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dwes.ps1 -Mode Dev
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dwes.ps1 -Mode Prod
# Prefer the VBS wrappers (no console flash). This script is for Task Scheduler / CLI.

param(
  [ValidateSet('Dev', 'Prod')]
  [string]$Mode = 'Dev',
  [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'
$modeArg = if ($Mode -eq 'Prod') { '--mode=prod' } else { '--mode=dev' }
$launcher = Join-Path $Root 'scripts\launch-dwes.mjs'

if (-not (Test-Path $launcher)) {
  Write-Error "Launcher not found: $launcher"
  exit 1
}

$node = $null
foreach ($c in @(
  (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
)) {
  if ($c -and (Test-Path $c)) { $node = $c; break }
}
if (-not $node) {
  $where = Get-Command node -ErrorAction SilentlyContinue
  if ($where) { $node = $where.Source }
}
if (-not $node) {
  Write-Error 'node.exe not found'
  exit 1
}

# Hidden window — logs go to logs/ via launch-dwes.mjs
Start-Process -FilePath $node `
  -ArgumentList @($launcher, $modeArg) `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -Wait
exit $LASTEXITCODE
