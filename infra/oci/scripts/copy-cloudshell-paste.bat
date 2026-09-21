@echo off
setlocal
set "PASTE=%~dp0CLOUDSHELL-PASTE-ADD-SSH.txt"
set "SH=%~dp0cloudshell-inject-ssh-via-agent.sh"
if not exist "%PASTE%" (
  echo Missing %PASTE%
  echo Use %SH% in Notepad instead.
  pause
  exit /b 1
)
powershell -NoProfile -Command "Set-Clipboard -Value ([System.IO.File]::ReadAllText('%PASTE%'))"
echo Cloud Shell paste copied to clipboard.
echo.
echo 1. Open https://cloud.oracle.com/?region=me-dubai-1
echo 2. Developer - Cloud Shell
echo 3. Ctrl+V and Enter
echo 4. Wait for status=SUCCEEDED and PUBLIC_IP=
echo.
start "" notepad "%PASTE%"
pause
