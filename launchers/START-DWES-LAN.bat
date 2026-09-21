@echo off
setlocal
title DWES - Universal Local Network Mode
cd /d "%~dp0.."

echo ==================================================
echo   DWES - Universal Local Network Mode
echo   Auto-detects this PC LAN IP - no hardcoded URL
echo ==================================================
echo.
echo   Starting frontend :5175 and backend :3001 on 0.0.0.0
echo   Tablets/phones on the SAME Wi-Fi should open the
echo   Frontend URL printed below (http://YOUR-LAN-IP:5175)
echo.

call npm run lan
if errorlevel 1 (
  echo.
  echo   *** LAN mode exited with an error. ***
  pause
  exit /b 1
)

pause
endlocal
