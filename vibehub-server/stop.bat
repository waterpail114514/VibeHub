@echo off
chcp 65001 >nul
echo Stopping VibeHub Server...
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq node.exe" /FO TABLE ^| findstr "node.exe"') do (
  taskkill /F /PID %%i >nul 2>&1
)
echo Done.
timeout /t 2 /nobreak >nul
