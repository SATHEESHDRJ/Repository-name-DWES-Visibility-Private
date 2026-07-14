param(
  [Parameter(Mandatory = $true)]
  [string]$RootPath
)

$ErrorActionPreference = 'SilentlyContinue'
$backend = (Join-Path $RootPath 'backend').TrimEnd('\')
$backendPattern = [regex]::Escape($backend)
$killed = @()

# When /api/health is down, a Nest watch parent can remain alive without a
# listening child. Port cleanup cannot see that process, so a recovery launch
# would otherwise create a second watcher. Only target backend commands rooted
# in this exact checkout.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd -or $cmd -notmatch $backendPattern) { return }
  if ($cmd -notmatch '@nestjs.*cli.*nest\.js\s+start|backend[\\/]dist[\\/]main(?:\.js)?') { return }

  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  if (-not (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue)) {
    $killed += $_.ProcessId
  }
}

if ($killed.Count -gt 0) {
  Write-Output ($killed -join ',')
}
