#Requires -Version 5.1
<#
.SYNOPSIS
  Stage a CI-faithful commit set (not commit/push). Default is dry-run.

.DESCRIPTION
  Remote CI only sees committed files. Local 426 BE tests include ~22 uncommitted
  backend/test/*.cjs files — use -Apply when you intend to push and match local parity.
#>
param(
  [switch]$Apply
)

Set-Location (Split-Path -Parent $PSScriptRoot)
$ErrorActionPreference = 'Continue'

$tracked = @(cmd /c "git diff --name-only HEAD 2>nul" | Where-Object { $_ -and $_ -notmatch '^backend/tmp_|^uploads/' })
$untracked = @(
  '.github/workflows/ci.yml',
  'docs/ACCEPTANCE_DRAWING_REQUIRED.md',
  'docs/LIVE-TB-LOCATEANYTHING-LICENSE.md',
  'docs/LIVE-TB-CLOUD-GROUNDING-PREP.md',
  'docs/evidence/final-two-blockers-2026-09-21_112345',
  'docs/handoffs/FINAL_TWO_BLOCKERS_HANDOFF_2026-09-21.md',
  'scripts/verify-final-two-blockers-restore.mjs',
  'scripts/verify-browser-restore-smoke.mjs',
  'scripts/run-final-two-blockers-verify.ps1',
  'scripts/run-ci-local-parity.ps1',
  'scripts/stage-for-remote-ci.ps1',
  'scripts/open-owner-rereview-gallery.ps1',
  'scripts/capture-supervisor-status-chips.mjs'
)
function Get-UntrackedUnder([string]$scope) {
  @(cmd /c "git status --porcelain $scope 2>nul" |
    Where-Object { $_.StartsWith('??') } |
    ForEach-Object { $_.Substring(3).Trim().Replace('\', '/') } |
    Where-Object {
      $_ -notmatch '(^|/)tmp_|^backend/tmp|uploads/|__pycache__|\.pyc$|\.bak$|\.broken$|\.utf16\.|_tmp_repro|\.pdf$'
    })
}

$untrackedBackend = Get-UntrackedUnder 'backend'
$untrackedSrc = Get-UntrackedUnder 'src'
$untrackedFeTests = Get-UntrackedUnder 'tests'
$untrackedPublic = Get-UntrackedUnder 'public'
$untrackedScriptsExtra = Get-UntrackedUnder 'scripts' | Where-Object {
  $_ -notin @(
    'scripts/verify-final-two-blockers-restore.mjs',
    'scripts/verify-browser-restore-smoke.mjs',
    'scripts/run-final-two-blockers-verify.ps1',
    'scripts/run-ci-local-parity.ps1',
    'scripts/stage-for-remote-ci.ps1',
    'scripts/open-owner-rereview-gallery.ps1',
    'scripts/capture-supervisor-status-chips.mjs'
  )
}

$all = ($tracked + $untracked + $untrackedBackend + $untrackedSrc + $untrackedFeTests + $untrackedPublic + $untrackedScriptsExtra | Sort-Object -Unique)

Write-Host "Paths to stage: $($all.Count) (tracked=$($tracked.Count), backend??=$($untrackedBackend.Count), src??=$($untrackedSrc.Count))"
$all | ForEach-Object { Write-Host "  $_" }

$requiredOnDisk = @(
  'docs/LIVE-TB-LOCATEANYTHING-LICENSE.md',
  'docs/LIVE-TB-CLOUD-GROUNDING-PREP.md',
  'backend/drawing-intelligence/tiling.py',
  'backend/drawing-intelligence/locate_anything.py',
  'backend/drawing-intelligence/visual_grounding_provider.py',
  'public/assets'
) | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($requiredOnDisk.Count -gt 0) {
  Write-Error "CI bundle missing required paths: $($requiredOnDisk -join ', ')"
  exit 1
}

if (-not $Apply) {
  Write-Host "`nDry-run only. Re-run with -Apply to git add (still no commit)."
  exit 0
}

foreach ($p in $all) {
  git add -- $p
}
cmd /c "git reset HEAD backend/drawing-intelligence/__pycache__ 2>nul" | Out-Null
git status -sb | Select-Object -First 20
Write-Host "`nStaged. Review with: git diff --cached --stat"
