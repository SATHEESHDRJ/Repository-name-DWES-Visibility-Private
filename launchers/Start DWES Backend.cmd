@echo off
title DWES Backend (port 3001)
cd /d "%~dp0.."

REM Already running? Show status and open health check.
powershell -NoProfile -Command ^
  "if ((Test-NetConnection localhost -Port 3001 -WarningAction SilentlyContinue).TcpTestSucceeded) { ^
     Write-Host ''; ^
     Write-Host '  DWES backend is already running on http://localhost:3001' -ForegroundColor Green; ^
     Write-Host ''; ^
     Start-Process 'http://localhost:3001/api'; ^
     exit 0 ^
   }"

echo.
echo =========================================
echo  DWES Backend — NestJS API
echo  Port 3001  ^|  Dev watch mode
echo =========================================
echo.
echo  Keep this window open while using DWES.
echo  Close it to stop the API.
echo.

cd /d "%~dp0..\backend"

if not exist "node_modules\" (
  echo Installing backend dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "dist\main.js" (
  echo Building backend...
  call npm run build
  if errorlevel 1 goto :fail
)

echo Starting backend...
echo.
call npm run start:dev
goto :eof

:fail
echo.
echo Backend failed to start. Check Postgres is running and backend\.env is set.
pause
exit /b 1
