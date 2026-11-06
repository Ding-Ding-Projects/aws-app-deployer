@echo off
rem Installs the exact dependencies from package-lock.json.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22 or later is required: https://nodejs.org/ & exit /b 1)
call npm ci || exit /b 1
echo Dependencies installed.
