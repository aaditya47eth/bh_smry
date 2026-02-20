@echo off
echo ==========================================
echo      Facebook Auction Scraper Setup
echo ==========================================
echo.

:: Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b
)

:: Check if node_modules exists, if not install
if not exist "node_modules" (
    echo [INFO] First time setup: Installing dependencies...
    echo This may take a few minutes.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b
    )
    echo [INFO] Dependencies installed.
)

:: Check for .env file
if not exist ".env" (
    echo [WARNING] .env file not found!
    echo Please create a .env file with your Supabase credentials.
    echo You can copy env.sample to .env and edit it.
    pause
    exit /b
)

echo.
echo [INFO] Starting Scraper...
echo Keep this window OPEN while you want the scraper to run.
echo.

node server-supabase.js

pause
