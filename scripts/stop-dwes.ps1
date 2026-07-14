# Stop DWES dev servers — only DWES backend/frontend processes under this repo.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$rootNorm = $root.TrimEnd('\')
$pattern = [regex]::Escape($rootNorm)
$workspacePattern = '(?i)(^|[^A-Z0-9_.-])' + $pattern + '(?=$|[\\\s"''])'
$dwesNodeEntrypointPattern = '(?i)(?:\\node_modules\\vite\\bin\\vite\.js|\\backend\\node_modules\\@nestjs\\cli\\bin\\nest\.js|\\backend\\dist(?:\\src)?\\main(?:\.js)?|\\scripts\\(?:launch-dwes|launch-hidden)\.mjs)(?=$|[\s"])'

Stop-ScheduledTask -TaskName 'DWES App' -ErrorAction SilentlyContinue

function Test-DwesWorkspaceCommand {
  param([string]$CommandLine)

  if (-not $CommandLine) { return $false }
  $normalized = $CommandLine.Replace('/', '\')
  return $normalized -match $workspacePattern
}

function Get-DwesNodeProcesses {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $cmd = $_.CommandLine
    if (-not (Test-DwesWorkspaceCommand $cmd)) { return $false }
    return $cmd.Replace('/', '\') -match $dwesNodeEntrypointPattern
  }
}

# Stop command wrappers first so they cannot keep or recreate a server child.
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not (Test-DwesWorkspaceCommand $cmd)) { return }
  if ($cmd -notmatch '(?i)\bnpm(?:\.cmd)?\b.*\brun\s+(?:dev|backend|dev:all|start:dev|preview(?::lan)?|launch:(?:dev|prod))\b') { return }
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

$killed = [System.Collections.Generic.HashSet[int]]::new()

# Nest watch can briefly leave or recreate backend\dist\main while its watcher
# exits. Re-query a few times so both the controller and listener are stopped.
for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
  $targets = @(Get-DwesNodeProcesses)
  if ($targets.Count -eq 0) { break }

  $targets | ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      $null = $killed.Add([int]$_.ProcessId)
    } catch {
      # It may already have exited after the process snapshot.
    }
  }

  if ($attempt -lt 2) { Start-Sleep -Milliseconds 300 }
}

if ($killed.Count) {
  Write-Host "[DWES] Stopped $($killed.Count) DWES process(es)."
} else {
  Write-Host '[DWES] No DWES frontend or backend processes were running.'
}
