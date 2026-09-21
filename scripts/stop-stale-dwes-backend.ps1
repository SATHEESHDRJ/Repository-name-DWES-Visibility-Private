param(
  [Parameter(Mandatory = $true)]
  [string]$RootPath
)

$ErrorActionPreference = 'SilentlyContinue'
$backend = (Join-Path $RootPath 'backend').TrimEnd('\')
$backendPattern = [regex]::Escape($backend)
$root = (Resolve-Path -LiteralPath $RootPath).Path.TrimEnd('\')
$rootPattern = [regex]::Escape($root)
$killed = @()
$targets = @{}

# When /api/health is down, a Nest watch parent can remain alive without a
# listening child. Port cleanup cannot see that process, so a recovery launch
# would otherwise create a second watcher. Only target backend commands rooted
# in this exact checkout.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  $backendService = $cmd -match $backendPattern -and $cmd -match '@nestjs.*cli.*nest\.js\s+(?:start|build)|backend[\\/]dist[\\/]main(?:\.js)?'
  $runner = $cmd -match $rootPattern -and $cmd -match 'backend-dev-runner\.mjs'
  if (-not $backendService -and -not $runner) { return }
  $targets[[int]$_.ProcessId] = $_
}

# A runner started through npm can have a relative command line. Its checkout
# lock is the only safe ownership proof in that case; revalidate the live PID.
Get-ChildItem -Path (Join-Path $root 'logs\backend-dev-runner.*.lock.json') -File -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $lock = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
    if ([string]$lock.root -ne $root) { return }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$lock.pid)" -ErrorAction SilentlyContinue
    if ($process -and [string]$process.CommandLine -match 'backend-dev-runner\.mjs') {
      $targets[[int]$process.ProcessId] = $process
    }
  } catch {}
}

$targets.Values | ForEach-Object {
  $processId = [int]$_.ProcessId
  & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
  if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    $killed += $processId
  }
}

if ($killed.Count -gt 0) {
  Write-Output ($killed -join ',')
}
