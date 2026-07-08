@echo off
setlocal
REM ============================================================
REM  DWES backend runner (production) — used by the "DWES Backend"
REM  scheduled task via start-backend-hidden.vbs (runs windowless).
REM  Loops so the API self-heals if node exits (e.g. Postgres was
REM  not ready yet at boot). Logs to backend\backend.log.
REM ============================================================
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "APP_DIR=%%~fI"
set "BACKEND_DIR=%APP_DIR%\backend"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not exist "%NODE_EXE%" (
	for /f "delims=" %%N in ('where node 2^>nul') do (
		set "NODE_EXE=%%~fN"
		goto :node_found
	)
)

:node_found
if not exist "%NODE_EXE%" (
	echo [%date% %time%] ERROR: node.exe not found on this machine. >> "%BACKEND_DIR%\backend.log"
	timeout /t 30 /nobreak >nul
	goto node_found
)

cd /d "%BACKEND_DIR%"

:loop
echo [%date% %time%] Starting DWES backend (node dist\main) >> "%BACKEND_DIR%\backend.log"
"%NODE_EXE%" dist\main >> "%BACKEND_DIR%\backend.log" 2>&1
echo [%date% %time%] Backend exited (code %errorlevel%) - restarting in 5s >> "%BACKEND_DIR%\backend.log"
timeout /t 5 /nobreak >nul
goto loop
