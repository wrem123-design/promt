@echo off
setlocal
cd /d "%~dp0"
echo Starting Prompt Archive server...
echo.
if "%PORT%"=="" set "PORT=5173"
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Port %PORT% is already in use.
  echo Prompt Archive may already be running at http://127.0.0.1:%PORT%
  echo Opening the existing server...
  start "" "http://127.0.0.1:%PORT%"
  pause
  exit /b 0
)
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
