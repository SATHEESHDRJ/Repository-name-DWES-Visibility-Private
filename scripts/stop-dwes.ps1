# Stop the DWES frontend/backend process trees for this checkout only.
# PostgreSQL and unrelated Node.js applications are intentionally untouched.
param(
  [string]$Root = (Split-Path $PSScriptRoot -Parent),
  [switch]$NoNotify
)

$ErrorActionPreference = 'Stop'
$rootResolved = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
$rootPattern = [regex]::Escape($rootResolved)
$workspacePattern = '(?i)(^|[^A-Z0-9_.-])' + $rootPattern + '(?=$|[\\\s"''])'
$entrypointPattern = '(?i)(?:\\node_modules\\vite\\bin\\vite\.js|\\backend\\node_modules\\@nestjs\\cli\\bin\\nest\.js|\\backend\\dist(?:\\src)?\\main(?:\.js)?|\\scripts\\(?:launch-dwes|launch-hidden|backend-dev-runner)\.mjs)(?=$|[\s"])'
$launcherDir = Join-Path $rootResolved 'logs\launcher'
$stopLog = Join-Path $launcherDir 'stop.log'
$runnerLockPattern = Join-Path $rootResolved 'logs\backend-dev-runner.*.lock.json'

New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null

function Rotate-LauncherLog([string]$Path, [int]$Retention = 5, [long]$MaxBytes = 2MB) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  if ((Get-Item -LiteralPath $Path).Length -le $MaxBytes) { return }
  for ($index = $Retention - 1; $index -ge 1; $index -= 1) {
    $source = "$Path.$index"
    $target = "$Path.$($index + 1)"
    if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination $target -Force }
  }
  Move-Item -LiteralPath $Path -Destination "$Path.1" -Force
}

function Write-StopLog([string]$Message, [string]$Level = 'INFO') {
  $timestamp = (Get-Date).ToUniversalTime().ToString('o')
  Add-Content -LiteralPath $stopLog -Value "[$timestamp] [$Level] $Message"
}

function Show-DwesMessage([string]$Title, [string]$Message, [string]$Icon = 'Information') {
  if ($NoNotify -or $env:DWES_NO_NOTIFY -eq '1') { return }
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($Message, $Title, 'OK', $Icon) | Out-Null
  } catch {
    Write-StopLog "Notification failed: $($_.Exception.Message)" 'WARN'
  }
}

function Test-DwesWorkspaceCommand([string]$CommandLine) {
  if (-not $CommandLine) { return $false }
  return $CommandLine.Replace('/', '\') -match $workspacePattern
}

function Test-DwesEntrypoint([string]$CommandLine) {
  if (-not $CommandLine) { return $false }
  return $CommandLine.Replace('/', '\') -match $entrypointPattern
}

function Get-LiveProcess([int]$ProcessId) {
  return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Add-Target(
  [hashtable]$Targets,
  $Process,
  [string]$Source,
  [bool]$TrustedRunnerLock = $false,
  [bool]$TrustedProcessRecord = $false,
  [string]$RecordedAt = '',
  [string]$Role = ''
) {
  if ($null -eq $Process) { return }
  $pidValue = [int]$Process.ProcessId
  if ($pidValue -le 0 -or $pidValue -eq $PID) { return }
  $Targets[$pidValue] = [pscustomobject]@{
    ProcessId = $pidValue
    Source = $Source
    TrustedRunnerLock = $TrustedRunnerLock
    TrustedProcessRecord = $TrustedProcessRecord
    RecordedAt = $RecordedAt
    Role = $Role
  }
}

function Stop-VerifiedTree($Target) {
  $process = Get-LiveProcess $Target.ProcessId
  if ($null -eq $process) { return $true }
  $command = [string]$process.CommandLine
  $owned = (Test-DwesWorkspaceCommand $command) -and (Test-DwesEntrypoint $command)
  if (-not $owned -and $Target.TrustedRunnerLock) {
    $owned = $command -match '(?i)backend-dev-runner\.mjs'
  }
  if (-not $owned -and $Target.TrustedProcessRecord -and [string]$process.Name -eq 'node.exe') {
    try {
      $recorded = [DateTimeOffset]::Parse([string]$Target.RecordedAt)
      $created = [DateTimeOffset]$process.CreationDate
      $ageDifference = [Math]::Abs(($created - $recorded).TotalSeconds)
      $owned = $ageDifference -le 120 -and [string]$Target.Role -in @('backend', 'frontend')
    } catch { $owned = $false }
  }
  if (-not $owned) {
    Write-StopLog "Refused PID $($Target.ProcessId): ownership changed before stop" 'ERROR'
    return $false
  }

  Write-StopLog "Stopping PID $($Target.ProcessId) from $($Target.Source): $command"
  & taskkill.exe /PID $Target.ProcessId /T /F 2>$null | Out-Null
  Start-Sleep -Milliseconds 250
  return $null -eq (Get-LiveProcess $Target.ProcessId)
}

Rotate-LauncherLog $stopLog
Write-StopLog "Stop requested for root $rootResolved"

$targets = @{}

# Prefer launcher-recorded PIDs when available. A PID record is accepted only
# for this exact root and when the live node creation time matches the record,
# preventing a recycled PID from being stopped.
$processRecordPath = Join-Path $launcherDir 'processes.json'
if (Test-Path -LiteralPath $processRecordPath) {
  try {
    $records = @(Get-Content -LiteralPath $processRecordPath -Raw | ConvertFrom-Json)
    foreach ($record in $records) {
      if ([string]$record.root -ne $rootResolved -or [string]$record.role -notin @('backend', 'frontend')) { continue }
      $process = Get-LiveProcess ([int]$record.pid)
      if ($process) {
        Add-Target $targets $process "launcher process record ($([string]$record.role))" $false $true ([string]$record.startedAt) ([string]$record.role)
      }
    }
  } catch {
    Write-StopLog 'Ignored invalid launcher process record' 'WARN'
  }
}

# A relative backend-runner command does not contain the checkout path. Trust it
# only when a lock stored in this checkout names the same root and live PID.
Get-ChildItem -Path $runnerLockPattern -File -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $lock = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
    if (-not $lock -or [string]$lock.root -ne $rootResolved) { return }
    $runner = Get-LiveProcess ([int]$lock.pid)
    if ($runner -and [string]$runner.CommandLine -match '(?i)backend-dev-runner\.mjs') {
      Add-Target $targets $runner "runner lock $($_.Name)" $true
    }
  } catch {
    Write-StopLog "Ignored invalid runner lock $($_.FullName)" 'WARN'
  }
}

# Direct node services and the startup coordinator are identified by exact
# checkout path plus a known DWES entrypoint. Other Node projects never match.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  $command = [string]$_.CommandLine
  if ((Test-DwesWorkspaceCommand $command) -and (Test-DwesEntrypoint $command)) {
    Add-Target $targets $_ 'command-line ownership'
  }
}

