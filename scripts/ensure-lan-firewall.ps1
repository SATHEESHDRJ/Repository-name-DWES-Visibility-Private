# Ensure Windows Firewall allows DWES Universal Local Network Mode.
# Creates inbound TCP allow rules for the DWES LAN ports on ALL profiles
# (Domain/Private/Public) so tablets work even when the Wi-Fi is classified Public.
# Safe to re-run. Usage (elevated):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-lan-firewall.ps1

param(
  [int[]]$Ports = @(5175, 5173, 3001, 4173),
  [string]$RulePrefix = 'DWES-LAN'
)

$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "[DWES] Firewall check for Universal Local Network Mode"
Write-Host "  Ports: $($Ports -join ', ')  Profile: Any (Domain/Private/Public)"

# Report active network category so the user knows if Wi-Fi is Public.
try {
  Get-NetConnectionProfile | ForEach-Object {
    Write-Host ("  Network: {0} [{1}] = {2}" -f $_.Name, $_.InterfaceAlias, $_.NetworkCategory)
  }
} catch {}

if (-not $isAdmin) {
  Write-Host "  Status: NOT Administrator - cannot create rules from this process."
  Write-Host "  Run elevated PowerShell, then:"
  Write-Host "    powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  foreach ($p in $Ports) {
    $existing = Get-NetFirewallRule -Name "$RulePrefix-TCP-$p" -ErrorAction SilentlyContinue
    if ($existing) { Write-Host "  Rule present: $RulePrefix-TCP-$p" }
    else { Write-Host "  Rule missing: $RulePrefix-TCP-$p" }
  }
  exit 2
}

foreach ($p in $Ports) {
  $name = "$RulePrefix-TCP-$p"
  $existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
  if ($existing) {
    # Ensure it is enabled and covers all profiles (repair older Private-only rule).
    Set-NetFirewallRule -Name $name -Enabled True -Profile Any -Action Allow -ErrorAction SilentlyContinue
    Write-Host "  Updated: $name (Inbound TCP $p, Any profile)"
    continue
  }
  New-NetFirewallRule `
    -Name $name `
    -DisplayName $name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $p `
    -Profile Any `
    -Description "DWES Universal Local Network Mode (dev/demo). LAN device access." | Out-Null
  Write-Host "  Created: $name (Inbound TCP $p, Any profile)"
}

Write-Host "  Firewall ready. If tablets still cannot connect, the Wi-Fi may use AP/client isolation (guest mode)."
exit 0
