@echo off
setlocal
cd /d "%~dp0"
echo Starting Prompt Archive server...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js or run this project from an environment where node is available.
  pause
  exit /b 1
)
if not exist "data" mkdir "data"
if not exist "uploads" mkdir "uploads"
node server.js
pause
