@echo off
REM Visible fallback — delegates to hidden Dev launcher (Vite HMR, no console windows).
cd /d "%~dp0"
wscript.exe "%~dp0Start DWES (Hidden).vbs"
exit /b %ERRORLEVEL%
