@echo off
rem Starts Manaforge: game server on :8787 and the client on http://localhost:5173
cd /d "%~dp0"
title Manaforge
call npm run dev
pause
