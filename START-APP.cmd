@echo off
REM ===== Doc-to-Audio one-click launcher =====
REM Double-click this file to start the databases and both apps,
REM then it opens the app in your browser.

setlocal
set "PATH=C:\Program Files\nodejs;C:\Users\shale\AppData\Roaming\npm;C:\Program Files\Tesseract-OCR;C:\Program Files\GraphicsMagick-1.3.45-Q16;C:\Program Files\gs\gs10.03.1\bin;C:\Users\shale\doc-to-audio-services\ffmpeg\bin;%PATH%"
set "SVC=C:\Users\shale\doc-to-audio-services"
set "ROOT=%~dp0"

echo Starting Redis...
start "doc2audio-redis" /min "%SVC%\redis\redis-server.exe" --port 6379 --bind 127.0.0.1

echo Starting PostgreSQL...
"%SVC%\pgsql\bin\pg_ctl.exe" -D "%SVC%\pgdata" -l "%SVC%\pg.log" -o "-p 5432" start

REM Give PostgreSQL a moment to accept connections, then bring the database
REM up to date. The Gemini-key feature adds two columns to the User table; without
REM this step, login fails on an older database. Safe to run on every launch.
timeout /t 4 >nul
echo Updating database schema...
call pnpm --filter @doc-to-audio/types build
call pnpm --filter @doc-to-audio/api db:generate
call pnpm --filter @doc-to-audio/api db:push
if errorlevel 1 (
  echo.
  echo WARNING: the database update failed. If an old "doc2audio-api" window is still
  echo open, close it and run this file again.
  echo.
)

echo Starting API server...
start "doc2audio-api" /min cmd /c "cd /d "%ROOT%" && pnpm --filter @doc-to-audio/api dev"

echo Starting Web app...
start "doc2audio-web" /min cmd /c "cd /d "%ROOT%" && pnpm --filter @doc-to-audio/web dev"

echo.
echo Waiting for the apps to warm up...
timeout /t 18 >nul
start "" http://localhost:3000

REM ===== ngrok tunnel (remote access from any device) =====
REM One-time setup required before this works:
REM   1. winget install ngrok
REM   2. Sign up free at https://ngrok.com
REM   3. ngrok config add-authtoken YOUR_TOKEN
REM   4. Claim a free static domain at ngrok.com/dashboard/domains
REM   5. Replace YOUR_STATIC_DOMAIN below with your domain name
REM
REM Uncomment the line below once setup is complete:
REM start "doc2audio-ngrok" /min ngrok http 3000 --domain=YOUR_STATIC_DOMAIN.ngrok-free.app

echo.
echo Done. The app should open at http://localhost:3000
echo (You can close this window.)
pause
