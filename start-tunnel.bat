@echo off
rem Publishes this PC's game server as https://api.playmtg.online through Cloudflare Tunnel.
rem Keep this window open while people play.
cd /d "%~dp0"
cloudflared tunnel --config "%~dp0cloudflared\config.yml" run playmtg
pause
