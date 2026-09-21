#Requires -Version 5.1
# Mirrors .github/workflows/ci.yml frontend + backend jobs (local only — not remote CI PASS).
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root 'docs/evidence/final-two-blockers-2026-09-21_112345/verify/ci-local-parity-nest11.txt'
$utf8 = New-Object System.Text.UTF8Encoding $false

function Write-LogLine([string]$line) {
  [System.IO.File]::AppendAllText($log, $line + [Environment]::NewLine, $utf8)
}

[System.IO.File]::WriteAllText($log, "started: $((Get-Date).ToString('o'))$([Environment]::NewLine)", $utf8)

function Step([string]$cmd) {
  Write-Host ">> $cmd"
  $out = cmd /c "$cmd 2>&1" | Out-String
  Write-LogLine ""
  Write-LogLine ">> $cmd"
  Write-LogLine $out.TrimEnd()
  if ($LASTEXITCODE -ne 0) {
    Write-LogLine "FAIL: $cmd exit=$LASTEXITCODE"
    exit $LASTEXITCODE
  }
}

Step 'npm run typecheck'
Step 'npm run lint'
Step 'npm run test:endpoint-v2'
Step 'npm run test:state'
Step 'npm run test:pwa'
Step 'npm run build'
Step 'npm --prefix backend run build'
Step 'npm --prefix backend test'
Write-LogLine "CI_LOCAL_PARITY_PASS ended: $((Get-Date).ToString('o'))"
Write-Host 'CI_LOCAL_PARITY_PASS'
