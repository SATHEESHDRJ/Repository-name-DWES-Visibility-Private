# DWES demo deploy to OCI VM ingenious-dwes-prod-maintenance-01
# See infra/oci/scripts/OCI-CURRENT-TARGET.md
# IP-only (no DNS / no Let's Encrypt):
#   powershell -ExecutionPolicy Bypass -File infra\oci\scripts\deploy-demo-from-windows.ps1 -PublicIp 193.123.79.209 -IpOnly
# Free HTTPS (sslip.io, after nslookup <IP>.sslip.io → IP):
#   ... -PublicIp 193.123.79.209 -Domain 193.123.79.209.sslip.io
# Company domain (only when A record points at VM):
#   ... -PublicIp 193.123.79.209 -Domain dwes.ingenious-network.com
param(
  [Parameter(Mandatory = $true)][string]$PublicIp,
  [string]$SshKey = "",
  [string]$RepoRoot = "C:\Users\sathe\OneDrive\Desktop\DWES",
  [string]$Domain = "",
  [string]$InstanceName = "ingenious-dwes-prod-maintenance-01",
  [switch]$SkipTls,
  [switch]$IpOnly
)

if ($IpOnly) {
  $SkipTls = $true
  if (-not $Domain) { $Domain = $PublicIp }
}
if (-not $Domain) { $Domain = "dwes.ingenious-network.com" }

$AppScheme = if ($IpOnly -or $SkipTls) { "http" } else { "https" }
$AppOrigin = "${AppScheme}://${Domain}"

if (-not $SshKey) {
  # Matching pair only — do not fall back to unrelated key filenames.
  $SshKey = Join-Path $RepoRoot ".oci-ssh\ssh-key-2026-07-20.key"
}
if (-not (Test-Path -LiteralPath $SshKey)) {
  throw "Missing SSH private key: $SshKey (pair with ssh-key-2026-07-20.key.pub on VM /home/ubuntu/.ssh/authorized_keys)"
}

