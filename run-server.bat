@echo off
setlocal

cd /d "%~dp0"

echo Starting Prompt Archive server...
echo.

if "%PORT%"=="" set "PORT=5173"

rem 이미 해당 포트에서 서버가 실행 중인지 확인
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul

if not errorlevel 1 (
    echo Port %PORT% is already in use.
    echo Prompt Archive may already be running at http://127.0.0.1:%PORT%
    echo Opening the existing server...

    start "" "http://127.0.0.1:%PORT%"

    pause
    exit /b 0
)

rem Node.js 설치 여부 확인
where node >nul 2>nul

if errorlevel 1 (
    echo Node.js was not found in PATH.
    echo Install Node.js or run this project from an environment where node is available.

    pause
    exit /b 1
)

rem 필요한 폴더 생성
if not exist "data" mkdir "data"
if not exist "uploads" mkdir "uploads"

echo Server URL: http://127.0.0.1:%PORT%
echo Opening browser automatically...
echo.

rem 서버가 시작될 시간을 기다린 후 브라우저 열기
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command ^
    "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%'"

rem 서버 실행
node server.js

echo.
echo Server has stopped.
pause