# Fallback npm/cmd wrappers from older launch paths. Require this exact checkout
# and a known DWES npm script before stopping the wrapper tree.
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | ForEach-Object {
  $command = [string]$_.CommandLine
  if (-not (Test-DwesWorkspaceCommand $command)) { return }
  if ($command -match '(?i)\bnpm(?:\.cmd)?\b.*\brun\s+(?:dev|backend|dev:all|start:dev|preview(?::lan)?|launch:(?:dev|prod))\b') {
    Add-Target $targets $_ 'legacy npm wrapper'
  }
}

$stopped = [System.Collections.Generic.HashSet[int]]::new()
$failed = [System.Collections.Generic.HashSet[int]]::new()
foreach ($target in @($targets.Values | Sort-Object -Property TrustedRunnerLock -Descending)) {
  if (Stop-VerifiedTree $target) { $null = $stopped.Add([int]$target.ProcessId) }
  else { $null = $failed.Add([int]$target.ProcessId) }
}

# A watcher may have been between child processes during the first snapshot.
# Re-scan twice, but retain the same exact ownership requirements.
for ($attempt = 0; $attempt -lt 2; $attempt += 1) {
  Start-Sleep -Milliseconds 350
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
    $command = [string]$_.CommandLine
    if ((Test-DwesWorkspaceCommand $command) -and (Test-DwesEntrypoint $command)) {
      $target = [pscustomobject]@{ ProcessId = [int]$_.ProcessId; Source = 'post-stop recheck'; TrustedRunnerLock = $false; TrustedProcessRecord = $false; RecordedAt = ''; Role = '' }
      if (Stop-VerifiedTree $target) { $null = $stopped.Add([int]$target.ProcessId) }
      else { $null = $failed.Add([int]$target.ProcessId) }
    }
  }
}

if ($failed.Count -eq 0) {
  foreach ($file in @(
    (Join-Path $launcherDir 'dwes.lock'),
    (Join-Path $launcherDir 'processes.json'),
    (Join-Path $rootResolved 'logs\dwes.lock')
  )) {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
  Get-ChildItem -Path $runnerLockPattern -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

if ($failed.Count -gt 0) {
  $message = "DWES could not stop all owned processes. Failed PID(s): $([string]::Join(', ', @($failed))). See logs\launcher\stop.log."
  Write-StopLog $message 'ERROR'
  Show-DwesMessage 'DWES stop failed' $message 'Error'
  Write-Error $message
  exit 1
}

if ($stopped.Count -gt 0) {
  $message = "DWES stopped successfully. Frontend and backend processes stopped: $($stopped.Count). PostgreSQL was left running."
} else {
  $message = 'DWES was already stopped. PostgreSQL and unrelated applications were left running.'
}
Write-StopLog $message
Write-Output "[DWES] $message"
Show-DwesMessage 'DWES — Stop Application' $message 'Information'
exit 0