$ErrorActionPreference = "Stop"
$remote = "ubuntu@$PublicIp"
$sshBase = @("-i", $SshKey, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20", "-o", "IdentitiesOnly=yes")

function Invoke-Remote([string]$Cmd) {
  ssh @sshBase $remote $Cmd
  if ($LASTEXITCODE -ne 0) { throw "Remote failed: $Cmd" }
}

function Assert-DomainResolvesToIp([string]$HostName, [string]$ExpectedIp) {
  if ($HostName -eq $ExpectedIp) { return }
  Write-Host "==> DNS check: $HostName must resolve to $ExpectedIp (required before Let's Encrypt)"
  $resolved = @()
  try {
    $resolved = @(Resolve-DnsName -Name $HostName -Type A -ErrorAction Stop | ForEach-Object { $_.IPAddress })
  } catch {
    throw "DNS name does not exist / NXDOMAIN for $HostName. Create/fix the DNS A record → $ExpectedIp, wait for propagation, then re-run."
  }
  if ($resolved -notcontains $ExpectedIp) {
    throw "DNS mismatch for $HostName. Got: $($resolved -join ', '). Expected: $ExpectedIp. Fix DNS A record before SSL."
  }
  Write-Host "  DNS OK: $HostName → $ExpectedIp"
}

Write-Host "==> SSH check"
ssh @sshBase $remote "echo SSH_OK"
if ($LASTEXITCODE -ne 0) {
  throw "SSH failed (Permission denied). Verify key ssh-key-2026-07-20.key.pub on VM authorized_keys (SHA256:66QgKMVl...). See infra/oci/scripts/OCI-CURRENT-TARGET.md"
}

if (-not $SkipTls) {
  Assert-DomainResolvesToIp -HostName $Domain -ExpectedIp $PublicIp
}

Write-Host "==> Bootstrap docker + dirs"
scp @sshBase "$RepoRoot\infra\oci\scripts\bootstrap-demo-vm.sh" "${remote}:/tmp/bootstrap-demo-vm.sh"
Invoke-Remote "sed -i 's/\r$//' /tmp/bootstrap-demo-vm.sh && bash /tmp/bootstrap-demo-vm.sh"

Write-Host "==> Sync repo to /opt/dwes (exclude node_modules/.git/.oci-ssh)"
# Nginx Dockerfile runs `COPY . .` — sync full app tree needed for frontend build.
$staging = Join-Path $env:TEMP ("dwes-oci-sync-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
$robocopyArgs = @(
  $RepoRoot, $staging, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np", "/R:1", "/W:1",
  "/XD", "node_modules", ".git", ".oci-ssh", "dist", "coverage", "test-results", "artifacts",
  "Backup", "DEWS_Backups", ".claude", "certs", "le-staging",
  "backend\node_modules", "backend\uploads", "backend\dist"
)
& robocopy @robocopyArgs | Out-Null
# robocopy exit codes 0-7 are success
if ($LASTEXITCODE -ge 8) { throw "robocopy staging failed: $LASTEXITCODE" }
ssh @sshBase $remote "mkdir -p /opt/dwes && if [ -f /opt/dwes/infra/docker/.env ]; then cp /opt/dwes/infra/docker/.env /tmp/dwes-env.bak; fi && rm -rf /opt/dwes/* /opt/dwes/.[!.]* 2>/dev/null || true"
scp @sshBase -r "$staging\*" "${remote}:/opt/dwes/"
if ($LASTEXITCODE -ne 0) { throw "scp tree failed" }
ssh @sshBase $remote "if [ -f /tmp/dwes-env.bak ]; then mkdir -p /opt/dwes/infra/docker && cp /tmp/dwes-env.bak /opt/dwes/infra/docker/.env && rm -f /tmp/dwes-env.bak; fi"
try { Remove-Item -Recurse -Force $staging -ErrorAction Stop } catch { Write-Warning "Staging cleanup skipped (locked files): $staging" }

Write-Host "==> Create / update infra/docker/.env"
$envTemplate = if ($IpOnly) {
  "infra/docker/.env.demo-ip.example"
} elseif ($Domain -like "*.sslip.io") {
  "infra/docker/.env.demo-sslip.example"
} else {
  "infra/docker/.env.demo.example"
}
$bash = @"
set -euo pipefail
cd /opt/dwes
if [ -f infra/docker/.env ]; then
  echo "Preserving existing infra/docker/.env on the server"
else
  TEMPLATE='$envTemplate'
  if [ -f "`$TEMPLATE" ]; then cp -f "`$TEMPLATE" infra/docker/.env
  elif [ -f infra/docker/.env.demo-ip.example ]; then cp -f infra/docker/.env.demo-ip.example infra/docker/.env
  elif [ -f infra/docker/.env.demo.example ]; then cp -f infra/docker/.env.demo.example infra/docker/.env
  else cp -f infra/docker/.env.dev.example infra/docker/.env
  fi
fi
test -f infra/docker/.env || { echo "Missing infra/docker/.env after template copy"; exit 1; }
DOMAIN='$Domain'
ORIGIN='$AppOrigin'
DEMO='true'
PW=`$(openssl rand -base64 48 | tr -d '\n')
JWT=`$(openssl rand -base64 48 | tr -d '\n')
sed -i "s|^DWES_DOMAIN=.*|DWES_DOMAIN=`${DOMAIN}|" infra/docker/.env
sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=`${ORIGIN}|" infra/docker/.env
sed -i "s|^RP_ID=.*|RP_ID=`${DOMAIN}|" infra/docker/.env
sed -i "s|^RP_ORIGIN=.*|RP_ORIGIN=`${ORIGIN}|" infra/docker/.env
sed -i "s|^RP_NAME=.*|RP_NAME='DWES'|" infra/docker/.env
sed -i "s|^DATA_ROOT=.*|DATA_ROOT=/opt/dwes-data|" infra/docker/.env
sed -i "s|^DEMO_MODE=.*|DEMO_MODE=`${DEMO}|" infra/docker/.env
if grep -q CHANGE_ME infra/docker/.env; then
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=`${PW}|" infra/docker/.env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=`${JWT}|" infra/docker/.env
fi
grep -E '^(DWES_DOMAIN|DATA_ROOT|DEMO_MODE|CORS_ORIGINS|RP_ID|RP_ORIGIN)=' infra/docker/.env
"@
# Pipe LF-only script (CRLF breaks `cd` on the VM and leaves infra/docker/.env missing).
$bashLf = $bash -replace "`r`n", "`n"
$bashLf | ssh @sshBase $remote "bash -s"
if ($LASTEXITCODE -ne 0) { throw "env setup failed" }

if ($IpOnly) {
  Write-Host "==> Bootstrap self-signed TLS (IP-only demo; nginx requires PEMs under DATA_ROOT/ssl/nginx)"
  $tlsBootstrap = @"
set -euo pipefail
DATA_ROOT=/opt/dwes-data
mkdir -p "`${DATA_ROOT}/ssl/nginx"
if [ ! -f "`${DATA_ROOT}/ssl/nginx/fullchain.pem" ]; then
  DOMAIN='$Domain'
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "`${DATA_ROOT}/ssl/nginx/privkey.pem" \
    -out "`${DATA_ROOT}/ssl/nginx/fullchain.pem" \
    -subj "/CN=`${DOMAIN}"
fi
chmod 644 "`${DATA_ROOT}/ssl/nginx/fullchain.pem" "`${DATA_ROOT}/ssl/nginx/privkey.pem"
"@
  ($tlsBootstrap -replace "`r`n", "`n") | ssh @sshBase $remote "bash -s"
  if ($LASTEXITCODE -ne 0) { throw "TLS bootstrap failed" }
}

Write-Host "==> docker compose build + up (several minutes)"
Invoke-Remote @"
bash -lc 'cd /opt/dwes && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env build && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d'
"@

if (-not $SkipTls) {
  Write-Host "==> TLS (needs DNS A record $Domain -> $PublicIp)"
  try {
    Invoke-Remote "bash -lc 'cd /opt/dwes && set -a && . infra/docker/.env && set +a && bash infra/oci/scripts/init-letsencrypt.sh || true'"
    Invoke-Remote "bash -lc 'cd /opt/dwes && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d'"
  } catch {
    Write-Warning "TLS failed or DNS not ready: $_"
  }
}

Invoke-Remote "bash -lc 'cd /opt/dwes && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env ps'"
Write-Host ""
Write-Host "DONE - DWES demo on $InstanceName"
if ($IpOnly) {
  Write-Host "  Open: http://${PublicIp}/"
  Write-Host "  Health: http://${PublicIp}/healthz  API: http://${PublicIp}/api/health"
  Write-Host "  DEMO_MODE=true - password login / login-hints (WebAuthn may not work over bare IP)"
} else {
  Write-Host "  Site: ${AppOrigin}/"
  Write-Host "  DEMO_MODE=true - use /api/login-hints or demo-accounts seed"
}
if ($SkipTls -and -not $IpOnly) {
  Write-Host "  SkipTls: check http://${PublicIp}/healthz until DNS is ready"
} elseif (-not $SkipTls) {
  Write-Host "  Ensure DNS A record ${Domain} -> ${PublicIp} before TLS"
}
