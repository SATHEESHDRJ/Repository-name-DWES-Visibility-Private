#Requires -Version 5.1
# Re-run restore verification gates for final-two-blockers evidence pack.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:DWES_API_URL = 'http://127.0.0.1:3101'
$env:DWES_UI_URL = 'http://127.0.0.1:5275'
function Invoke-NodeStep([string]$label, [string]$script) {
  Write-Host "== $label =="
  node $script
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Invoke-NodeStep 'restore DB + UI workflows' 'scripts/verify-final-two-blockers-restore.mjs'
Invoke-NodeStep 'browser smoke' 'scripts/verify-browser-restore-smoke.mjs'
Write-Host '== API health =='
(Invoke-RestMethod "$env:DWES_API_URL/api/health" | ConvertTo-Json -Compress)
Write-Host 'DONE — see docs/evidence/final-two-blockers-2026-09-21_112345/verify/'
