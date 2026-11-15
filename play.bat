@echo off
rem Double-click to play: starts the local server and opens the game in your browser.
rem Keep this window open while you play; close it to stop the server.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on the PATH. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
start "" "http://localhost:5173/"
node tools\serve.mjs 5173
pause
