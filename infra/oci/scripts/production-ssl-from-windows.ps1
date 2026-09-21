# Issue or refresh Let's Encrypt for dwes.ingenious-network.com on the OCI VM.
# Requires SSH from an IP allowed on dwes-public-security-list (e.g. 86.98.142.46/32).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\oci\scripts\production-ssl-from-windows.ps1
#
param(
  [string]$PublicIp = "193.123.79.209",
  [string]$Domain = "dwes.ingenious-network.com",
  [string]$SshKey = "",
  [string]$RepoRoot = "C:\Users\sathe\OneDrive\Desktop\DWES"
)

$ErrorActionPreference = "Stop"

if (-not $SshKey) {
  $SshKey = Join-Path $RepoRoot ".oci-ssh\ssh-key-2026-07-20.key"
}
if (-not (Test-Path -LiteralPath $SshKey)) {
  throw "Missing SSH private key: $SshKey"
}

$remote = "ubuntu@$PublicIp"
$sshBase = @(
  "-i", $SshKey,
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ConnectTimeout=25",
  "-o", "IdentitiesOnly=yes"
)

function Invoke-Remote([string]$Cmd) {
  ssh @sshBase $remote $Cmd
  if ($LASTEXITCODE -ne 0) { throw "Remote failed: $Cmd" }
}

Write-Host "==> DNS check: $Domain -> $PublicIp"
$resolved = @(Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop | ForEach-Object { $_.IPAddress })
if ($resolved -notcontains $PublicIp) {
  throw "DNS mismatch. Got: $($resolved -join ', '). Expected: $PublicIp"
}

Write-Host "==> SSH check"
ssh @sshBase $remote "echo SSH_OK"
if ($LASTEXITCODE -ne 0) {
  throw "SSH failed. Open port 22 for your public IP on dwes-public-security-list, then retry."
}

Write-Host "==> Sync nginx + cert scripts (no app rebuild)"
ssh @sshBase $remote "mkdir -p /opt/dwes/infra/nginx/conf.d /opt/dwes/infra/nginx/snippets /opt/dwes/infra/docker/scripts /opt/dwes/infra/oci/scripts"
scp @sshBase "$RepoRoot\infra\nginx\conf.d\dwes.conf" "${remote}:/opt/dwes/infra/nginx/conf.d/dwes.conf"
scp @sshBase "$RepoRoot\infra\nginx\nginx.conf" "${remote}:/opt/dwes/infra/nginx/nginx.conf"
scp @sshBase "$RepoRoot\infra\nginx\proxy_params.conf" "${remote}:/opt/dwes/infra/nginx/proxy_params.conf"
scp @sshBase -r "$RepoRoot\infra\nginx\snippets" "${remote}:/opt/dwes/infra/nginx/"
scp @sshBase "$RepoRoot\infra\docker\docker-compose.yml" "${remote}:/opt/dwes/infra/docker/docker-compose.yml"
scp @sshBase "$RepoRoot\infra\docker\scripts\sync-letsencrypt-to-nginx.sh" "${remote}:/opt/dwes/infra/docker/scripts/sync-letsencrypt-to-nginx.sh"
scp @sshBase "$RepoRoot\infra\docker\scripts\certbot-deploy-hook.sh" "${remote}:/opt/dwes/infra/docker/scripts/certbot-deploy-hook.sh"
scp @sshBase "$RepoRoot\infra\oci\scripts\init-letsencrypt.sh" "${remote}:/opt/dwes/infra/oci/scripts/init-letsencrypt.sh"

Write-Host "==> Ensure production domain in .env (preserve secrets)"
$envPatch = @"
set -euo pipefail
cd /opt/dwes
test -f infra/docker/.env
ORIGIN='https://${Domain}'
sed -i "s|^DWES_DOMAIN=.*|DWES_DOMAIN=${Domain}|" infra/docker/.env
sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=`${ORIGIN}|" infra/docker/.env
sed -i "s|^RP_ID=.*|RP_ID=${Domain}|" infra/docker/.env
sed -i "s|^RP_ORIGIN=.*|RP_ORIGIN=`${ORIGIN}|" infra/docker/.env
grep -E '^(DWES_DOMAIN|DATA_ROOT|CORS_ORIGINS|RP_ID|RP_ORIGIN)=' infra/docker/.env
"@
($envPatch -replace "`r`n", "`n") | ssh @sshBase $remote "bash -s"

Write-Host "==> Stack up + Let's Encrypt (replaces IP self-signed PEMs)"
Invoke-Remote "bash -lc 'cd /opt/dwes && sed -i `"s/\r`$//`" infra/oci/scripts/init-letsencrypt.sh infra/docker/scripts/sync-letsencrypt-to-nginx.sh && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d postgres api nginx && bash infra/oci/scripts/init-letsencrypt.sh'"

Write-Host "==> Certbot renew service + nginx reload + dry-run"
Invoke-Remote "bash -lc 'cd /opt/dwes && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env --profile certbot up -d certbot && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env exec -T nginx nginx -t && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env exec -T nginx nginx -s reload && docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env --profile certbot run --rm certbot certbot renew --dry-run'"

Write-Host "==> Remote certificate inspect"
Invoke-Remote "openssl x509 -in /opt/dwes-data/ssl/nginx/fullchain.pem -noout -subject -issuer -dates"

Write-Host "==> Verify trusted HTTPS from VM"
Invoke-Remote "curl -sf https://${Domain}/healthz && echo && curl -sf https://${Domain}/api/health | head -c 120 && echo"

Write-Host "==> Verify trusted HTTPS from this PC (no -k)"
curl.exe -sf "https://${Domain}/healthz"
Write-Host ""
$r = Invoke-WebRequest -Uri "https://${Domain}/healthz" -UseBasicParsing -TimeoutSec 30
Write-Host "Invoke-WebRequest status: $($r.StatusCode) body: $($r.Content.Trim())"
Write-Host ""
Write-Host "PASS candidate - confirm Chrome shows secure padlock for https://${Domain}/"