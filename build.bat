@echo off
rem Installs dependencies if needed, runs the tests, then starts the app from source.
cd /d "%~dp0"
if not exist node_modules call "%~dp0download-dependencies.bat" || exit /b 1
call npm test || exit /b 1
call npm start
