@echo off
rem Builds the unsigned Windows installer (Squirrel) into dist\squirrel-windows.
cd /d "%~dp0"
if not exist node_modules call "%~dp0download-dependencies.bat" || exit /b 1
call npm test || exit /b 1
node scripts\stamp-build.mjs || exit /b 1
node scripts\changelog.mjs
call npm run dist:win || exit /b 1
echo Installer written to dist\squirrel-windows. It is not code signed.
