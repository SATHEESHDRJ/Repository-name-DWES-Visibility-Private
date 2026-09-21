@echo off
title DWES Launcher

echo =========================================
echo  Digital Wiring Execution System
echo  Starting backend and frontend...
echo =========================================
echo.

REM Backend — NestJS dev watch (auto-recompiles on change; no stale dist)
start "DWES Backend (port 3001)" cmd /k "cd /d C:\Users\sathe\OneDrive\Desktop\DWES\backend && npm run start:dev"

REM Wait for backend to finish compiling before starting frontend
timeout /t 8 /nobreak >nul

REM Frontend — Vite dev server on port 5175
start "DWES Frontend (port 5175)" cmd /k "cd /d C:\Users\sathe\OneDrive\Desktop\DWES && npm run dev"

echo.
echo Backend  → http://localhost:3001
echo Frontend → http://localhost:5175
echo.
echo Both servers are starting in separate windows.
echo Close those windows to stop the servers.
echo.
pause
