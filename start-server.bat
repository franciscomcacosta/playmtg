@echo off
rem Starts the PlayMTG game server on this PC (http://localhost:8787).
rem Keep this window open while people play.
cd /d "%~dp0"
if exist .git (
  echo Getting the latest version from GitHub...
  git pull --ff-only
)
echo Checking packages...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
if not exist data\cards.json call npm run cards
if errorlevel 1 goto failed
echo Building the website...
call npm run build
if errorlevel 1 goto failed
call npm start
pause
exit /b 0
:failed
echo.
echo Something went wrong above. Send a screenshot of this window.
pause
exit /b 1
