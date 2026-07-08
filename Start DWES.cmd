@echo off
REM Visible fallback — delegates to hidden launcher (no console windows).
cd /d "%~dp0"
wscript.exe "%~dp0Start DWES (Hidden).vbs"
exit /b %ERRORLEVEL%
