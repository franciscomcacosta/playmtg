@echo off
rem Builds the website and uploads it to Cloudflare Pages (see HOSTING.md, step 4).
rem The game server address is read from .env.production (VITE_SERVER_URL=https://...).
cd /d "%~dp0"
if not exist .env.production (
  echo Create .env.production with:  VITE_SERVER_URL=https://api.playmtg.online
  pause
  exit /b 1
)
call npm run build
call npx wrangler pages deploy dist --project-name playmtg --branch production --commit-dirty=true
pause
