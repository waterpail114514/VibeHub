@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 🔮 Starting VibeHub Server in background...
start /b "" node src/index.js
timeout /t 3 /nobreak >nul

curl -s http://localhost:3456/api/health >nul 2>&1
if %errorlevel%==0 (
  echo ✅ Server running on http://localhost:3456
) else (
  echo ❌ Server may have failed to start, check console
)

echo.
echo To stop: taskkill /F /FI "WINDOWTITLE eq VibeHub*"
pause
