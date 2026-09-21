@echo off
setlocal
title DWES - LAN Launcher
cd /d "%~dp0"

echo ==================================================
echo   DWES - LAN Launcher
echo   Rebuilds the frontend, then starts both servers
echo ==================================================
echo.

echo [1/3] Building frontend (includes the responsive changes)...
echo       This can take a minute. Please wait...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo   *** BUILD FAILED - see the errors above. ***
  echo   The servers were NOT started. Fix the error and run this again.
  echo.
  pause
  exit /b 1
)
echo.
echo   Frontend build complete.
echo.

echo [2/3] Starting the backend (NestJS) in its own window...
start "DWES Backend (port 3001)" cmd /k "cd /d %~dp0backend && npm run start:dev"

echo       Waiting a few seconds for the backend to come up...
timeout /t 8 /nobreak >nul

echo [3/3] Starting the frontend LAN server in its own window...
start "DWES Frontend (port 5173)" cmd /k "cd /d %~dp0 && npm run preview -- --host 0.0.0.0 --port 5173"

echo.
echo ==================================================
echo   DWES is starting in two new windows.
echo.
echo   Open this on your tablet / phone / laptop
echo   (all on the same Wi-Fi):
echo.
echo        http://192.168.0.165:5173
echo.
echo   Backend API : http://192.168.0.165:3001
echo   On this PC  : http://localhost:5173
echo.
echo   To STOP DWES, close the two server windows.
echo ==================================================
echo.
echo   Note: if the page loads but data does not appear,
echo   give the backend window a few more seconds, then
echo   refresh the browser.
echo.
pause
endlocal
