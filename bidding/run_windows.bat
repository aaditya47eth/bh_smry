@echo off
setlocal
title BH Auction Scraper

:: --- CONFIGURATION ---
:: Set the path to Chrome if not found automatically
set "CHROME_PATH="

:: Try to detect Chrome automatically
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else (
    echo [WARNING] Could not find Google Chrome automatically.
    echo Please ensure Chrome is installed or edit this script to set CHROME_PATH.
)

:: Set Environment Variables for the session
set "CHROME_EXEC_PATH=%CHROME_PATH%"
set "HEADLESS=false"

:: Switch to the script directory
cd /d "%~dp0"

echo ==========================================
echo      BH AUCTION SCRAPER - CLIENT MODE
echo ==========================================
echo.
echo Chrome Path: %CHROME_PATH%
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "node.exe" (
        echo Using local node.exe...
        set "PATH=%~dp0;%PATH%"
    ) else (
        echo [ERROR] Node.js is not installed and node.exe was not found in this folder.
        echo Please install Node.js or place node.exe here.
        pause
        exit /b
    )
)

:: Check for node_modules
if not exist "node_modules" (
    echo [INFO] First run detected. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b
    )
    echo Dependencies installed.
    echo.
)

:MENU
echo Please select an option:
echo 1. Run Post Discovery (Find new posts in group)
echo 2. Run Bid Scraper (Monitor active auctions)
echo 3. Exit
echo.
set /p choice="Enter choice (1-3): "

if "%choice%"=="1" (
    cls
    echo Starting Discovery Mode...
    echo Close the browser window to stop.
    node scraper_discovery.js
    pause
    cls
    goto MENU
)

if "%choice%"=="2" (
    cls
    echo Starting Bid Monitor...
    echo Press Ctrl+C in this window to stop.
    node scraper_bids.js
    pause
    cls
    goto MENU
)

if "%choice%"=="3" (
    exit
)

echo Invalid choice.
goto MENU