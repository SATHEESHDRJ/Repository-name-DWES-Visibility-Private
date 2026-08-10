@echo off
setlocal
set "KEY=C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh\ssh-key-2026-07-20.key"
set "HOST=193.123.79.209"
set "DOMAIN=dwes.ingenious-network.com"
if not exist "%KEY%" (
  echo Missing private key: %KEY%
  echo Pair with: %KEY%.pub
  pause
  exit /b 1
)
echo Using key: %KEY%
echo === SSH by IP ===
ssh -i "%KEY%" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o IdentitiesOnly=yes ubuntu@%HOST% "echo SSH_IP_OK"
if errorlevel 1 (
  echo FAILED IP - see infra\oci\scripts\OCI-CURRENT-TARGET.md
  pause
  exit /b 1
)
echo === SSH by domain ===
ssh -i "%KEY%" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o IdentitiesOnly=yes ubuntu@%DOMAIN% "echo SSH_DNS_OK"
if errorlevel 1 (
  echo FAILED DNS - run: ssh-keygen -R %DOMAIN%
  echo Then retry. Confirm: nslookup %DOMAIN%
  pause
  exit /b 1
)
echo SUCCESS IP and DNS
pause
