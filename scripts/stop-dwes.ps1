# Stop DWES dev servers — only node processes whose command line includes this repo root.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$rootNorm = $root.TrimEnd('\')
$pattern = [regex]::Escape($rootNorm)

$killed = @()
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  if ($cmd -notmatch $pattern) { return }
  # Only DWES dev stack processes (vite, nest, npm scripts under this repo).
  if ($cmd -notmatch 'vite|nest|dwes|dev:all|start:dev|launch-hidden') { return }
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  $killed += $_.ProcessId
}

# Hidden cmd wrappers spawned for DWES (optional cleanup).
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd -and $cmd -match $pattern -and $cmd -match 'npm run') {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if ($killed.Count) {
  Write-Host "[DWES] Stopped $($killed.Count) process(es)."
} else {
  Write-Host "[DWES] No DWES dev processes were running."
}
