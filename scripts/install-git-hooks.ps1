# Install DWES git hooks from tracked templates (scripts/git-hooks/).
# Run: npm run hooks:install
# Requires Git for Windows (bash.exe) for hook execution on commit.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$src = Join-Path $repoRoot 'scripts\git-hooks\pre-commit'
$destDir = Join-Path $repoRoot '.git\hooks'
$dest = Join-Path $destDir 'pre-commit'

if (-not (Test-Path $src)) {
  Write-Error "Tracked hook not found: $src"
}

if (-not (Test-Path $destDir)) {
  Write-Error '.git/hooks not found - is this a git repository?'
}

Copy-Item -Path $src -Destination $dest -Force
Write-Host "Installed pre-commit hook to $dest"
Write-Host 'Hook runs via Git Bash on commit. Verify: bash scripts/git-hooks/pre-commit'
