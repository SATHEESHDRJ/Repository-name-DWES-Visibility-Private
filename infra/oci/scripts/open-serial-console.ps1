# Opens OCI Instance Console Connection using dwes-demo-oci (matches console created with that public key).
# Usage: powershell -ExecutionPolicy Bypass -File infra\oci\scripts\open-serial-console.ps1
param(
  [string]$ConsoleOcid = "ocid1.instanceconsoleconnection.oc1.me-dubai-1.anshqljrohxhxzycyfwgqpuij4umged6hfk35ciz6e3pegltg5r7upmrlsfa",
  [string]$InstanceOcid = "ocid1.instance.oc1.me-dubai-1.anshqljrohxhxzycyam7bh4axm6zxo5kk2rmxzqp2cfv43kcray3e3w3nkja"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot))
$OpenSshKey = Join-Path $RepoRoot ".oci-ssh\dwes-demo-oci"
$Ppk = Join-Path $RepoRoot ".oci-ssh\dwes-demo-oci.ppk"
$Plink = "C:\Program Files\PuTTY\plink.exe"
$Puttygen = "C:\Program Files\PuTTY\puttygen.exe"
$HostName = "instance-console.me-dubai-1.oci.oraclecloud.com"

if (-not (Test-Path $OpenSshKey)) { throw "Missing $OpenSshKey" }
if (-not (Test-Path $Plink)) { throw "Missing PuTTY plink at $Plink" }

icacls $OpenSshKey /inheritance:r | Out-Null
icacls $OpenSshKey /grant:r "${env:USERNAME}:R" | Out-Null

if (-not (Test-Path $Ppk)) {
  if (-not (Test-Path $Puttygen)) { throw "Missing puttygen; cannot create .ppk" }
  & $Puttygen $OpenSshKey -O private -o $Ppk
}

$ociDir = Join-Path $env:USERPROFILE "oci"
New-Item -ItemType Directory -Force -Path $ociDir | Out-Null
Copy-Item -Force $Ppk (Join-Path $ociDir "console.ppk")
$ConsolePpk = Join-Path $ociDir "console.ppk"

Write-Host "Using PPK: $ConsolePpk"
Write-Host "Starting tunnel on localhost:22000 ..."

$tunnel = Start-Process -FilePath $Plink -ArgumentList @(
  "-i", $ConsolePpk, "-N", "-ssh", "-P", "443",
  "-l", $ConsoleOcid,
  "-L", "22000:${InstanceOcid}:22",
  $HostName
) -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 5
Write-Host "Tunnel PID=$($tunnel.Id). Opening serial session..."
Write-Host "Press Enter several times. Then paste the authorized_keys sudo line."
Write-Host ""

& $Plink -i $ConsolePpk -P 22000 localhost -l $InstanceOcid
