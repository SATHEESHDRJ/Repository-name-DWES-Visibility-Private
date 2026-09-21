@echo off
setlocal
set "PUB=C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh\ssh-key-2026-07-20.key.pub"
if not exist "%PUB%" (
  echo Missing: %PUB%
  pause
  exit /b 1
)
powershell -NoProfile -Command ^
  "$line = (Get-Content -LiteralPath '%PUB%' -Raw).Trim(); if ($line -notmatch '^ssh-(rsa|ed25519)\s+\S+') { Write-Error 'Public key line looks invalid or truncated'; exit 1 }; Set-Clipboard -Value $line; Write-Host ('Copied ' + $line.Length + ' chars to clipboard (one line).'); Write-Host 'Paste into VM console authorized_keys via vm-paste-authorized-keys-ubuntu.sh'"
pause
