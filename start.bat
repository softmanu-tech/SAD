@echo off
title Salary Advance Manager
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from nodejs.org and try again. & pause & exit /b 1)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:3500"
node server.js
pause
