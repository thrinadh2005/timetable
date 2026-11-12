@echo off
setlocal EnableDelayedExpansion

title GMRITDU Timetable Management System
cd /d "%~dp0"

echo ================================================================
echo    GMRITDU TIMETABLE MANAGEMENT SYSTEM - STARTUP LAUNCHER
echo ================================================================
echo.

:: 1. Verify Node.js Environment
where node >nul 2>&1
if errorlevel 1 goto :NoNode

:: 2. Verify and Install Dependencies if Missing
if not exist "node_modules\" goto :InstallDeps
goto :CheckEnv

:InstallDeps
echo [SETUP] First-time setup detected: Installing required dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto :NpmFail
echo [OK] Dependencies installed successfully.
echo.

:CheckEnv
if exist ".env" goto :Ready
echo [SETUP] Creating default .env configuration file...
(
echo PORT=3000
echo NODE_ENV=production
echo JWT_SECRET=gmritdu_production_secret_key_2026_autonomous
echo PG_ENGINE=pglite
echo DATABASE_URL=pglite://./data/gmritdu-pg
echo ENABLE_STATIC_CACHE=true
) > .env

:Ready
echo System Configuration:
echo   - Platform: Node.js Web Server
echo   - Local Portal URL: http://localhost:3000
echo   - Health Endpoint:  http://localhost:3000/api/v1/health
echo   - Database Engine:  PostgreSQL / PGlite at ./data/gmritdu-pg
echo.
echo Institutional Authentication Access:
echo   - Role accounts are managed inside the Users Directory after deployment.
echo   - Schools, departments, staff, and schedules are configurable live per login role.
echo.
echo Starting GMRITDU server process...
echo Press CTRL+C in this terminal window to stop the server at any time.
echo ================================================================
echo.

:: 3. Build Frontend Bundle
echo [BUILD] Synchronizing modern frontend bundle...
call npm run build:frontend

:: Launch default web browser in background after 2 seconds
start /b cmd /c "ping 127.0.0.1 -n 3 >nul & start http://localhost:3000"

node server.js

if errorlevel 1 (
    echo.
    echo [WARNING] Server stopped with exit code %ERRORLEVEL%.
    pause
)
goto :eof

:NoNode
echo [ERROR] Node.js is not detected on your system PATH.
echo Please install Node.js LTS from https://nodejs.org
echo.
pause
exit /b 1

:NpmFail
echo [ERROR] Failed to install npm dependencies.
pause
exit /b 1
