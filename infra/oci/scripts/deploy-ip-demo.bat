@echo off
setlocal
set "ROOT=C:\Users\sathe\OneDrive\Desktop\DWES"
set "IP=193.123.79.209"
set "KEY=%ROOT%\.oci-ssh\ssh-key-2026-07-20.key"
echo === Step 1: SSH test ===
ssh -i "%KEY%" -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes ubuntu@%IP% "echo SSH_OK"
if errorlevel 1 (
  echo.
  echo SSH FAILED. See infra\oci\scripts\OCI-CURRENT-TARGET.md
  pause
  exit /b 1
)
echo.
echo === Step 2: Deploy DWES demo to http://%IP%/ ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\infra\oci\scripts\deploy-demo-from-windows.ps1" -PublicIp %IP% -IpOnly -SshKey "%KEY%" -InstanceName ingenious-dwes-prod-maintenance-01
pause
