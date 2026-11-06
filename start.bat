@echo off
title Salary Advance Manager
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from https://nodejs.org and try again. & pause & exit /b 1)

echo Installing / checking components...
call npm install --no-audit --no-fund || (echo Install failed. & pause & exit /b 1)

echo Building the app (takes a minute)...
call npm run build || (echo Build failed. & pause & exit /b 1)

echo.
echo Salary Advance Manager is running at http://127.0.0.1:3500  (this laptop only)
echo Close this window to stop it.
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:3500"
call npm run start
pause
