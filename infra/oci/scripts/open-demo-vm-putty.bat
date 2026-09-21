@echo off
setlocal
set "BASE=C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh"
set "PPK=%BASE%\ingenious-dwes-prod-01.ppk"
if not exist "%PPK%" set "PPK=%BASE%\dwes-demo-oci.ppk"
set "HOST=193.123.79.209"
set "USER=ubuntu"
set "PUTTY=C:\Program Files\PuTTY\putty.exe"
if not exist "%PUTTY%" set "PUTTY=C:\Program Files (x86)\PuTTY\putty.exe"
if not exist "%PUTTY%" (
  echo PuTTY not found. Install PuTTY or edit PUTTY path in this file.
  pause
  exit /b 1
)
if not exist "%PPK%" (
  echo Missing PPK: %PPK%
  echo.
  echo 1. Open PuTTYgen
  echo 2. Conversions - Import key - select .oci-ssh\ssh-key-2026-07-20.key
  echo 3. Save private key as ingenious-dwes-prod-01.ppk in .oci-ssh\
  echo.
  echo Run Cloud Shell inject first if you still get Permission denied.
  pause
  exit /b 1
)
start "" "%PUTTY%" -ssh %USER%@%HOST% -i "%PPK%"
