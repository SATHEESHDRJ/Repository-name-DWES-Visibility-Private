@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\start-dwes.ps1" -Mode Dev
exit /b %ERRORLEVEL%
