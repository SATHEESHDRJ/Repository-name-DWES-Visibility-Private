# Place DWES go-live credentials (run once before npm run go-live)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/place-credentials.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

$secrets = Join-Path $root 'deploy-secrets.local.env'
$example = Join-Path $root 'deploy-secrets.local.env.example'
$ociDir = Join-Path $env:USERPROFILE '.oci'
$sshKey = Join-Path $env:USERPROFILE '.ssh\dwes_oci'

Write-Host ''
Write-Host '=== DWES Go-Live Credential Setup ===' -ForegroundColor Cyan
Write-Host "Repo: $root"
Write-Host ''

if (-not (Test-Path $secrets)) {
  if (Test-Path $example) {
    Copy-Item $example $secrets
    Write-Host '[created] deploy-secrets.local.env from example - edit with real values' -ForegroundColor Yellow
  } else {
    throw 'deploy-secrets.local.env.example missing'
  }
} else {
  Write-Host '[ok] deploy-secrets.local.env exists'
}

if (-not (Test-Path $ociDir)) {
  New-Item -ItemType Directory -Force -Path $ociDir | Out-Null
  Write-Host "[created] $ociDir"
}
$config = Join-Path $ociDir 'config'
if (-not (Test-Path $config)) {
  $keyPath = (Join-Path $ociDir 'oci_api_key.pem') -replace '\\', '/'
  @(
    '[DEFAULT]'
    'user=OCID_USER'
    'fingerprint=aa:bb:cc:...'
    'tenancy=OCID_TENANCY'
    'region=me-dubai-1'
    "key_file=$keyPath"
  ) | Set-Content $config -Encoding UTF8
  Write-Host '[created] template ~/.oci/config - replace OCID values' -ForegroundColor Yellow
  Write-Host "        Place API private key at: $(Join-Path $ociDir 'oci_api_key.pem')"
} else {
  Write-Host '[ok] ~/.oci/config exists'
}

if (-not (Test-Path $sshKey)) {
  $sshDir = Split-Path $sshKey -Parent
  if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Force -Path $sshDir | Out-Null }
  Write-Host "[creating] Bastion SSH key: $sshKey" -ForegroundColor Yellow
  ssh-keygen -t ed25519 -f $sshKey -N '""' -C 'dwes-oci-bastion'
} else {
  Write-Host '[ok] Bastion SSH key exists'
}

$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (Test-Path $gh) {
  try {
    & $gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '[todo] Run: gh auth login' -ForegroundColor Yellow
    } else {
      Write-Host '[ok] gh authenticated'
    }
  } catch {
    Write-Host '[todo] Run: gh auth login' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '--- Next ---'
Write-Host '1. Edit deploy-secrets.local.env (OCI + Cloudflare + OCIR)'
Write-Host '2. Edit ~/.oci/config and add oci_api_key.pem'
Write-Host '3. gh auth login'
Write-Host "4. cd $root"
Write-Host '5. npm run go-live:preflight'
Write-Host '6. npm run go-live'
Write-Host ''
